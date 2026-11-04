// One small helper the pipeline agents use to "think". It asks the configured
// model for a JSON object matching a zod schema. Each agent passes a rule-based
// fallback, so the simulation keeps running with no key, on rate limits, or
// when the model returns something invalid.
//
// Provider is chosen by env:
//   LLM_PROVIDER = google | anthropic | ollama | rules   (default: auto-detect)
//   LLM_MODEL    = model id override
//   LLM_RPM      = max model calls per minute (default 12 for google, 40 otherwise)

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";

type Provider = "google" | "anthropic" | "ollama" | "rules";

// Deploy-level settings for the server-side simulation loop. It runs with no
// signed-in user, so there is no per-user credential to resolve.
type EnvName =
  | "LLM_PROVIDER"
  | "LLM_MODEL"
  | "LLM_RPM"
  | "GOOGLE_GENERATIVE_AI_API_KEY"
  | "ANTHROPIC_API_KEY";

function readEnv(name: EnvName): string | undefined {
  switch (name) {
    case "LLM_PROVIDER":
      return process.env.LLM_PROVIDER; // guard:allow-env-credential — deploy-level sim config, no user in the loop
    case "LLM_MODEL":
      return process.env.LLM_MODEL; // guard:allow-env-credential — deploy-level sim config, no user in the loop
    case "LLM_RPM":
      return process.env.LLM_RPM; // guard:allow-env-credential — deploy-level sim config, no user in the loop
    case "GOOGLE_GENERATIVE_AI_API_KEY":
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY; // guard:allow-env-credential — deploy key for the background sim agents
    case "ANTHROPIC_API_KEY":
      return process.env.ANTHROPIC_API_KEY; // guard:allow-env-credential — deploy key for the background sim agents
  }
}

function detectProvider(): Provider {
  const explicit = readEnv("LLM_PROVIDER")?.trim().toLowerCase();
  if (
    explicit === "google" ||
    explicit === "anthropic" ||
    explicit === "ollama" ||
    explicit === "rules"
  ) {
    return explicit;
  }
  if (readEnv("GOOGLE_GENERATIVE_AI_API_KEY")) return "google";
  if (readEnv("ANTHROPIC_API_KEY")) return "anthropic";
  return "rules";
}

/**
 * Models to try in order. When the first is overloaded or rate limited the
 * agents move to the next before falling back to rules. Gemini's free tier
 * counts quota per model, so a second model also doubles the headroom.
 */
const DEFAULT_MODELS: Record<Exclude<Provider, "rules">, string[]> = {
  google: ["gemini-3.1-flash-lite", "gemini-3-flash-preview"],
  anthropic: ["claude-haiku-5-5"],
  ollama: ["qwen2.5:7b"],
};

function modelIds(provider: Exclude<Provider, "rules">): string[] {
  const override = readEnv("LLM_MODEL")?.trim();
  const defaults = DEFAULT_MODELS[provider];
  return override ? [override, ...defaults.filter((m) => m !== override)] : defaults;
}

const modelCache = new Map<string, LanguageModel>();

async function modelFor(
  provider: Exclude<Provider, "rules">,
  id: string,
): Promise<LanguageModel> {
  const cached = modelCache.get(id);
  if (cached) return cached;
  let model: LanguageModel;
  if (provider === "google") model = google(id);
  else if (provider === "anthropic") model = anthropic(id);
  else {
    const { ollama } = await import("ai-sdk-ollama");
    model = ollama(id) as LanguageModel;
  }
  modelCache.set(id, model);
  return model;
}

export function llmInfo() {
  const provider = detectProvider();
  return {
    provider,
    model: provider === "rules" ? "rule-based" : modelIds(provider)[0]!,
  };
}

// --- Per-model budget and cooldown so free tiers never get hammered. --------

interface Lane {
  calls: number[];
  cooldownUntil: number;
}
const lanes = new Map<string, Lane>();

function lane(id: string): Lane {
  let l = lanes.get(id);
  if (!l) {
    l = { calls: [], cooldownUntil: 0 };
    lanes.set(id, l);
  }
  return l;
}

function rpmLimit(): number {
  const fromEnv = Number(readEnv("LLM_RPM"));
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  // Gemini free tier: 15 requests/min per model. The copilot chat shares the
  // first model, so the pipeline keeps ~5/min of it free for the supervisor.
  return detectProvider() === "google" ? 10 : 40;
}

function headroomFor(id: string): number {
  const l = lane(id);
  const cutoff = Date.now() - 60_000;
  while (l.calls.length && l.calls[0]! < cutoff) l.calls.shift();
  return rpmLimit() - l.calls.length;
}

/** Calls still available this minute across all models. */
export function llmHeadroom(): number {
  const provider = detectProvider();
  if (provider === "rules") return 0;
  return modelIds(provider).reduce((sum, id) => sum + Math.max(0, headroomFor(id)), 0);
}

/** Errors worth trying the next model for (busy, throttled, slow). */
const TRANSIENT = /quota|rate.?limit|429|exhausted|high demand|overloaded|unavailable|503|timeout|aborted/i;

export interface DecideResult<T> {
  value: T;
  /** "llm" when the model answered, "rules" when the fallback was used. */
  source: "llm" | "rules";
}

/**
 * Ask the model for a structured decision.
 * `minHeadroom` lets low-priority callers (Comms) skip the model when the
 * per-minute budget is nearly used, so Intake/Quality keep priority.
 */
export async function decide<T>(opts: {
  agent: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  fallback: () => T;
  minHeadroom?: number;
}): Promise<DecideResult<T>> {
  const provider = detectProvider();
  if (provider === "rules") return { value: opts.fallback(), source: "rules" };

  for (const id of modelIds(provider)) {
    const l = lane(id);
    if (Date.now() < l.cooldownUntil) continue;
    if (headroomFor(id) <= (opts.minHeadroom ?? 0)) continue;
    l.calls.push(Date.now());
    try {
      const result = await generateText({
        model: await modelFor(provider, id),
        system: opts.system,
        prompt: opts.prompt,
        output: Output.object({ schema: opts.schema }),
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(12_000),
      });
      const parsed = opts.schema.safeParse(result.output);
      if (parsed.success) return { value: parsed.data, source: "llm" };
      console.warn(`[city-brain] ${opts.agent}: ${id} gave invalid output, trying next`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!TRANSIENT.test(message)) {
        console.warn(`[city-brain] ${opts.agent}: ${id} failed, using rules: ${message.slice(0, 160)}`);
        break;
      }
      // Busy or throttled: rest this model (use the provider's retry hint
      // when it gives one) and try the next model straight away.
      const hint = Number(message.match(/retry in ([\d.]+)s/i)?.[1]);
      const seconds = Number.isFinite(hint)
        ? Math.min(Math.max(hint, 5), 90)
        : /quota|rate|429|exhausted/i.test(message)
          ? 30
          : 15;
      l.cooldownUntil = Date.now() + seconds * 1000;
      console.warn(`[city-brain] ${opts.agent}: ${id} busy (${message.slice(0, 60)}…), resting it ${seconds}s`);
    }
  }
  return { value: opts.fallback(), source: "rules" };
}

// The City Brain agent network. Each agent reads the situation, decides
// (LLM with a rule-based fallback) and then acts ONLY by calling the same
// defineAction() modules the supervisor UI and the copilot chat agent call.

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import assignWorker from "../../actions/assign-worker.js";
import classifyIncident from "../../actions/classify-incident.js";
import escalateIssue from "../../actions/escalate-issue.js";
import mergeDuplicate from "../../actions/merge-duplicate.js";
import notifyCitizen from "../../actions/notify-citizen.js";
import reviewFix from "../../actions/review-fix.js";
import routeIncident from "../../actions/route-incident.js";
import {
  CATEGORIES,
  CATEGORY_FOR_DEPARTMENT,
  DEPARTMENT_FOR_CATEGORY,
  DEPARTMENT_LABEL,
  DEPARTMENTS,
  MAX_JOBS_PER_WORKER,
  OPEN_STAGES,
  SEVERITIES,
  type Category,
  type DepartmentId,
  type NotifyKind,
  type Severity,
  zoneById,
  zoneDistance,
} from "../../shared/city.js";
import { getDb, schema } from "../db/index.js";
import { decide } from "./llm.js";
import {
  getDepartmentOrFail,
  type IncidentRow,
  isoIn,
  mergeFlags,
  money,
  patchIncident,
  workerLoads,
} from "./ops.js";

const zoneName = (z: number) => zoneById(z)?.name ?? `zone ${z}`;

const CITY_CONTEXT =
  "You are part of City Brain, an autonomous operations network for a simulated city with 12 zones (1 Harbor, 2 Old Town, 3 Market, 4 Riverside, 5 School District, 6 Civic Center, 7 Midtown, 8 Tech Park, 9 Hillside, 10 Greenbelt, 11 Industrial, 12 Airport Rd). Departments: roads, sanitation, electrical, water, safety. Be decisive and concise.";

// ---------------------------------------------------------------------------
// Rule-based fallbacks (also used when no LLM key is configured).

const KEYWORDS: Record<Category, string[]> = {
  road: ["pothole", "road", "pavement", "crater", "crack", "asphalt", "manhole", "sign", "crosswalk", "paving", "sinkhole", "lane", "slab", "footpath"],
  electrical: ["light", "streetlight", "wire", "wiring", "power", "electric", "spark", "transformer", "signal", "lamp"],
  water: ["water", "leak", "pipe", "hydrant", "flood", "drain", "pressure", "sewage", "burst", "bubbling"],
  sanitation: ["garbage", "trash", "rubbish", "bin", "dump", "waste", "litter", "rats", "fly-tipped", "smell", "crows", "fridge", "sofa"],
  safety: ["gas", "fire", "fence", "tree", "branch", "glass", "needle", "hazard", "unsafe", "dangerous", "fall"],
};

function ruleCategory(text: string): Category {
  const t = text.toLowerCase();
  if (/\bgas\b/.test(t)) return "safety";
  let best: Category = "road";
  let bestScore = 0;
  for (const c of CATEGORIES) {
    const score = KEYWORDS[c].filter((k) => t.includes(k)).length;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function ruleSeverity(text: string): Severity {
  const t = text.toLowerCase();
  if (/(gas|fire|sparking|live wire|collaps|kids are|injur|trapped)/.test(t)) return "emergency";
  if (/(danger|could fall|swerv|huge|massive|exposed|open hole|missing|flood|unsafe|burst)/.test(t)) return "high";
  if (/(faded|paint|graffiti|minor|peeling|wobble)/.test(t)) return "low";
  return "medium";
}

function ruleTitle(text: string): string {
  const words = text.replace(/[^\w\s'-]/g, "").split(/\s+/).slice(0, 7);
  const title = words.join(" ");
  return title.charAt(0).toUpperCase() + title.slice(1);
}

const STOP = new Set(["the", "a", "on", "in", "of", "and", "is", "my", "there", "near", "outside", "it", "to", "at", "has", "big", "huge"]);
function tokens(s: string) {
  return new Set(
    s.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

// ---------------------------------------------------------------------------
// 1. Intake agent: classify + deduplicate.

export async function runIntake(incident: IncidentRow) {
  const open = await getDb()
    .select({
      id: schema.incidents.id,
      title: schema.incidents.title,
      zone: schema.incidents.zone,
      category: schema.incidents.category,
    })
    .from(schema.incidents)
    .where(inArray(schema.incidents.stage, OPEN_STAGES));
  const nearby = open
    .filter((o) => o.id !== incident.id && o.category && zoneDistance(o.zone, incident.zone) <= 1)
    .slice(0, 12);

  const fallback = () => {
    const category = ruleCategory(incident.description);
    const mine = tokens(incident.description);
    const dup = nearby.find(
      (o) =>
        o.zone === incident.zone &&
        o.category === category &&
        [...tokens(o.title)].filter((w) => mine.has(w)).length >= 2,
    );
    return {
      title: ruleTitle(incident.description),
      category,
      severity: ruleSeverity(incident.description),
      duplicateOf: dup?.id ?? null,
      reasoning: dup
        ? `Same ${category} problem as ${dup.id} in the same zone.`
        : `Keywords point to a ${category} issue.`,
    };
  };

  const { value } = await decide({
    agent: "intake",
    system: `${CITY_CONTEXT}
You are the INTAKE agent. Turn a messy citizen report into a structured incident.
- category: road (potholes, pavement, signs, manholes), sanitation (garbage, dumping, smells, pests), electrical (street/traffic lights, wires, power), water (leaks, pipes, hydrants, flooding, drains, sewage, pressure), safety (gas, fire, fallen trees, fences, sharp objects, hazards to people).
- severity: emergency = immediate risk to life (gas leak, live wires, fire, people trapped); high = likely injury or major disruption soon; medium = normal repair; low = cosmetic/minor.
- title: max 8 words, specific, include the street/place if given.
- duplicateOf: the id of an open incident that is clearly the SAME physical problem (same place, same issue), otherwise null. Be conservative.`,
    prompt: `New report (zone ${incident.zone} ${zoneName(incident.zone)}): "${incident.description}"

Open incidents nearby:
${nearby.length ? nearby.map((o) => `- ${o.id} [zone ${o.zone}, ${o.category}] ${o.title}`).join("\n") : "(none)"}`,
    schema: z.object({
      title: z.string().min(3).max(80),
      category: z.enum(CATEGORIES),
      severity: z.enum(SEVERITIES),
      duplicateOf: z.string().nullable(),
      reasoning: z.string().max(300),
    }),
    fallback,
  });

  const dup = value.duplicateOf
    ? nearby.find((o) => o.id === value.duplicateOf?.toUpperCase())
    : undefined;
  if (dup) {
    await mergeDuplicate.run({
      incidentId: incident.id,
      duplicateOf: dup.id,
      note: value.reasoning,
      actor: "intake",
    });
    return;
  }
  await classifyIncident.run({
    incidentId: incident.id,
    category: value.category,
    severity: value.severity,
    title: value.title.slice(0, 80),
    note: value.reasoning,
    actor: "intake",
  });
}

// ---------------------------------------------------------------------------
// 2. Router agent: pick the owning department(s).

export async function runRouter(incident: IncidentRow) {
  const category = (incident.category ?? "road") as Category;
  const primary = DEPARTMENT_FOR_CATEGORY[category];

  const fallback = () => {
    const t = incident.description.toLowerCase();
    const extra: DepartmentId[] = [];
    if (primary !== "water" && /(flood|water|drain|bubbling|leak)/.test(t)) extra.push("water");
    if (primary !== "roads" && /(road|lane|pavement|crater)/.test(t) && category === "water") extra.push("roads");
    if (primary !== "safety" && /(spark|exposed|gas|danger)/.test(t)) extra.push("safety");
    if (primary !== "electrical" && /(spark|wire|transformer)/.test(t) && category === "safety") extra.push("electrical");
    return {
      departments: [primary, ...extra].slice(0, 2),
      reasoning: extra.length
        ? `Crosses ${[primary, ...extra].map((d) => DEPARTMENT_LABEL[d]).join(" and ")}.`
        : `${DEPARTMENT_LABEL[primary]} owns ${category} issues.`,
    };
  };

  const { value } = await decide({
    agent: "router",
    system: `${CITY_CONTEXT}
You are the ROUTER agent. Decide which department leads the fix (first) and whether a second department must also be involved (e.g. a flooded road blocking a drain = water + roads; sparking exposed wires = electrical + safety). Only add a second department when it is clearly needed.`,
    prompt: `Incident ${incident.id}: ${incident.title}
Category: ${category}, severity: ${incident.severity}
Report: "${incident.description}"`,
    schema: z.object({
      departments: z.array(z.enum(DEPARTMENTS)).min(1).max(2),
      reasoning: z.string().max(200),
    }),
    fallback,
    minHeadroom: 3,
  });

  // The lead must be able to staff the category; keep the category's owner first.
  const departments = [primary, ...value.departments.filter((d) => d !== primary)].slice(0, 2);
  await routeIncident.run({
    incidentId: incident.id,
    departmentIds: departments,
    note: departments.length > 1 ? value.reasoning : undefined,
    actor: "router",
  });
}

// ---------------------------------------------------------------------------
// 3. Department agent: staff the job or escalate. Pure rules (fast, predictable).

async function escalationText(
  incident: IncidentRow,
  reason: "emergency" | "budget" | "no_workers",
  facts: string,
  fallback: { summary: string; recommendation: string },
) {
  const { value } = await decide({
    agent: "department-escalation",
    system: `${CITY_CONTEXT}
You are a DEPARTMENT agent escalating to the human city supervisor a decision you are not allowed to make alone. Write a one-sentence summary of the problem and a one-sentence concrete recommendation the supervisor can approve with one click. Use the facts given; do not invent numbers.`,
    prompt: `Reason: ${reason}
Incident ${incident.id}: ${incident.title} (zone ${incident.zone} ${zoneName(incident.zone)}, ${incident.severity})
Facts: ${facts}
Default recommendation if approved: ${fallback.recommendation}`,
    schema: z.object({
      summary: z.string().min(5).max(300),
      recommendation: z.string().min(5).max(300),
    }),
    fallback: () => fallback,
    minHeadroom: 2,
  });
  await escalateIssue.run({
    incidentId: incident.id,
    reason,
    summary: value.summary,
    recommendation: value.recommendation,
    actor: "department",
  });
}

export async function runDepartment(incident: IncidentRow) {
  const lead = (incident.departmentIds[0] ?? "roads") as DepartmentId;
  const dept = await getDepartmentOrFail(lead);
  const skill = CATEGORY_FOR_DEPARTMENT[lead];
  const flags = incident.simFlags ?? {};
  // An approved emergency keeps its priority through reassignments.
  const priority = Boolean(flags.priority || flags.emergencyApproved);

  const workers = await getDb().select().from(schema.workers);
  const loads = await workerLoads();
  const skilled = workers.filter((w) => w.skills.includes(skill));
  const fresh = skilled.filter((w) => !(flags.excludeWorkers ?? []).includes(w.id));
  const score = (w: (typeof workers)[number]) =>
    zoneDistance(w.currentZone, incident.zone) * 2 + (loads.get(w.id) ?? 0) * 3;
  const byScore = (list: typeof workers) => [...list].sort((a, b) => score(a) - score(b));

  if (incident.severity === "emergency" && !priority) {
    const nearest = byScore(fresh.length ? fresh : skilled)[0];
    await escalationText(
      incident,
      "emergency",
      `Possible risk to life. Nearest qualified worker: ${nearest?.name ?? "none"} (${nearest ? zoneDistance(nearest.currentZone, incident.zone) : "?"} zones away, ${nearest ? (loads.get(nearest.id) ?? 0) : 0} open jobs).`,
      {
        summary: `Emergency in ${zoneName(incident.zone)}: ${incident.title}. Dispatch may require pulling a worker off another job.`,
        recommendation: `Dispatch ${nearest?.name ?? "the nearest worker"} immediately, ignoring job limits, and keep the area clear until they arrive.`,
      },
    );
    return;
  }

  let pool = fresh.filter((w) => (loads.get(w.id) ?? 0) < MAX_JOBS_PER_WORKER);
  if (!pool.length && priority) pool = fresh.length ? fresh : skilled;
  if (!pool.length) {
    const leastLoaded = byScore(fresh.length ? fresh : skilled)[0];
    await escalationText(
      incident,
      "no_workers",
      `All ${skilled.length} ${skill} workers are at capacity or already failed this job.`,
      {
        summary: `No ${skill} worker is free for ${incident.id} (${incident.title}).`,
        recommendation: `Approve overtime so ${leastLoaded?.name ?? "the least busy worker"} takes it as a third job.`,
      },
    );
    return;
  }

  const cost = incident.estCost ?? 0;
  if (!flags.charged && dept.budgetRemaining < cost && !priority) {
    // One budget decision per department at a time: hold this job until the
    // supervisor answers the open one instead of flooding the inbox.
    const pending = await getDb()
      .select({ incidentId: schema.escalations.incidentId })
      .from(schema.escalations)
      .where(
        and(
          eq(schema.escalations.status, "open"),
          eq(schema.escalations.reason, "budget"),
        ),
      );
    if (pending.length) {
      const leads = await getDb()
        .select({ id: schema.incidents.id, departmentIds: schema.incidents.departmentIds })
        .from(schema.incidents)
        .where(inArray(schema.incidents.id, pending.map((p) => p.incidentId)));
      if (leads.some((l) => l.departmentIds[0] === lead)) {
        await patchIncident(incident.id, {
          simFlags: mergeFlags(incident, { waitUntil: isoIn(10) }),
        });
        return;
      }
    }
    await escalationText(
      incident,
      "budget",
      `${dept.name} has ${money(dept.budgetRemaining)} left of ${money(dept.budgetTotal)}; this ${incident.severity} repair is estimated at ${money(cost)}.`,
      {
        summary: `${dept.name} budget is too low for ${incident.id}: ${money(dept.budgetRemaining)} left, repair needs ${money(cost)}.`,
        recommendation: `Release $15,000 from the city contingency fund to ${dept.name} so ${incident.title.toLowerCase()} is fixed today.`,
      },
    );
    return;
  }

  const best = byScore(pool)[0]!;
  await assignWorker.run({
    incidentId: incident.id,
    workerId: best.id,
    allowOverCapacity: priority,
    allowOverBudget: priority,
    note: priority ? "supervisor-approved priority dispatch" : undefined,
    actor: "department",
  });
}

// ---------------------------------------------------------------------------
// 5. Quality agent: was the fix adequate?

export async function runQuality(incident: IncidentRow) {
  const report = incident.workerReport ?? "";
  const fallback = () => {
    const weak = /(for now|later|ran out|didn't|did not|still|just a cone|put a cone|tape|temporar|two of the)/i.test(report);
    return {
      verdict: weak ? ("fail" as const) : ("pass" as const),
      reasoning: weak
        ? "Report describes a temporary or partial fix."
        : "Report describes a complete, permanent fix.",
    };
  };
  const { value } = await decide({
    agent: "quality",
    system: `${CITY_CONTEXT}
You are the QUALITY agent. Judge whether a field worker's completion report shows the reported problem was actually fixed on site.
- PASS when the report describes a complete repair or clean-up of the reported problem.
- FAIL only when the work is clearly temporary ("for now", "will need ... later"), partial ("two of the four", "ran out of time"), cosmetic, or the problem may still be there ("still dripping", "didn't find the cause").
- Do not demand city-wide policy changes, extra pickups or prevention work; judge this one job.
Reasoning: one short sentence.`,
    prompt: `Incident ${incident.id}: ${incident.title} (${incident.category}, ${incident.severity})
Citizen report: "${incident.description}"
Worker completion report: "${report}"`,
    schema: z.object({
      verdict: z.enum(["pass", "fail"]),
      reasoning: z.string().min(3).max(300),
    }),
    fallback,
  });
  await reviewFix.run({
    incidentId: incident.id,
    verdict: value.verdict,
    note: value.reasoning,
    actor: "quality",
  });
}

// ---------------------------------------------------------------------------
// 6. Comms agent: plain-language citizen updates.

export async function runComms(
  incident: IncidentRow,
  kind: NotifyKind,
  workerName: string | null,
) {
  const name = incident.citizenName === "Anonymous" ? "there" : incident.citizenName;
  const what = incident.title;
  const eta = incident.etaAt
    ? `about ${Math.max(1, Math.round((Date.parse(incident.etaAt) - Date.now()) / 1000))} seconds`
    : null;
  const templates: Record<NotifyKind, string> = {
    received: `Hi ${name}, we got your report about "${what}" and it's now with the right team. We'll keep you posted.`,
    assigned: `${workerName ?? "A crew member"} has been assigned to "${what}" and is on the way.`,
    working: `${workerName ?? "Our crew"} is on site fixing "${what}" right now.`,
    resolved: `Good news ${name}: "${what}" is fixed. Thank you for helping keep the city running!`,
    delayed: `Sorry ${name}, "${what}" is taking longer than we promised. It's still a priority and we'll update you as soon as the crew is done.`,
    reopened: `Our quality check wasn't happy with the first fix for "${what}", so we're sending a different crew to do it properly.`,
    update: incident.stage === "merged"
      ? `Thanks ${name}! Someone already reported this (${incident.duplicateOf}) and a crew is on it — your report bumps its priority.`
      : `Update on "${what}": the supervisor has deferred this job. ${incident.resolution ?? ""}`.trim(),
  };

  const { value } = await decide({
    agent: "comms",
    system: `${CITY_CONTEXT}
You are the COMMS agent. Write one SMS (max 2 short sentences, under 220 characters) to the citizen who reported a problem. Warm, plain, human language — never bureaucratic, no ticket jargon, no emojis. Never promise exact times you were not given.`,
    prompt: `Update type: ${kind}
Citizen first name: ${name}
Problem: ${what} (zone ${zoneName(incident.zone)})
Worker: ${workerName ?? "n/a"}${eta ? `\nWorker ETA: ${eta}` : ""}${incident.qualityNote && kind === "reopened" ? `\nWhy reopened: ${incident.qualityNote}` : ""}${incident.duplicateOf ? `\nAlready tracked as: ${incident.duplicateOf}` : ""}
Reference wording (rewrite it naturally in your own words, keep the facts): "${templates[kind]}"`,
    schema: z.object({ message: z.string().min(5).max(320) }),
    fallback: () => ({ message: templates[kind] }),
    minHeadroom: 5,
  });

  await notifyCitizen.run({
    incidentId: incident.id,
    kind,
    message: value.message.slice(0, 320),
    actor: "comms",
  });
}

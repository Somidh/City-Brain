// Shared helpers used by the actions in /actions. Actions stay deterministic:
// agents decide (server/city/agents.ts), actions validate and write.

import { fail } from "@agent-native/core/action";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
  ACTOR_META,
  type Actor,
  type Stage,
} from "../../shared/city.js";
import { getDb, schema } from "../db/index.js";
import type { SimFlags } from "../db/schema.js";

export const nowIso = () => new Date().toISOString();
export const isoIn = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toISOString();

/** Action context shape we rely on (subset of the framework's ctx). */
export interface CallerCtx {
  caller?: string;
}

/**
 * Who is calling. The copilot chat agent, the supervisor's browser, the CLI,
 * or one of the pipeline agents (which call `action.run()` and pass `actor`).
 */
export function resolveActor(
  ctx: CallerCtx | undefined,
  requested: Actor | undefined,
  fallback: Actor = "supervisor",
): Actor {
  if (ctx?.caller === "tool") return "copilot";
  if (ctx?.caller === "frontend") {
    return requested === "citizen" ? "citizen" : "supervisor";
  }
  return requested ?? fallback;
}

export function actorName(actor: Actor, detail?: string | null): string {
  const base = ACTOR_META[actor].name;
  return detail ? `${detail} (${base})` : base;
}

export async function logActivity(entry: {
  actor: Actor;
  actorDetail?: string | null | undefined;
  actionName: string;
  message: string;
  incidentId?: string | null | undefined;
}) {
  await getDb()
    .insert(schema.activity)
    .values({
      id: crypto.randomUUID(),
      actor: entry.actor,
      actorName: actorName(entry.actor, entry.actorDetail),
      actionName: entry.actionName,
      message: entry.message,
      incidentId: entry.incidentId ?? null,
      at: nowIso(),
    });
}

export type IncidentRow = typeof schema.incidents.$inferSelect;
export type WorkerRow = typeof schema.workers.$inferSelect;
export type DepartmentRow = typeof schema.departments.$inferSelect;

export async function getIncidentOrFail(id: string): Promise<IncidentRow> {
  const [row] = await getDb()
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.id, id.toUpperCase()))
    .limit(1);
  if (!row) {
    fail(`Incident ${id} not found.`, {
      errorCode: "not_found",
      statusCode: 404,
    });
  }
  return row;
}

export function requireStage(incident: IncidentRow, allowed: Stage[]) {
  if (!allowed.includes(incident.stage as Stage)) {
    fail(
      `${incident.id} is "${incident.stage}", expected ${allowed.join(" or ")}.`,
      { errorCode: "wrong_stage", statusCode: 409 },
    );
  }
}

export async function patchIncident(
  id: string,
  patch: Partial<Omit<IncidentRow, "id">>,
) {
  await getDb()
    .update(schema.incidents)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(schema.incidents.id, id));
}

export function mergeFlags(
  incident: IncidentRow,
  patch: Partial<SimFlags>,
): SimFlags {
  return { ...(incident.simFlags ?? {}), ...patch };
}

export async function getWorkerOrFail(id: string): Promise<WorkerRow> {
  const [row] = await getDb()
    .select()
    .from(schema.workers)
    .where(eq(schema.workers.id, id))
    .limit(1);
  if (!row) {
    fail(`Worker ${id} not found.`, {
      errorCode: "not_found",
      statusCode: 404,
    });
  }
  return row;
}

export async function getDepartmentOrFail(id: string): Promise<DepartmentRow> {
  const [row] = await getDb()
    .select()
    .from(schema.departments)
    .where(eq(schema.departments.id, id))
    .limit(1);
  if (!row) {
    fail(`Department ${id} not found.`, {
      errorCode: "not_found",
      statusCode: 404,
    });
  }
  return row;
}

export const ACTIVE_JOB_STAGES: Stage[] = ["assigned", "travelling", "working"];

/** Open jobs per worker id. */
export async function workerLoads(): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ workerId: schema.incidents.workerId })
    .from(schema.incidents)
    .where(inArray(schema.incidents.stage, ACTIVE_JOB_STAGES));
  const loads = new Map<string, number>();
  for (const r of rows) {
    if (r.workerId) loads.set(r.workerId, (loads.get(r.workerId) ?? 0) + 1);
  }
  return loads;
}

export async function openEscalationFor(incidentId: string) {
  const [row] = await getDb()
    .select()
    .from(schema.escalations)
    .where(
      and(
        eq(schema.escalations.incidentId, incidentId),
        eq(schema.escalations.status, "open"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function nextIncidentId(): Promise<{ id: string; seq: number }> {
  const [state] = await getDb()
    .update(schema.simState)
    .set({ nextSeq: sql`${schema.simState.nextSeq} + 1` })
    .where(eq(schema.simState.id, "main"))
    .returning({ nextSeq: schema.simState.nextSeq });
  if (!state) {
    fail("The city is not initialised yet. Run reset-simulation.", {
      errorCode: "not_initialised",
      statusCode: 409,
    });
  }
  const seq = state.nextSeq - 1;
  return { id: `INC-${String(seq).padStart(3, "0")}`, seq };
}

export const money = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

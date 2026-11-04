// The simulation heartbeat. Every second it:
//  1. fires scripted demo reports and background citizen reports,
//  2. advances field-worker timers (travel -> on site -> done / blocked),
//  3. hands each incident to the agent that owns its current stage,
//  4. lets Comms tell citizens about every change, and flags missed deadlines.
// Everything it changes goes through the shared actions.

import { eq } from "drizzle-orm";

import completeJob from "../../actions/complete-job.js";
import reportBlocked from "../../actions/report-blocked.js";
import submitReport from "../../actions/submit-report.js";
import updateJobStatus from "../../actions/update-job-status.js";
import type { NotifyKind, Stage } from "../../shared/city.js";
import { ZONES } from "../../shared/city.js";
import { getDb, schema } from "../db/index.js";
import {
  runComms,
  runDepartment,
  runIntake,
  runQuality,
  runRouter,
} from "./agents.js";
import { type IncidentRow, nowIso, patchIncident } from "./ops.js";
import {
  AUTO_REPORTS,
  BLOCKED_REASON,
  DEMO_SCRIPT,
  resetCity,
  workerReportFor,
} from "./seed.js";

const inFlight = new Set<string>();
/** Messages already handed to Comms (`${incidentId}:${kind}`); avoids repeats across ticks. */
const notified = new Set<string>();
const MAX_PARALLEL_AGENTS = 3;
let ticking = false;
let seeded = false;

function launch(key: string, label: string, job: () => unknown) {
  if (inFlight.has(key)) return;
  const agentJobs = [...inFlight].filter((k) => !k.endsWith(":fast")).length;
  if (!key.endsWith(":fast") && agentJobs >= MAX_PARALLEL_AGENTS) return;
  inFlight.add(key);
  Promise.resolve()
    .then(job)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      // Expected races (e.g. stage moved on) just retry next tick.
      console.warn(`[city-brain] ${label} skipped: ${message}`);
    })
    .finally(() => inFlight.delete(key));
}

/** Re-read the incident right before an agent acts, so stale ticks never act twice. */
function whenStill(
  id: string,
  stage: Stage,
  agent: (incident: IncidentRow) => Promise<unknown>,
) {
  return async () => {
    const [fresh] = await getDb()
      .select()
      .from(schema.incidents)
      .where(eq(schema.incidents.id, id))
      .limit(1);
    if (fresh && fresh.stage === stage) await agent(fresh);
  };
}

function desiredNotification(i: IncidentRow): NotifyKind | null {
  switch (i.stage as Stage) {
    case "classified":
    case "routed":
      return i.reopenCount > 0 ? "reopened" : "received";
    case "assigned":
    case "travelling":
      return "assigned";
    case "working":
      return "working";
    case "resolved":
      return "resolved";
    case "merged":
    case "closed":
      return "update";
    default:
      return null;
  }
}

async function ensureSeeded() {
  if (seeded) return true;
  const [state] = await getDb().select().from(schema.simState).limit(1);
  if (!state) {
    await resetCity();
    console.log("[city-brain] seeded a fresh city");
  }
  seeded = true;
  return true;
}

export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await ensureSeeded();
    const db = getDb();
    const [state] = await db.select().from(schema.simState).limit(1);
    if (!state || !state.running) return;
    const now = Date.now();

    // 1a. Scripted demo moments.
    const startedMs = Date.parse(state.startedAt);
    const next = DEMO_SCRIPT[state.scriptIndex];
    if (next && now >= startedMs + next.atSec * 1000) {
      await db
        .update(schema.simState)
        .set({ scriptIndex: state.scriptIndex + 1 })
        .where(eq(schema.simState.id, "main"));
      const created = await submitReport.run({
        description: next.description,
        zone: next.zone,
        citizenName: next.citizen,
        actor: "citizen",
      });
      if (next.flags) {
        await patchIncident(created.id, { simFlags: next.flags });
      }
    }

    // 1b. Background citizen reports.
    const lastAuto = state.lastAutoAt ? Date.parse(state.lastAutoAt) : 0;
    if (state.autoReports && now >= lastAuto + state.autoIntervalSec * 1000) {
      await db
        .update(schema.simState)
        .set({ lastAutoAt: nowIso() })
        .where(eq(schema.simState.id, "main"));
      const pick = AUTO_REPORTS[Math.floor(Math.random() * AUTO_REPORTS.length)]!;
      const zone = ZONES[Math.floor(Math.random() * ZONES.length)]!.id;
      const created = await submitReport.run({
        description: pick.description,
        zone,
        citizenName: pick.citizen,
        actor: "citizen",
      });
      // ~1 in 6 background jobs gets a sloppy first fix.
      if (Math.random() < 0.17) {
        await patchIncident(created.id, { simFlags: { badFix: true } });
      }
    }

    // 2-4. Walk every incident.
    const incidents = await db.select().from(schema.incidents);
    const sent = new Set(
      (
        await db
          .select({
            incidentId: schema.notifications.incidentId,
            stage: schema.notifications.stage,
          })
          .from(schema.notifications)
      ).map((n) => `${n.incidentId}:${n.stage}`),
    );
    const workers = new Map(
      (await db.select().from(schema.workers)).map((w) => [w.id, w]),
    );

    for (const inc of incidents) {
      const flags = inc.simFlags ?? {};
      switch (inc.stage as Stage) {
        case "reported":
          launch(inc.id, `intake ${inc.id}`, whenStill(inc.id, "reported", runIntake));
          break;
        case "classified":
          launch(inc.id, `router ${inc.id}`, whenStill(inc.id, "classified", runRouter));
          break;
        case "routed":
          if (flags.waitUntil && Date.parse(flags.waitUntil) > now) break;
          launch(inc.id, `department ${inc.id}`, whenStill(inc.id, "routed", runDepartment));
          break;
        case "assigned":
          if (now - Date.parse(inc.updatedAt) >= 2000) {
            launch(`${inc.id}:fast`, `worker ${inc.id}`, () =>
              updateJobStatus.run({ incidentId: inc.id, status: "travelling", actor: "worker" }),
            );
          }
          break;
        case "travelling":
          if (inc.etaAt && Date.parse(inc.etaAt) <= now) {
            launch(`${inc.id}:fast`, `worker ${inc.id}`, () =>
              updateJobStatus.run({ incidentId: inc.id, status: "working", actor: "worker" }),
            );
          }
          break;
        case "working":
          if (inc.workEndsAt && Date.parse(inc.workEndsAt) <= now) {
            const category = inc.category ?? "road";
            if (flags.blocked) {
              launch(`${inc.id}:fast`, `worker ${inc.id}`, () =>
                reportBlocked.run({
                  incidentId: inc.id,
                  reason: BLOCKED_REASON[category] ?? "needs a specialist crew",
                  actor: "worker",
                }),
              );
            } else {
              launch(`${inc.id}:fast`, `worker ${inc.id}`, () =>
                completeJob.run({
                  incidentId: inc.id,
                  report: workerReportFor(category, !flags.badFix),
                  actor: "worker",
                }),
              );
            }
          }
          break;
        case "review":
          launch(inc.id, `quality ${inc.id}`, whenStill(inc.id, "review", runQuality));
          break;
        default:
          break;
      }

      // Comms: one message per stage change.
      const kind = desiredNotification(inc);
      const key = `${inc.id}:${kind}`;
      if (kind && !sent.has(key) && !notified.has(key) && !inFlight.has(`${inc.id}:comms`)) {
        const workerName = inc.workerId ? (workers.get(inc.workerId)?.name ?? null) : null;
        notified.add(key);
        launch(`${inc.id}:comms`, `comms ${inc.id}`, () =>
          runComms(inc, kind, workerName).catch((error) => {
            notified.delete(key); // let it retry next tick
            throw error;
          }),
        );
      }

      // Deadline watch: apologise once with a new ETA.
      const active = ["routed", "assigned", "travelling", "working"].includes(inc.stage);
      if (
        active &&
        inc.deadlineAt &&
        Date.parse(inc.deadlineAt) < now &&
        !inc.delayNotified &&
        !sent.has(`${inc.id}:delayed`) &&
        !notified.has(`${inc.id}:delayed`) &&
        !inFlight.has(`${inc.id}:comms`)
      ) {
        notified.add(`${inc.id}:delayed`);
        launch(`${inc.id}:comms`, `comms ${inc.id}`, () => runComms(inc, "delayed", null));
      }
    }
  } catch (error) {
    console.warn(
      "[city-brain] tick failed:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    ticking = false;
  }
}

/** Used by reset-simulation so in-flight agent work does not leak across resets. */
export function clearInFlight() {
  inFlight.clear();
  notified.clear();
}

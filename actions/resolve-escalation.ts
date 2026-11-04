import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { DEPARTMENT_LABEL, type DepartmentId } from "../shared/city.js";
import { actorField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  isoIn,
  logActivity,
  mergeFlags,
  money,
  nowIso,
  patchIncident,
  resolveActor,
} from "../server/city/ops.js";
import { getDb, schema } from "../server/db/index.js";

/** Contingency release when the supervisor approves a budget escalation. */
const BUDGET_TOP_UP = 15000;

export default defineAction({
  description:
    "Supervisor decision on an open escalation. 'approve' accepts the agent's recommendation (emergency: dispatch now ignoring limits; budget: release $15,000 contingency; no_workers/blocked: allow overtime). 'override' rejects it (emergency: treat as high priority; budget/blocked/sensitive: defer and close; no_workers: wait 30s and retry). The same action backs the inbox Approve/Override buttons.",
  schema: z.object({
    escalationId: z.string().describe("Escalation id from the inbox"),
    decision: z.enum(["approve", "override"]).describe("Supervisor decision"),
    note: z.string().max(400).optional().describe("Optional note for the record"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "supervisor");
    const db = getDb();
    const [esc] = await db
      .update(schema.escalations)
      .set({
        status: args.decision === "approve" ? "approved" : "overridden",
        resolutionNote: args.note ?? null,
        resolvedBy: actor,
        resolvedAt: nowIso(),
      })
      .where(
        and(
          eq(schema.escalations.id, args.escalationId),
          eq(schema.escalations.status, "open"),
        ),
      )
      .returning();
    if (!esc) {
      fail("That escalation is not open (already decided or not found).", {
        errorCode: "not_open",
        statusCode: 409,
      });
    }
    const incident = await getIncidentOrFail(esc.incidentId);
    const lead = (incident.departmentIds[0] ?? null) as DepartmentId | null;
    let outcome: string;

    if (args.decision === "approve") {
      if (esc.reason === "budget" && lead) {
        await db
          .update(schema.departments)
          .set({
            budgetRemaining: sql`${schema.departments.budgetRemaining} + ${BUDGET_TOP_UP}`,
            budgetTotal: sql`${schema.departments.budgetTotal} + ${BUDGET_TOP_UP}`,
          })
          .where(eq(schema.departments.id, lead));
        outcome = `released ${money(BUDGET_TOP_UP)} to ${DEPARTMENT_LABEL[lead]}`;
      } else if (esc.reason === "emergency") {
        outcome = "authorised immediate dispatch";
      } else {
        outcome = "approved the recommendation";
      }
      await patchIncident(incident.id, {
        stage: "routed",
        previousStage: null,
        simFlags: mergeFlags(incident, {
          priority: esc.reason !== "budget",
          waitUntil: undefined,
          ...(esc.reason === "emergency" ? { emergencyApproved: true } : {}),
        }),
      });
    } else {
      if (esc.reason === "emergency") {
        await patchIncident(incident.id, {
          stage: "routed",
          severity: "high",
          previousStage: null,
        });
        outcome = "downgraded it to high priority";
      } else if (esc.reason === "no_workers") {
        await patchIncident(incident.id, {
          stage: "routed",
          previousStage: null,
          simFlags: mergeFlags(incident, { waitUntil: isoIn(30) }),
        });
        outcome = "asked the Department to wait for a free worker";
      } else {
        await patchIncident(incident.id, {
          stage: "closed",
          previousStage: null,
          resolvedAt: nowIso(),
          resolution: `Deferred by supervisor${args.note ? `: ${args.note}` : ""}`,
        });
        outcome = "deferred and closed it";
      }
    }

    await logActivity({
      actor,
      actionName: "resolve-escalation",
      message: `${args.decision === "approve" ? "approved" : "overrode"} the ${esc.reason.replace("_", " ")} escalation on ${incident.id} — ${outcome}${args.note ? ` (${args.note})` : ""}`,
      incidentId: incident.id,
    });
    return {
      escalationId: esc.id,
      incidentId: incident.id,
      decision: args.decision,
      outcome,
    };
  },
});

import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { ESCALATION_REASONS } from "../shared/city.js";
import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  logActivity,
  nowIso,
  openEscalationFor,
  patchIncident,
  resolveActor,
} from "../server/city/ops.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Put a decision the agents cannot make on their own into the supervisor's inbox (emergency, budget, no_workers, blocked, sensitive), with a recommendation. The incident waits until the supervisor approves or overrides with resolve-escalation.",
  schema: z.object({
    incidentId: incidentIdField,
    reason: z.enum(ESCALATION_REASONS).describe("Why a human is needed"),
    summary: z
      .string()
      .min(5)
      .max(400)
      .describe("What the agent could not decide, one or two sentences"),
    recommendation: z
      .string()
      .min(5)
      .max(400)
      .describe("What the agent recommends the supervisor approve"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "department");
    const incident = await getIncidentOrFail(args.incidentId);
    if (["resolved", "merged", "closed", "escalated"].includes(incident.stage)) {
      fail(`${incident.id} is ${incident.stage}; nothing to escalate.`, {
        errorCode: "wrong_stage",
        statusCode: 409,
      });
    }
    if (await openEscalationFor(incident.id)) {
      fail(`${incident.id} already has an open escalation.`, {
        errorCode: "already_escalated",
        statusCode: 409,
      });
    }
    const id = crypto.randomUUID();
    await getDb()
      .insert(schema.escalations)
      .values({
        id,
        incidentId: incident.id,
        raisedBy: actor,
        reason: args.reason,
        summary: args.summary,
        recommendation: args.recommendation,
        status: "open",
        createdAt: nowIso(),
      });
    await patchIncident(incident.id, {
      stage: "escalated",
      previousStage: incident.stage,
    });
    await logActivity({
      actor,
      actionName: "escalate-issue",
      message: `escalated ${incident.id} to the supervisor (${args.reason.replace("_", " ")}): ${args.summary}`,
      incidentId: incident.id,
    });
    return { escalationId: id, incidentId: incident.id, stage: "escalated" as const };
  },
});

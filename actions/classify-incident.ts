import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  CATEGORIES,
  DEADLINE_SECONDS,
  estimateCost,
  SEVERITIES,
} from "../shared/city.js";
import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  isoIn,
  logActivity,
  money,
  patchIncident,
  requireStage,
  resolveActor,
} from "../server/city/ops.js";

export default defineAction({
  description:
    "Classify a reported incident: category, severity and a short title. Sets the repair cost estimate and resolution deadline. Normally done by the Intake agent; the supervisor can re-classify an incident that has not been assigned yet.",
  schema: z.object({
    incidentId: incidentIdField,
    category: z.enum(CATEGORIES).describe("Problem category"),
    severity: z.enum(SEVERITIES).describe("How urgent it is"),
    title: z.string().min(3).max(80).describe("Short title, max ~8 words"),
    note: z
      .string()
      .max(400)
      .optional()
      .describe("One-line reasoning shown in the incident history"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "intake");
    const incident = await getIncidentOrFail(args.incidentId);
    requireStage(incident, ["reported", "classified", "routed"]);
    const estCost = estimateCost(args.category, args.severity);
    await patchIncident(incident.id, {
      category: args.category,
      severity: args.severity,
      title: args.title,
      estCost,
      deadlineAt: isoIn(DEADLINE_SECONDS[args.severity]),
      agentNote: args.note ?? incident.agentNote,
      stage: "classified",
      departmentIds: [],
    });
    await logActivity({
      actor,
      actionName: "classify-incident",
      message: `classified ${incident.id} as ${args.severity} ${args.category} — "${args.title}" (est. ${money(estCost)})`,
      incidentId: incident.id,
    });
    return {
      id: incident.id,
      stage: "classified" as const,
      category: args.category,
      severity: args.severity,
      estCost,
    };
  },
});

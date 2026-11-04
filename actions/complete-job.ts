import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  getWorkerOrFail,
  logActivity,
  patchIncident,
  requireStage,
  resolveActor,
} from "../server/city/ops.js";

export default defineAction({
  description:
    "Field worker submits a completion report. The incident moves to review, where the Quality agent checks the fix.",
  schema: z.object({
    incidentId: incidentIdField,
    report: z
      .string()
      .min(5)
      .max(600)
      .describe("What the worker did on site, in plain words"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "worker");
    const incident = await getIncidentOrFail(args.incidentId);
    requireStage(incident, ["working", "travelling"]);
    const worker = incident.workerId
      ? await getWorkerOrFail(incident.workerId)
      : null;
    await patchIncident(incident.id, {
      stage: "review",
      workerReport: args.report,
      etaAt: null,
      workEndsAt: null,
    });
    await logActivity({
      actor,
      actorDetail: actor === "worker" ? worker?.name : null,
      actionName: "complete-job",
      message: `finished ${incident.id}: "${args.report}"`,
      incidentId: incident.id,
    });
    return { id: incident.id, stage: "review" as const };
  },
});

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  getWorkerOrFail,
  logActivity,
  mergeFlags,
  patchIncident,
  requireStage,
  resolveActor,
} from "../server/city/ops.js";

export default defineAction({
  description:
    "A field worker reports they cannot finish (needs a specialist or missing equipment). The job goes back to the Department to reassign, excluding this worker.",
  schema: z.object({
    incidentId: incidentIdField,
    reason: z.string().min(3).max(300).describe("What is blocking the job"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "worker");
    const incident = await getIncidentOrFail(args.incidentId);
    requireStage(incident, ["travelling", "working"]);
    const worker = await getWorkerOrFail(incident.workerId ?? "");
    const exclude = [
      ...new Set([...(incident.simFlags?.excludeWorkers ?? []), worker.id]),
    ];
    await patchIncident(incident.id, {
      stage: "routed",
      workerId: null,
      etaAt: null,
      workEndsAt: null,
      workerReport: `Blocked: ${args.reason}`,
      simFlags: mergeFlags(incident, { excludeWorkers: exclude, blocked: false }),
    });
    await logActivity({
      actor,
      actorDetail: actor === "worker" ? worker.name : null,
      actionName: "report-blocked",
      message: `is blocked on ${incident.id}: ${args.reason} — sent back to the Department`,
      incidentId: incident.id,
    });
    return { id: incident.id, stage: "routed" as const, excluded: exclude };
  },
});

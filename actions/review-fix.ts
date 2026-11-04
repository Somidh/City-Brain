import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  logActivity,
  mergeFlags,
  nowIso,
  patchIncident,
  requireStage,
  resolveActor,
} from "../server/city/ops.js";

export default defineAction({
  description:
    "Quality review of a completed job. 'pass' closes the incident as resolved; 'fail' reopens it and sends it back to the Department to reassign to a different worker.",
  schema: z.object({
    incidentId: incidentIdField,
    verdict: z.enum(["pass", "fail"]).describe("Was the fix adequate?"),
    note: z.string().min(3).max(400).describe("Reason for the verdict"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "quality");
    const incident = await getIncidentOrFail(args.incidentId);
    requireStage(incident, ["review"]);
    if (args.verdict === "pass") {
      await patchIncident(incident.id, {
        stage: "resolved",
        qualityNote: args.note,
        resolvedAt: nowIso(),
        resolution: incident.workerReport ?? "Fixed",
      });
    } else {
      const exclude = [
        ...new Set([
          ...(incident.simFlags?.excludeWorkers ?? []),
          ...(incident.workerId ? [incident.workerId] : []),
        ]),
      ];
      await patchIncident(incident.id, {
        stage: "routed",
        qualityNote: args.note,
        workerId: null,
        reopenCount: incident.reopenCount + 1,
        simFlags: mergeFlags(incident, { excludeWorkers: exclude, badFix: false }),
      });
    }
    await logActivity({
      actor,
      actionName: "review-fix",
      message:
        args.verdict === "pass"
          ? `approved the fix and closed ${incident.id} — ${args.note}`
          : `rejected the fix on ${incident.id} and reopened it — ${args.note}`,
      incidentId: incident.id,
    });
    return {
      id: incident.id,
      stage: args.verdict === "pass" ? ("resolved" as const) : ("routed" as const),
    };
  },
});

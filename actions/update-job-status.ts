import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  type Severity,
  travelSeconds,
  WORK_SECONDS,
  zoneById,
  zoneDistance,
} from "../shared/city.js";
import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  getWorkerOrFail,
  isoIn,
  logActivity,
  patchIncident,
  requireStage,
  resolveActor,
} from "../server/city/ops.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Field worker progress: 'travelling' starts the trip to the incident (sets an ETA), 'working' marks arrival on site (sets the expected finish time).",
  schema: z.object({
    incidentId: incidentIdField,
    status: z.enum(["travelling", "working"]).describe("New job status"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "worker");
    const incident = await getIncidentOrFail(args.incidentId);
    const worker = await getWorkerOrFail(incident.workerId ?? "");
    const zoneName = zoneById(incident.zone)?.name ?? `zone ${incident.zone}`;
    let message: string;
    if (args.status === "travelling") {
      requireStage(incident, ["assigned"]);
      const seconds = travelSeconds(zoneDistance(worker.currentZone, incident.zone));
      await patchIncident(incident.id, {
        stage: "travelling",
        etaAt: isoIn(seconds),
      });
      message = `is heading to ${zoneName} for ${incident.id} — arrives in ${seconds}s`;
    } else {
      requireStage(incident, ["travelling"]);
      const seconds = WORK_SECONDS[(incident.severity ?? "medium") as Severity];
      await patchIncident(incident.id, {
        stage: "working",
        workEndsAt: isoIn(seconds),
      });
      await getDb()
        .update(schema.workers)
        .set({ currentZone: incident.zone })
        .where(eq(schema.workers.id, worker.id));
      message = `arrived in ${zoneName} and started work on ${incident.id}`;
    }
    await logActivity({
      actor,
      actorDetail: actor === "worker" ? worker.name : null,
      actionName: "update-job-status",
      message,
      incidentId: incident.id,
    });
    return { id: incident.id, stage: args.status };
  },
});

import { defineAction, fail } from "@agent-native/core/action";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";

import { OPEN_STAGES, type Stage } from "../shared/city.js";
import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  logActivity,
  nowIso,
  patchIncident,
  requireStage,
  resolveActor,
} from "../server/city/ops.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Mark a new report as a duplicate of an existing open incident. The new report is closed as merged and the original's report count goes up.",
  schema: z.object({
    incidentId: incidentIdField.describe("The new, duplicate report"),
    duplicateOf: incidentIdField.describe("The existing open incident"),
    note: z.string().max(400).optional().describe("Why they are the same"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "intake");
    const incident = await getIncidentOrFail(args.incidentId);
    const original = await getIncidentOrFail(args.duplicateOf);
    requireStage(incident, ["reported", "classified"]);
    if (original.id === incident.id) {
      fail("An incident cannot duplicate itself.", {
        errorCode: "invalid_duplicate",
      });
    }
    if (!OPEN_STAGES.includes(original.stage as Stage)) {
      fail(`${original.id} is already ${original.stage}; file it as new.`, {
        errorCode: "original_closed",
        statusCode: 409,
      });
    }
    await patchIncident(incident.id, {
      stage: "merged",
      duplicateOf: original.id,
      category: original.category,
      severity: original.severity,
      agentNote: args.note ?? incident.agentNote,
      resolvedAt: nowIso(),
      resolution: `Merged into ${original.id}`,
    });
    await getDb()
      .update(schema.incidents)
      .set({
        reportCount: sql`${schema.incidents.reportCount} + 1`,
        updatedAt: nowIso(),
      })
      .where(eq(schema.incidents.id, original.id));
    await logActivity({
      actor,
      actionName: "merge-duplicate",
      message: `merged duplicate ${incident.id} into ${original.id}${args.note ? ` — ${args.note}` : ""}`,
      incidentId: incident.id,
    });
    return { id: incident.id, stage: "merged" as const, duplicateOf: original.id };
  },
});

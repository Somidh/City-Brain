import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { zoneById } from "../shared/city.js";
import { actorField } from "../server/city/action-schema.js";
import {
  logActivity,
  nextIncidentId,
  nowIso,
  resolveActor,
} from "../server/city/ops.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "File a new citizen report about a city problem (pothole, broken light, garbage, flooding, hazard). The Intake agent classifies it automatically afterwards.",
  schema: z.object({
    description: z
      .string()
      .min(5)
      .max(1000)
      .describe("What the citizen sees, in their own words"),
    zone: z.coerce
      .number()
      .int()
      .min(1)
      .max(12)
      .describe("City zone number 1-12 where the problem is"),
    citizenName: z
      .string()
      .max(80)
      .optional()
      .describe("Reporter's first name; defaults to Anonymous"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "citizen");
    const { id, seq } = await nextIncidentId();
    const now = nowIso();
    const description = args.description.trim();
    const title =
      description.length > 60 ? `${description.slice(0, 57)}...` : description;
    await getDb()
      .insert(schema.incidents)
      .values({
        id,
        seq,
        title,
        description,
        citizenName: args.citizenName?.trim() || "Anonymous",
        zone: args.zone,
        stage: "reported",
        departmentIds: [],
        simFlags: {},
        createdAt: now,
        updatedAt: now,
      });
    await logActivity({
      actor,
      actorDetail: actor === "citizen" ? args.citizenName?.trim() : null,
      actionName: "submit-report",
      message: `reported ${id} in ${zoneById(args.zone)?.name ?? `zone ${args.zone}`}: "${title}"`,
      incidentId: id,
    });
    return { id, stage: "reported" as const, zone: args.zone };
  },
});

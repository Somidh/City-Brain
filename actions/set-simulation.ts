import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { actorField } from "../server/city/action-schema.js";
import { logActivity, nowIso, resolveActor } from "../server/city/ops.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Control the city simulation: pause/resume everything, toggle automatic background citizen reports, or change how often they arrive.",
  schema: z.object({
    running: z.boolean().optional().describe("false pauses all agents and timers"),
    autoReports: z.boolean().optional().describe("Background citizen reports on/off"),
    autoIntervalSec: z.coerce
      .number()
      .int()
      .min(10)
      .max(600)
      .optional()
      .describe("Seconds between background reports"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "supervisor");
    const patch: Partial<typeof schema.simState.$inferInsert> = {};
    if (args.running !== undefined) patch.running = args.running;
    if (args.autoReports !== undefined) {
      patch.autoReports = args.autoReports;
      if (args.autoReports) patch.lastAutoAt = nowIso();
    }
    if (args.autoIntervalSec !== undefined) patch.autoIntervalSec = args.autoIntervalSec;
    const [state] = await getDb()
      .update(schema.simState)
      .set(patch)
      .where(eq(schema.simState.id, "main"))
      .returning();
    const parts = [
      args.running !== undefined ? (args.running ? "resumed the city" : "paused the city") : null,
      args.autoReports !== undefined
        ? `${args.autoReports ? "enabled" : "disabled"} background reports`
        : null,
      args.autoIntervalSec !== undefined ? `set reports every ${args.autoIntervalSec}s` : null,
    ].filter(Boolean);
    if (parts.length) {
      await logActivity({ actor, actionName: "set-simulation", message: parts.join(", ") });
    }
    return {
      running: state?.running ?? null,
      autoReports: state?.autoReports ?? null,
      autoIntervalSec: state?.autoIntervalSec ?? null,
    };
  },
});

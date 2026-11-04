import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { NOTIFY_KINDS } from "../shared/city.js";
import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  logActivity,
  nowIso,
  patchIncident,
  resolveActor,
} from "../server/city/ops.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Send the citizen who reported an incident a plain-language status message (simulated SMS). Normally written by the Comms agent at each stage.",
  schema: z.object({
    incidentId: incidentIdField,
    kind: z.enum(NOTIFY_KINDS).describe("Which update this is"),
    message: z
      .string()
      .min(5)
      .max(320)
      .describe("Friendly message, 1-2 sentences, no jargon"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "comms");
    const incident = await getIncidentOrFail(args.incidentId);
    await getDb()
      .insert(schema.notifications)
      .values({
        id: crypto.randomUUID(),
        incidentId: incident.id,
        stage: args.kind,
        message: args.message,
        at: nowIso(),
      });
    if (args.kind === "delayed") {
      await patchIncident(incident.id, { delayNotified: true });
    }
    await logActivity({
      actor,
      actionName: "notify-citizen",
      message: `texted ${incident.citizenName} about ${incident.id} (${args.kind}): "${args.message}"`,
      incidentId: incident.id,
    });
    return { incidentId: incident.id, kind: args.kind };
  },
});

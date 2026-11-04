import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { DEPARTMENT_LABEL, DEPARTMENTS } from "../shared/city.js";
import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  getIncidentOrFail,
  logActivity,
  mergeFlags,
  patchIncident,
  requireStage,
  resolveActor,
} from "../server/city/ops.js";

export default defineAction({
  description:
    "Route a classified incident to the department(s) that own it. The first department is the lead and pays for the repair. Normally done by the Router agent; the supervisor can re-route an incident that is not yet assigned.",
  schema: z.object({
    incidentId: incidentIdField,
    departmentIds: z
      .array(z.enum(DEPARTMENTS))
      .min(1)
      .max(3)
      .describe("Lead department first, then any supporting departments"),
    note: z.string().max(400).optional().describe("Routing reasoning"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "router");
    const incident = await getIncidentOrFail(args.incidentId);
    requireStage(incident, ["classified", "routed"]);
    const departmentIds = [...new Set(args.departmentIds)];
    await patchIncident(incident.id, {
      departmentIds,
      stage: "routed",
      simFlags: mergeFlags(incident, { waitUntil: undefined }),
    });
    const names = departmentIds.map((d) => DEPARTMENT_LABEL[d]).join(" + ");
    await logActivity({
      actor,
      actionName: "route-incident",
      message: `routed ${incident.id} to ${names}${departmentIds.length > 1 ? " (cross-department)" : ""}${args.note ? ` — ${args.note}` : ""}`,
      incidentId: incident.id,
    });
    return { id: incident.id, stage: "routed" as const, departmentIds };
  },
});

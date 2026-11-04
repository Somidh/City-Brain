import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { DEPARTMENTS, STAGES } from "../shared/city.js";
import { listIncidents } from "../server/city/state.js";

export default defineAction({
  description:
    "List incidents, newest first, optionally filtered by stage(s), zone (1-12) or department.",
  schema: z.object({
    stages: z
      .array(z.enum(STAGES))
      .optional()
      .describe("Only these stages, e.g. ['escalated','routed']"),
    zone: z.coerce.number().int().min(1).max(12).optional().describe("Zone 1-12"),
    departmentId: z.enum(DEPARTMENTS).optional().describe("Department"),
    limit: z.coerce.number().int().min(1).max(100).default(30).describe("Max rows"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args) => ({ incidents: await listIncidents(args) }),
});

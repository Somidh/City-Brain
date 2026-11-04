import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { cityState } from "../server/city/state.js";

export default defineAction({
  description:
    "Full live snapshot of the city for the supervisor dashboard: department load and budgets, workers, recent incidents, escalations, the agent activity feed and headline stats. For targeted questions prefer list-incidents or get-incident.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  agentTool: false,
  run: async () => cityState(),
});

import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { incidentIdField } from "../server/city/action-schema.js";
import { incidentDetail } from "../server/city/state.js";

export default defineAction({
  description:
    "Everything about one incident: details, assigned worker, the full agent history, citizen messages sent, escalations and merged duplicates.",
  schema: z.object({ incidentId: incidentIdField }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ incidentId }) => {
    const detail = await incidentDetail(incidentId);
    if (!detail) {
      fail(`Incident ${incidentId} not found.`, {
        errorCode: "not_found",
        statusCode: 404,
      });
    }
    return detail;
  },
});

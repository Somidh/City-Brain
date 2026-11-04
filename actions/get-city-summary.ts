import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { cityState } from "../server/city/state.js";

export default defineAction({
  description:
    "Compact overview of the city right now: headline stats, each department's active jobs / free workers / budget, workers' load, open escalations and the last 15 agent actions. Start here when the supervisor asks how the city is doing.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const s = await cityState();
    return {
      now: s.now,
      stats: s.stats,
      departments: s.departments,
      workers: s.workers.map((w) => ({
        id: w.id,
        name: w.name,
        skills: w.skills,
        zone: w.zone,
        load: `${w.load}/${w.maxJobs}`,
        status: w.status,
        jobs: w.jobs,
      })),
      openEscalations: s.escalations
        .filter((e) => e.status === "open")
        .map((e) => ({
          escalationId: e.id,
          incidentId: e.incidentId,
          reason: e.reason,
          summary: e.summary,
          recommendation: e.recommendation,
          raisedBy: e.raisedBy,
        })),
      recentActivity: s.activity
        .slice(0, 15)
        .map((a) => `${a.at} ${a.actorName}: ${a.message}`),
    };
  },
});

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { clearInFlight } from "../server/city/orchestrator.js";
import { resetCity } from "../server/city/seed.js";

export default defineAction({
  description:
    "Wipe and reseed the simulated city (30 incidents, 8 workers, 5 departments) and restart the scripted demo timeline. Only do this when the supervisor explicitly asks to reset.",
  schema: z.object({
    confirm: z.literal(true).describe("Must be true; confirms the reset"),
  }),
  run: async () => {
    clearInFlight();
    const result = await resetCity();
    return { ok: true, ...result };
  },
});

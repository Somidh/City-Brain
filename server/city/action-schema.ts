import { z } from "zod";

import { ACTORS } from "../../shared/city.js";

/**
 * Optional `actor` arg shared by every write action. The pipeline agents set
 * it when they call `action.run()`. Browser calls resolve to "supervisor" and
 * copilot chat calls resolve to "copilot" automatically.
 */
export const actorField = z
  .enum(ACTORS)
  .optional()
  .describe("Leave unset. Filled in automatically from who is calling.");

export const incidentIdField = z
  .string()
  .min(1)
  .describe('Incident id, e.g. "INC-042"');

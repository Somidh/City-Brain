import { defineAction } from "@agent-native/core/action";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { DEPARTMENTS } from "../shared/city.js";
import { actorField } from "../server/city/action-schema.js";
import {
  getDepartmentOrFail,
  logActivity,
  money,
  resolveActor,
} from "../server/city/ops.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Add (positive amount) or remove (negative amount) dollars from a department's remaining budget.",
  schema: z.object({
    departmentId: z.enum(DEPARTMENTS).describe("Department to adjust"),
    amount: z.coerce
      .number()
      .int()
      .min(-100000)
      .max(100000)
      .describe("Dollars to add; negative to remove"),
    note: z.string().max(300).optional().describe("Reason"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "supervisor");
    const dept = await getDepartmentOrFail(args.departmentId);
    const [updated] = await getDb()
      .update(schema.departments)
      .set({
        budgetRemaining: sql`${schema.departments.budgetRemaining} + ${args.amount}`,
        budgetTotal: sql`${schema.departments.budgetTotal} + ${Math.max(args.amount, 0)}`,
      })
      .where(eq(schema.departments.id, dept.id))
      .returning({ budgetRemaining: schema.departments.budgetRemaining });
    await logActivity({
      actor,
      actionName: "adjust-budget",
      message: `${args.amount >= 0 ? "added" : "removed"} ${money(Math.abs(args.amount))} ${args.amount >= 0 ? "to" : "from"} ${dept.name} (now ${money(updated?.budgetRemaining ?? 0)})${args.note ? ` — ${args.note}` : ""}`,
    });
    return {
      departmentId: dept.id,
      budgetRemaining: updated?.budgetRemaining ?? dept.budgetRemaining,
    };
  },
});

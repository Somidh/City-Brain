import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import {
  CATEGORY_FOR_DEPARTMENT,
  DEPARTMENT_LABEL,
  MAX_JOBS_PER_WORKER,
  type DepartmentId,
  zoneDistance,
} from "../shared/city.js";
import { actorField, incidentIdField } from "../server/city/action-schema.js";
import {
  ACTIVE_JOB_STAGES,
  getIncidentOrFail,
  getWorkerOrFail,
  logActivity,
  mergeFlags,
  money,
  nowIso,
  requireStage,
  resolveActor,
} from "../server/city/ops.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Assign (or reassign) a field worker to a routed incident. Rejects with skill_mismatch, worker_at_capacity (max 2 open jobs) or budget_insufficient (lead department cannot pay the estimate) unless the matching override flag is set. Charges the repair estimate to the lead department once.",
  schema: z.object({
    incidentId: incidentIdField,
    workerId: z.string().describe('Worker id, e.g. "w-ravi"'),
    allowOverCapacity: z
      .boolean()
      .optional()
      .describe("Supervisor override: ignore the 2-job limit"),
    allowOverBudget: z
      .boolean()
      .optional()
      .describe("Supervisor override: charge even if the budget goes negative"),
    note: z.string().max(400).optional().describe("Why this worker"),
    actor: actorField,
  }),
  run: async (args, ctx) => {
    const actor = resolveActor(ctx, args.actor, "department");
    const incident = await getIncidentOrFail(args.incidentId);
    requireStage(incident, ["routed", "assigned", "travelling"]);
    const worker = await getWorkerOrFail(args.workerId);
    const lead = (incident.departmentIds[0] ?? null) as DepartmentId | null;
    if (!lead) {
      fail(`${incident.id} has no department yet; route it first.`, {
        errorCode: "not_routed",
        statusCode: 409,
      });
    }
    const skill = CATEGORY_FOR_DEPARTMENT[lead];
    if (!worker.skills.includes(skill)) {
      fail(`${worker.name} has no ${skill} skill (has ${worker.skills.join(", ")}).`, {
        errorCode: "skill_mismatch",
        statusCode: 409,
      });
    }
    const cost = incident.estCost ?? 0;
    const alreadyCharged = Boolean(incident.simFlags?.charged);

    const result = await getDb().transaction(async (tx) => {
      const [dept] = await tx
        .select()
        .from(schema.departments)
        .where(eq(schema.departments.id, lead))
        .for("update");
      if (!dept) {
        fail(`Department ${lead} not found.`, {
          errorCode: "not_found",
          statusCode: 404,
        });
      }
      const loadRows = await tx
        .select({ id: schema.incidents.id })
        .from(schema.incidents)
        .where(
          and(
            eq(schema.incidents.workerId, worker.id),
            inArray(schema.incidents.stage, ACTIVE_JOB_STAGES),
            ne(schema.incidents.id, incident.id),
          ),
        );
      if (loadRows.length >= MAX_JOBS_PER_WORKER && !args.allowOverCapacity) {
        fail(
          `${worker.name} already has ${loadRows.length} open jobs (max ${MAX_JOBS_PER_WORKER}).`,
          { errorCode: "worker_at_capacity", statusCode: 409 },
        );
      }
      if (!alreadyCharged && dept.budgetRemaining < cost && !args.allowOverBudget) {
        fail(
          `${dept.name} has ${money(dept.budgetRemaining)} left; this repair needs ${money(cost)}.`,
          { errorCode: "budget_insufficient", statusCode: 409 },
        );
      }
      if (!alreadyCharged) {
        await tx
          .update(schema.departments)
          .set({ budgetRemaining: dept.budgetRemaining - cost })
          .where(eq(schema.departments.id, lead));
      }
      await tx
        .update(schema.incidents)
        .set({
          workerId: worker.id,
          stage: "assigned",
          etaAt: null,
          workEndsAt: null,
          simFlags: mergeFlags(incident, { charged: true, priority: false }),
          updatedAt: nowIso(),
        })
        .where(eq(schema.incidents.id, incident.id));
      return { load: loadRows.length + 1, budgetLeft: alreadyCharged ? dept.budgetRemaining : dept.budgetRemaining - cost };
    });

    const reassigned = incident.workerId && incident.workerId !== worker.id;
    const km = zoneDistance(worker.currentZone, incident.zone);
    await logActivity({
      actor,
      actorDetail: actor === "department" ? `${DEPARTMENT_LABEL[lead]} Dept` : null,
      actionName: "assign-worker",
      message: `${reassigned ? "reassigned" : "assigned"} ${incident.id} to ${worker.name} (${km === 0 ? "same zone" : `${km} zone${km > 1 ? "s" : ""} away`}, ${result.load}/${MAX_JOBS_PER_WORKER} jobs)${args.note ? ` — ${args.note}` : ""}`,
      incidentId: incident.id,
    });
    return {
      id: incident.id,
      stage: "assigned" as const,
      workerId: worker.id,
      workerName: worker.name,
      budgetLeft: result.budgetLeft,
    };
  },
});

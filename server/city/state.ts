// Read models shared by get-city-state (dashboard) and the copilot's reads.

import { desc, eq, gte, inArray } from "drizzle-orm";

import {
  type DepartmentId,
  DEPARTMENTS,
  CATEGORY_FOR_DEPARTMENT,
  LOW_BUDGET_THRESHOLD,
  MAX_JOBS_PER_WORKER,
  OPEN_STAGES,
} from "../../shared/city.js";
import { getDb, schema } from "../db/index.js";
import { ACTIVE_JOB_STAGES } from "./ops.js";
import { llmInfo } from "./llm.js";

export async function cityState() {
  const db = getDb();
  const [sim] = await db.select().from(schema.simState).limit(1);
  const departments = await db.select().from(schema.departments);
  const workers = await db.select().from(schema.workers);
  const incidents = await db
    .select({
      id: schema.incidents.id,
      title: schema.incidents.title,
      zone: schema.incidents.zone,
      category: schema.incidents.category,
      severity: schema.incidents.severity,
      stage: schema.incidents.stage,
      departmentIds: schema.incidents.departmentIds,
      workerId: schema.incidents.workerId,
      estCost: schema.incidents.estCost,
      deadlineAt: schema.incidents.deadlineAt,
      etaAt: schema.incidents.etaAt,
      workEndsAt: schema.incidents.workEndsAt,
      reportCount: schema.incidents.reportCount,
      reopenCount: schema.incidents.reopenCount,
      createdAt: schema.incidents.createdAt,
      updatedAt: schema.incidents.updatedAt,
      resolvedAt: schema.incidents.resolvedAt,
    })
    .from(schema.incidents)
    .orderBy(desc(schema.incidents.seq))
    .limit(300);
  const escalations = await db
    .select()
    .from(schema.escalations)
    .orderBy(desc(schema.escalations.createdAt))
    .limit(40);
  const activity = await db
    .select()
    .from(schema.activity)
    .orderBy(desc(schema.activity.at))
    .limit(80);

  const open = incidents.filter((i) => OPEN_STAGES.includes(i.stage as never));
  const activeJobs = incidents.filter((i) =>
    ACTIVE_JOB_STAGES.includes(i.stage as never),
  );
  const loads = new Map<string, number>();
  for (const j of activeJobs) {
    if (j.workerId) loads.set(j.workerId, (loads.get(j.workerId) ?? 0) + 1);
  }

  const workerView = workers.map((w) => {
    const jobs = activeJobs.filter((j) => j.workerId === w.id);
    const status = jobs.some((j) => j.stage === "working")
      ? "working"
      : jobs.some((j) => j.stage === "travelling")
        ? "travelling"
        : jobs.length
          ? "assigned"
          : "idle";
    return {
      id: w.id,
      name: w.name,
      skills: w.skills,
      zone: w.currentZone,
      load: loads.get(w.id) ?? 0,
      maxJobs: MAX_JOBS_PER_WORKER,
      status,
      jobs: jobs.map((j) => j.id),
    };
  });

  const departmentView = DEPARTMENTS.map((id: DepartmentId) => {
    const d = departments.find((x) => x.id === id);
    const skill = CATEGORY_FOR_DEPARTMENT[id];
    const deptOpen = open.filter((i) => i.departmentIds[0] === id);
    const deptWorkers = workerView.filter((w) => w.skills.includes(skill));
    const available = deptWorkers.filter((w) => w.load < w.maxJobs).length;
    const budgetRemaining = d?.budgetRemaining ?? 0;
    return {
      id,
      name: d?.name ?? id,
      budgetTotal: d?.budgetTotal ?? 0,
      budgetRemaining,
      activeJobs: deptOpen.length,
      workers: deptWorkers.length,
      availableWorkers: available,
      lowBudget: budgetRemaining < LOW_BUDGET_THRESHOLD,
      overloaded: available === 0 || deptOpen.length > deptWorkers.length * 2,
    };
  });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = incidents.filter(
    (i) => Date.parse(i.createdAt) >= startOfDay.getTime() && i.stage !== "merged",
  );
  const resolved = incidents.filter((i) => i.stage === "resolved" && i.resolvedAt);
  const avgResolutionMin = resolved.length
    ? resolved.reduce(
        (sum, i) => sum + (Date.parse(i.resolvedAt!) - Date.parse(i.createdAt)),
        0,
      ) /
      resolved.length /
      60_000
    : 0;
  const escalationRate = today.length
    ? escalations.filter((e) => Date.parse(e.createdAt) >= startOfDay.getTime()).length /
      today.length
    : 0;

  return {
    now: new Date().toISOString(),
    llm: llmInfo(),
    sim: sim
      ? {
          running: sim.running,
          autoReports: sim.autoReports,
          autoIntervalSec: sim.autoIntervalSec,
          startedAt: sim.startedAt,
        }
      : null,
    stats: {
      totalToday: today.length,
      open: open.length,
      resolved: resolved.length,
      avgResolutionMin: Math.round(avgResolutionMin * 10) / 10,
      escalationRate: Math.round(escalationRate * 1000) / 10,
      openEscalations: escalations.filter((e) => e.status === "open").length,
    },
    departments: departmentView,
    workers: workerView,
    incidents,
    escalations,
    activity,
  };
}

export async function incidentDetail(id: string) {
  const db = getDb();
  const [incident] = await db
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.id, id.toUpperCase()))
    .limit(1);
  if (!incident) return null;
  const [history, messages, escalations, duplicates] = await Promise.all([
    db
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.incidentId, incident.id))
      .orderBy(schema.activity.at)
      .limit(100),
    db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.incidentId, incident.id))
      .orderBy(schema.notifications.at)
      .limit(50),
    db
      .select()
      .from(schema.escalations)
      .where(eq(schema.escalations.incidentId, incident.id))
      .orderBy(schema.escalations.createdAt),
    db
      .select({ id: schema.incidents.id, citizenName: schema.incidents.citizenName })
      .from(schema.incidents)
      .where(eq(schema.incidents.duplicateOf, incident.id)),
  ]);
  const worker = incident.workerId
    ? ((
        await db
          .select()
          .from(schema.workers)
          .where(eq(schema.workers.id, incident.workerId))
          .limit(1)
      )[0] ?? null)
    : null;
  const { simFlags: _hidden, ...publicIncident } = incident;
  return {
    incident: publicIncident,
    worker: worker ? { id: worker.id, name: worker.name, skills: worker.skills } : null,
    history,
    messages,
    escalations,
    duplicates,
  };
}

export async function listIncidents(filter: {
  stages?: string[] | undefined;
  zone?: number | undefined;
  departmentId?: string | undefined;
  limit: number;
}) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.incidents.id,
      title: schema.incidents.title,
      zone: schema.incidents.zone,
      category: schema.incidents.category,
      severity: schema.incidents.severity,
      stage: schema.incidents.stage,
      departmentIds: schema.incidents.departmentIds,
      workerId: schema.incidents.workerId,
      estCost: schema.incidents.estCost,
      deadlineAt: schema.incidents.deadlineAt,
      createdAt: schema.incidents.createdAt,
    })
    .from(schema.incidents)
    .where(
      filter.stages?.length
        ? inArray(schema.incidents.stage, filter.stages)
        : gte(schema.incidents.seq, 0),
    )
    .orderBy(desc(schema.incidents.seq))
    .limit(300);
  return rows
    .filter((r) => (filter.zone ? r.zone === filter.zone : true))
    .filter((r) =>
      filter.departmentId ? r.departmentIds.includes(filter.departmentId) : true,
    )
    .slice(0, filter.limit);
}

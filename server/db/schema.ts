import { boolean, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

/** Hidden simulation knobs on an incident (scripted demo moments, retries). */
export interface SimFlags {
  /** The worker's first fix is inadequate, so Quality should reject it. */
  badFix?: boolean | undefined;
  /** The first worker gets blocked on site and needs a specialist. */
  blocked?: boolean | undefined;
  /** Supervisor approved: skip capacity/budget checks when assigning. */
  priority?: boolean | undefined;
  /** Workers who already failed or were blocked on this incident. */
  excludeWorkers?: string[] | undefined;
  /** Department waits until this ISO time before trying to assign again. */
  waitUntil?: string | undefined;
  /** Supervisor already approved this emergency; never re-escalate it. */
  emergencyApproved?: boolean | undefined;
  /** The repair cost has already been charged to the lead department. */
  charged?: boolean | undefined;
}

// City Brain is one shared simulated city: every table is city-wide state
// (no per-user ownership). All writes go through actions in /actions.
// Timestamps are UTC ISO strings so string order equals time order.

export const departments = pgTable("city_departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  budgetTotal: integer("budget_total").notNull(),
  budgetRemaining: integer("budget_remaining").notNull(),
  orgId: text("org_id"),
});

export const workers = pgTable("city_workers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  skills: jsonb("skills").$type<string[]>().notNull(),
  homeZone: integer("home_zone").notNull(),
  currentZone: integer("current_zone").notNull(),
  orgId: text("org_id"),
});

export const incidents = pgTable("city_incidents", {
  id: text("id").primaryKey(),
  seq: integer("seq").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  citizenName: text("citizen_name").notNull(),
  zone: integer("zone").notNull(),
  category: text("category"),
  severity: text("severity"),
  stage: text("stage").notNull(),
  previousStage: text("previous_stage"),
  departmentIds: jsonb("department_ids").$type<string[]>().notNull(),
  workerId: text("worker_id"),
  estCost: integer("est_cost"),
  deadlineAt: text("deadline_at"),
  etaAt: text("eta_at"),
  workEndsAt: text("work_ends_at"),
  duplicateOf: text("duplicate_of"),
  reportCount: integer("report_count").notNull().default(1),
  reopenCount: integer("reopen_count").notNull().default(0),
  agentNote: text("agent_note"),
  workerReport: text("worker_report"),
  qualityNote: text("quality_note"),
  resolution: text("resolution"),
  simFlags: jsonb("sim_flags")
    .$type<SimFlags>()
    .notNull(),
  delayNotified: boolean("delay_notified").notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  resolvedAt: text("resolved_at"),
  orgId: text("org_id"),
});

export const escalations = pgTable("city_escalations", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull(),
  raisedBy: text("raised_by").notNull(),
  reason: text("reason").notNull(),
  summary: text("summary").notNull(),
  recommendation: text("recommendation").notNull(),
  status: text("status").notNull(),
  resolutionNote: text("resolution_note"),
  resolvedBy: text("resolved_by"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
  orgId: text("org_id"),
});

export const activity = pgTable("city_activity", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  actorName: text("actor_name").notNull(),
  actionName: text("action_name").notNull(),
  message: text("message").notNull(),
  incidentId: text("incident_id"),
  at: text("at").notNull(),
  orgId: text("org_id"),
});

export const notifications = pgTable("city_notifications", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull(),
  stage: text("stage").notNull(),
  message: text("message").notNull(),
  at: text("at").notNull(),
  orgId: text("org_id"),
});

export const simState = pgTable("city_sim_state", {
  id: text("id").primaryKey(),
  running: boolean("running").notNull().default(true),
  autoReports: boolean("auto_reports").notNull().default(true),
  autoIntervalSec: integer("auto_interval_sec").notNull().default(45),
  lastAutoAt: text("last_auto_at"),
  startedAt: text("started_at").notNull(),
  scriptIndex: integer("script_index").notNull().default(0),
  nextSeq: integer("next_seq").notNull().default(1),
  orgId: text("org_id"),
});

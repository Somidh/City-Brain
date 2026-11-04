import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "city-brain-core",
      sql: `CREATE TABLE IF NOT EXISTS city_departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  budget_total INTEGER NOT NULL,
  budget_remaining INTEGER NOT NULL,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS city_workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  skills JSONB NOT NULL,
  home_zone INTEGER NOT NULL,
  current_zone INTEGER NOT NULL,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS city_incidents (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  citizen_name TEXT NOT NULL,
  zone INTEGER NOT NULL,
  category TEXT,
  severity TEXT,
  stage TEXT NOT NULL,
  previous_stage TEXT,
  department_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  worker_id TEXT,
  est_cost INTEGER,
  deadline_at TEXT,
  eta_at TEXT,
  work_ends_at TEXT,
  duplicate_of TEXT,
  report_count INTEGER NOT NULL DEFAULT 1,
  reopen_count INTEGER NOT NULL DEFAULT 0,
  agent_note TEXT,
  worker_report TEXT,
  quality_note TEXT,
  resolution TEXT,
  sim_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  delay_notified BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS city_escalations (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  raised_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'approved', 'overridden')),
  resolution_note TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS city_activity (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action_name TEXT NOT NULL,
  message TEXT NOT NULL,
  incident_id TEXT,
  at TEXT NOT NULL,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS city_notifications (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  at TEXT NOT NULL,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS city_sim_state (
  id TEXT PRIMARY KEY,
  running BOOLEAN NOT NULL DEFAULT true,
  auto_reports BOOLEAN NOT NULL DEFAULT true,
  auto_interval_sec INTEGER NOT NULL DEFAULT 45,
  last_auto_at TEXT,
  started_at TEXT NOT NULL,
  script_index INTEGER NOT NULL DEFAULT 0,
  next_seq INTEGER NOT NULL DEFAULT 1,
  org_id TEXT
);
CREATE INDEX IF NOT EXISTS city_incidents_stage_idx ON city_incidents (stage);
CREATE INDEX IF NOT EXISTS city_incidents_created_idx ON city_incidents (created_at);
CREATE INDEX IF NOT EXISTS city_escalations_status_idx ON city_escalations (status, created_at);
CREATE INDEX IF NOT EXISTS city_activity_at_idx ON city_activity (at);
CREATE INDEX IF NOT EXISTS city_activity_incident_idx ON city_activity (incident_id, at);
CREATE INDEX IF NOT EXISTS city_notifications_incident_idx ON city_notifications (incident_id, at)`,
    },
  ],
  { table: "city_brain_migrations" },
);

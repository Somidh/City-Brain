// Shared constants and types for City Brain. Imported by both server and UI.

export const CATEGORIES = [
  "road",
  "sanitation",
  "electrical",
  "water",
  "safety",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ["low", "medium", "high", "emergency"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const DEPARTMENTS = [
  "roads",
  "sanitation",
  "electrical",
  "water",
  "safety",
] as const;
export type DepartmentId = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_FOR_CATEGORY: Record<Category, DepartmentId> = {
  road: "roads",
  sanitation: "sanitation",
  electrical: "electrical",
  water: "water",
  safety: "safety",
};

export const CATEGORY_FOR_DEPARTMENT: Record<DepartmentId, Category> = {
  roads: "road",
  sanitation: "sanitation",
  electrical: "electrical",
  water: "water",
  safety: "safety",
};

export const DEPARTMENT_LABEL: Record<DepartmentId, string> = {
  roads: "Roads",
  sanitation: "Sanitation",
  electrical: "Electrical",
  water: "Water",
  safety: "Safety",
};

/** Pipeline stages an incident moves through. */
export const STAGES = [
  "reported", // waiting for Intake
  "classified", // waiting for Router
  "routed", // waiting for Department
  "assigned", // worker accepted, about to leave
  "travelling", // worker on the way
  "working", // worker on site
  "review", // waiting for Quality
  "resolved", // closed, fixed
  "escalated", // waiting for the supervisor
  "merged", // duplicate of another incident
  "closed", // closed without a fix (deferred / declined)
] as const;
export type Stage = (typeof STAGES)[number];

export const OPEN_STAGES: Stage[] = [
  "reported",
  "classified",
  "routed",
  "assigned",
  "travelling",
  "working",
  "review",
  "escalated",
];

export const ESCALATION_REASONS = [
  "emergency",
  "budget",
  "no_workers",
  "blocked",
  "sensitive",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

/** Kinds of citizen notification the Comms agent sends. */
export const NOTIFY_KINDS = [
  "received",
  "assigned",
  "working",
  "resolved",
  "delayed",
  "reopened",
  "update",
] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

/** Who did something. Agents, the two humans, and the copilot chat agent. */
export const ACTORS = [
  "citizen",
  "intake",
  "router",
  "department",
  "worker",
  "quality",
  "comms",
  "supervisor",
  "copilot",
  "system",
] as const;
export type Actor = (typeof ACTORS)[number];

export const ACTOR_META: Record<Actor, { emoji: string; name: string }> = {
  citizen: { emoji: "🙋", name: "Citizen" },
  intake: { emoji: "📥", name: "Intake" },
  router: { emoji: "🔀", name: "Router" },
  department: { emoji: "🏢", name: "Department" },
  worker: { emoji: "👷", name: "Field Worker" },
  quality: { emoji: "✅", name: "Quality" },
  comms: { emoji: "💬", name: "Comms" },
  supervisor: { emoji: "🧑‍💼", name: "Supervisor" },
  copilot: { emoji: "🤖", name: "Copilot" },
  system: { emoji: "⚙️", name: "System" },
};

// ---------------------------------------------------------------------------
// City geometry: 12 zones on a 4 x 3 grid.

export interface Zone {
  id: number;
  name: string;
  row: number;
  col: number;
}

export const ZONES: Zone[] = [
  { id: 1, name: "Harbor", row: 0, col: 0 },
  { id: 2, name: "Old Town", row: 0, col: 1 },
  { id: 3, name: "Market", row: 0, col: 2 },
  { id: 4, name: "Riverside", row: 0, col: 3 },
  { id: 5, name: "School District", row: 1, col: 0 },
  { id: 6, name: "Civic Center", row: 1, col: 1 },
  { id: 7, name: "Midtown", row: 1, col: 2 },
  { id: 8, name: "Tech Park", row: 1, col: 3 },
  { id: 9, name: "Hillside", row: 2, col: 0 },
  { id: 10, name: "Greenbelt", row: 2, col: 1 },
  { id: 11, name: "Industrial", row: 2, col: 2 },
  { id: 12, name: "Airport Rd", row: 2, col: 3 },
];

export const ZONE_COLS = 4;
export const ZONE_ROWS = 3;

export function zoneById(id: number): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}

export function zoneDistance(a: number, b: number): number {
  const za = zoneById(a);
  const zb = zoneById(b);
  if (!za || !zb) return 3;
  return Math.abs(za.row - zb.row) + Math.abs(za.col - zb.col);
}

// ---------------------------------------------------------------------------
// Simulation tuning (seconds of wall-clock time in the demo).

/** Resolution deadline per severity, in seconds. */
export const DEADLINE_SECONDS: Record<Severity, number> = {
  emergency: 120,
  high: 240,
  medium: 420,
  low: 720,
};

/** Rough repair cost in dollars per category and severity. */
export const BASE_COST: Record<Category, number> = {
  road: 2400,
  sanitation: 600,
  electrical: 1500,
  water: 2000,
  safety: 900,
};

export const SEVERITY_COST_MULTIPLIER: Record<Severity, number> = {
  low: 0.6,
  medium: 1,
  high: 1.5,
  emergency: 2.2,
};

export function estimateCost(category: Category, severity: Severity): number {
  return Math.round(BASE_COST[category] * SEVERITY_COST_MULTIPLIER[severity]);
}

export function travelSeconds(distance: number): number {
  return 6 + distance * 4;
}

export const WORK_SECONDS: Record<Severity, number> = {
  low: 10,
  medium: 14,
  high: 18,
  emergency: 22,
};

export const MAX_JOBS_PER_WORKER = 2;
export const LOW_BUDGET_THRESHOLD = 5000;

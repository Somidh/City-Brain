// Seed data for the simulated city and the scripted demo moments.

import type { Category, Severity } from "../../shared/city.js";
import { DEADLINE_SECONDS, estimateCost } from "../../shared/city.js";
import { getDb, schema } from "../db/index.js";
import type { SimFlags } from "../db/schema.js";

export const DEPARTMENT_SEED = [
  // Roads is nearly out of money on purpose: the next roads job escalates.
  { id: "roads", name: "Roads", budgetTotal: 50000, budgetRemaining: 1800 },
  { id: "sanitation", name: "Sanitation", budgetTotal: 30000, budgetRemaining: 21400 },
  { id: "electrical", name: "Electrical", budgetTotal: 40000, budgetRemaining: 26500 },
  { id: "water", name: "Water", budgetTotal: 45000, budgetRemaining: 31800 },
  { id: "safety", name: "Safety", budgetTotal: 25000, budgetRemaining: 18900 },
];

export const WORKER_SEED = [
  { id: "w-ravi", name: "Ravi", skills: ["road", "water"], zone: 1 },
  { id: "w-priya", name: "Priya", skills: ["electrical"], zone: 6 },
  { id: "w-arjun", name: "Arjun", skills: ["sanitation"], zone: 3 },
  { id: "w-meera", name: "Meera", skills: ["road"], zone: 9 },
  { id: "w-kabir", name: "Kabir", skills: ["water", "sanitation"], zone: 7 },
  { id: "w-ananya", name: "Ananya", skills: ["electrical", "safety"], zone: 11 },
  { id: "w-dev", name: "Dev", skills: ["safety", "road"], zone: 4 },
  { id: "w-sana", name: "Sana", skills: ["sanitation", "water"], zone: 12 },
];

const DEPT_FOR: Record<Category, string> = {
  road: "roads",
  sanitation: "sanitation",
  electrical: "electrical",
  water: "water",
  safety: "safety",
};

interface SeedIncident {
  title: string;
  description: string;
  citizen: string;
  zone: number;
  category: Category;
  severity: Severity;
  stage: "resolved" | "closed" | "assigned" | "travelling" | "working" | "reported";
  workerId?: string;
  /** For resolved: minutes ago created, minutes it took. */
  agoMin?: number;
  tookMin?: number;
  /** For travelling/working: seconds until arrival / finish. */
  timerSec?: number;
  flags?: SimFlags;
  report?: string;
}

const SEED_INCIDENTS: SeedIncident[] = [
  // --- In flight right now ---------------------------------------------------
  { title: "Deep pothole on Market Street", description: "Deep pothole in the right lane of Market Street, cars are hitting it hard.", citizen: "Nina", zone: 3, category: "road", severity: "medium", stage: "travelling", workerId: "w-dev", timerSec: 28 },
  { title: "Overflowing bins behind Greenbelt park", description: "All four bins behind the Greenbelt park playground are overflowing, rubbish is blowing around.", citizen: "Marco", zone: 10, category: "sanitation", severity: "medium", stage: "working", workerId: "w-arjun", timerSec: 38, flags: { badFix: true } },
  { title: "Flickering streetlights on Civic Ave", description: "Three streetlights on Civic Ave keep flickering on and off at night.", citizen: "Hana", zone: 6, category: "electrical", severity: "low", stage: "working", workerId: "w-priya", timerSec: 20 },
  { title: "Leaking hydrant on 5th & Main", description: "Fire hydrant at 5th and Main is leaking steadily onto the road.", citizen: "Luis", zone: 7, category: "water", severity: "medium", stage: "travelling", workerId: "w-kabir", timerSec: 15 },
  { title: "Cracked pavement near Hillside steps", description: "The pavement at the bottom of the Hillside steps is cracked and uneven, an old man tripped yesterday.", citizen: "Fatima", zone: 9, category: "road", severity: "medium", stage: "working", workerId: "w-meera", timerSec: 55 },
  { title: "Broken fence along Industrial canal", description: "Section of the safety fence along the Industrial canal is knocked down.", citizen: "Pete", zone: 11, category: "safety", severity: "high", stage: "assigned", workerId: "w-ananya" },
  { title: "Low water pressure on Airport Rd", description: "Water pressure on Airport Rd has been very low since this morning.", citizen: "Yuki", zone: 12, category: "water", severity: "low", stage: "travelling", workerId: "w-sana", timerSec: 35 },
  { title: "Illegal dumping in Old Town alley", description: "Someone dumped mattresses and paint cans in the alley behind Old Town square.", citizen: "Rosa", zone: 2, category: "sanitation", severity: "medium", stage: "working", workerId: "w-kabir", timerSec: 65 },
  { title: "Faded crosswalk at Harbor school", description: "Crosswalk paint outside Harbor primary is almost invisible.", citizen: "Ben", zone: 1, category: "road", severity: "low", stage: "assigned", workerId: "w-ravi" },
  // --- Just reported, Intake picks these up first ---------------------------
  { title: "Branch hanging over Riverside sidewalk", description: "There's a huge tree branch hanging over the sidewalk on Riverside Drive, it cracked in the storm and looks like it could fall on people any minute.", citizen: "Aisha", zone: 4, category: "safety", severity: "high", stage: "reported" },
  { title: "Garbage not collected in Tech Park", description: "Garbage truck hasn't come for 2 weeks on Tech Park lane, the smell is terrible and rats are showing up.", citizen: "Chen", zone: 8, category: "sanitation", severity: "medium", stage: "reported" },
  // --- Already resolved today ------------------------------------------------
  { title: "Pothole on Harbor Road", description: "Pothole near the ferry terminal.", citizen: "Sam", zone: 1, category: "road", severity: "medium", stage: "resolved", workerId: "w-ravi", agoMin: 470, tookMin: 95, report: "Cut out and filled with hot asphalt, compacted." },
  { title: "Streetlight out on Elm St", description: "Streetlight completely dark.", citizen: "Ivy", zone: 5, category: "electrical", severity: "low", stage: "resolved", workerId: "w-priya", agoMin: 440, tookMin: 60, report: "Replaced the lamp and photocell, tested at dusk setting." },
  { title: "Overflowing bin at Market bus stop", description: "Bin overflowing.", citizen: "Olu", zone: 3, category: "sanitation", severity: "low", stage: "resolved", workerId: "w-arjun", agoMin: 420, tookMin: 35, report: "Emptied the bin and cleaned the area, added to daily route." },
  { title: "Burst pipe on Midtown Ave", description: "Water gushing from the road.", citizen: "Kara", zone: 7, category: "water", severity: "high", stage: "resolved", workerId: "w-kabir", agoMin: 400, tookMin: 140, report: "Shut the valve, replaced 2m of cracked main, restored supply." },
  { title: "Graffiti on Civic Center wall", description: "Offensive graffiti.", citizen: "Dan", zone: 6, category: "sanitation", severity: "low", stage: "resolved", workerId: "w-sana", agoMin: 380, tookMin: 80, report: "Pressure-washed and repainted the wall section." },
  { title: "Loose manhole cover on Tech Park Rd", description: "Manhole cover rattles and moves.", citizen: "Eli", zone: 8, category: "road", severity: "high", stage: "resolved", workerId: "w-dev", agoMin: 350, tookMin: 45, report: "Reseated the cover and replaced the worn frame gasket." },
  { title: "Downed power line in Industrial", description: "Wire hanging low across the street.", citizen: "Gus", zone: 11, category: "electrical", severity: "emergency", stage: "resolved", workerId: "w-ananya", agoMin: 330, tookMin: 50, report: "Isolated the circuit, re-strung the line at safe height, inspected poles." },
  { title: "Blocked storm drain in Greenbelt", description: "Drain clogged with leaves.", citizen: "Mia", zone: 10, category: "water", severity: "medium", stage: "resolved", workerId: "w-sana", agoMin: 300, tookMin: 70, report: "Cleared leaves and silt from the drain and the first 5m of pipe." },
  { title: "Broken swing at Hillside park", description: "Swing chain snapped.", citizen: "Zoe", zone: 9, category: "safety", severity: "medium", stage: "resolved", workerId: "w-dev", agoMin: 280, tookMin: 90, report: "Replaced both chains and the seat, checked the frame bolts." },
  { title: "Dead animal on Airport Rd", description: "Dead deer on the shoulder.", citizen: "Ray", zone: 12, category: "sanitation", severity: "medium", stage: "resolved", workerId: "w-sana", agoMin: 250, tookMin: 40, report: "Removed and disposed of the carcass, disinfected the area." },
  { title: "Traffic light stuck on red", description: "Light at Old Town junction stuck.", citizen: "Lea", zone: 2, category: "electrical", severity: "high", stage: "resolved", workerId: "w-priya", agoMin: 220, tookMin: 55, report: "Replaced the faulty controller relay, signals cycling normally." },
  { title: "Sinkhole forming on Riverside Dr", description: "Road sagging near the river.", citizen: "Max", zone: 4, category: "road", severity: "high", stage: "resolved", workerId: "w-meera", agoMin: 200, tookMin: 125, report: "Excavated the void, backfilled with gravel and concrete, resurfaced." },
  { title: "Leaking water meter in Midtown", description: "Meter box flooded.", citizen: "Ada", zone: 7, category: "water", severity: "low", stage: "resolved", workerId: "w-ravi", agoMin: 170, tookMin: 50, report: "Replaced the meter seal and the cracked coupling." },
  { title: "Needles found in School District park", description: "Used needles near the sandpit.", citizen: "Joy", zone: 5, category: "safety", severity: "high", stage: "resolved", workerId: "w-ananya", agoMin: 140, tookMin: 30, report: "Safely collected 6 needles with sharps kit, swept and inspected the area." },
  { title: "Overflowing recycling at Harbor", description: "Recycling bins full for days.", citizen: "Kim", zone: 1, category: "sanitation", severity: "low", stage: "resolved", workerId: "w-arjun", agoMin: 110, tookMin: 45, report: "Emptied the bins, scheduled an extra weekly pickup." },
  { title: "Exposed wiring at Civic Center bus shelter", description: "Wires sticking out of the shelter light.", citizen: "Tess", zone: 6, category: "electrical", severity: "high", stage: "resolved", workerId: "w-priya", agoMin: 90, tookMin: 35, report: "Made the wiring safe, replaced the fixture and cover plate." },
  { title: "Uneven paving in Market square", description: "Tiles lifted by roots.", citizen: "Abe", zone: 3, category: "road", severity: "low", stage: "resolved", workerId: "w-dev", agoMin: 70, tookMin: 50, report: "Relaid 12 paving tiles on a new sand bed." },
  { title: "Fountain pump failure in Greenbelt", description: "Fountain stopped.", citizen: "Una", zone: 10, category: "water", severity: "low", stage: "resolved", workerId: "w-kabir", agoMin: 50, tookMin: 30, report: "Replaced the pump impeller and cleaned the filter." },
  { title: "Request: bench repaint in Hillside", description: "Bench paint peeling.", citizen: "Vic", zone: 9, category: "safety", severity: "low", stage: "closed", agoMin: 300, tookMin: 20 },
];

/** Scripted citizen reports fired during the demo, seconds after reset. */
export const DEMO_SCRIPT: Array<{
  atSec: number;
  description: string;
  zone: number;
  citizen: string;
  flags?: SimFlags;
}> = [
  {
    atSec: 12,
    description:
      "The road outside the bakery on Market Street is broken, there's a big hole and my scooter almost tipped over.",
    zone: 3,
    citizen: "Leela",
  },
  {
    atSec: 25,
    description:
      "Strong smell of gas near the primary school gate on Elm Street, kids are still inside the building!",
    zone: 5,
    citizen: "Omar",
  },
  {
    atSec: 45,
    description:
      "Massive crater opened up on Hillside Road after the rain, cars are swerving into the other lane to avoid it.",
    zone: 9,
    citizen: "Tom",
  },
  {
    atSec: 65,
    description:
      "The streetlight pole outside Tech Park gate is sparking and the transformer box next to it is humming loudly.",
    zone: 8,
    citizen: "Grace",
    flags: { blocked: true },
  },
];

/** Pool for the automatic background reports. */
export const AUTO_REPORTS: Array<{ description: string; citizen: string }> = [
  { description: "Pothole the size of a pizza on the main road, my car tire nearly burst.", citizen: "Raj" },
  { description: "Streetlight on our corner has been dark for three nights, feels unsafe walking home.", citizen: "Emma" },
  { description: "Bins overflowing outside the community center, crows everywhere.", citizen: "Kofi" },
  { description: "Water is bubbling up through the cracks in the pavement near the bus stop.", citizen: "Sofia" },
  { description: "Someone left a pile of broken glass on the footpath near the playground.", citizen: "Liam" },
  { description: "Traffic signal is blinking yellow in all directions at the junction.", citizen: "Ana" },
  { description: "Drain is blocked and the street floods every time it rains.", citizen: "Noah" },
  { description: "Road sign knocked over at the roundabout, drivers are confused.", citizen: "Iris" },
  { description: "Smell of sewage near the riverside path, getting worse every day.", citizen: "Hugo" },
  { description: "Loose paving slab wobbles when you step on it, someone will fall.", citizen: "Maya" },
  { description: "Exposed electrical wires at the base of a lamp post near the school.", citizen: "Owen" },
  { description: "Fly-tipped fridge and sofa dumped on the corner of the lane.", citizen: "Lina" },
  { description: "Manhole cover is missing on the side street, it's just an open hole.", citizen: "Theo" },
  { description: "No water pressure in our whole block since last night.", citizen: "Dina" },
];

export function workerReportFor(category: string, good: boolean): string {
  const goodReports: Record<string, string> = {
    road: "Cut back the damaged surface, filled with hot asphalt and compacted it level with the road.",
    sanitation: "Cleared all waste, bagged it for disposal, washed down the area and logged it for the next route.",
    electrical: "Isolated the circuit, replaced the faulty component and tested the light through a full cycle.",
    water: "Shut off the supply, replaced the damaged section, restored pressure and checked for leaks.",
    safety: "Made the area safe, removed the hazard and put up permanent signage.",
  };
  const badReports: Record<string, string> = {
    road: "Threw some gravel in the hole for now, will need proper asphalt later.",
    sanitation: "Emptied two of the four bins, ran out of time for the rest.",
    electrical: "Tapped the fixture and it came back on, didn't find the cause.",
    water: "Wrapped tape around the leak, still dripping a bit.",
    safety: "Put a cone next to it.",
  };
  const pool = good ? goodReports : badReports;
  return pool[category] ?? pool.road!;
}

export const BLOCKED_REASON: Record<string, string> = {
  electrical: "transformer is faulty — needs a high-voltage specialist and a bucket truck",
  road: "needs a concrete crew, the sub-base has collapsed",
  water: "main valve is seized, needs the heavy valve key truck",
  sanitation: "hazardous chemicals found, needs a hazmat-certified team",
  safety: "structure is unstable, needs a structural engineer to sign off",
};

export async function resetCity() {
  const db = getDb();
  await db.delete(schema.activity);
  await db.delete(schema.notifications);
  await db.delete(schema.escalations);
  await db.delete(schema.incidents);
  await db.delete(schema.workers);
  await db.delete(schema.departments);
  await db.delete(schema.simState);

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  await db.insert(schema.departments).values(DEPARTMENT_SEED);
  await db.insert(schema.workers).values(
    WORKER_SEED.map((w) => ({
      id: w.id,
      name: w.name,
      skills: w.skills,
      homeZone: w.zone,
      currentZone: w.zone,
    })),
  );

  const incidentRows: (typeof schema.incidents.$inferInsert)[] = [];
  const notificationRows: (typeof schema.notifications.$inferInsert)[] = [];
  const activityRows: (typeof schema.activity.$inferInsert)[] = [];

  // Oldest first so ids increase with time.
  const ordered = [...SEED_INCIDENTS].sort(
    (a, b) => (b.agoMin ?? 0) - (a.agoMin ?? 0),
  );
  ordered.forEach((s, index) => {
    const seq = index + 1;
    const id = `INC-${String(seq).padStart(3, "0")}`;
    const createdMs =
      s.stage === "resolved" || s.stage === "closed"
        ? now - (s.agoMin ?? 60) * 60_000
        : s.stage === "reported"
          ? now - (index % 3) * 1000
          : now - (8 + index) * 60_000;
    const isOpenJob = ["assigned", "travelling", "working"].includes(s.stage);
    const resolvedMs =
      s.stage === "resolved" || s.stage === "closed"
        ? createdMs + (s.tookMin ?? 30) * 60_000
        : null;
    const classified = s.stage !== "reported";
    incidentRows.push({
      id,
      seq,
      title: classified ? s.title : s.description.slice(0, 57) + "...",
      description: s.description,
      citizenName: s.citizen,
      zone: s.zone,
      category: classified ? s.category : null,
      severity: classified ? s.severity : null,
      stage: s.stage,
      departmentIds: classified ? [DEPT_FOR[s.category]] : [],
      workerId: s.workerId ?? null,
      estCost: classified ? estimateCost(s.category, s.severity) : null,
      deadlineAt: classified
        ? iso(
            (isOpenJob ? now : createdMs) + DEADLINE_SECONDS[s.severity] * 1000,
          )
        : null,
      etaAt: s.stage === "travelling" ? iso(now + (s.timerSec ?? 20) * 1000) : null,
      workEndsAt: s.stage === "working" ? iso(now + (s.timerSec ?? 20) * 1000) : null,
      workerReport: s.report ?? null,
      qualityNote: s.stage === "resolved" ? "Fix verified against the report." : null,
      resolution:
        s.stage === "resolved"
          ? (s.report ?? "Fixed")
          : s.stage === "closed"
            ? "Deferred by supervisor: cosmetic, scheduled for spring maintenance."
            : null,
      simFlags: { ...(s.flags ?? {}), charged: classified },
      createdAt: iso(createdMs),
      updatedAt: iso(resolvedMs ?? createdMs),
      resolvedAt: resolvedMs ? iso(resolvedMs) : null,
    });
    if (isOpenJob) {
      notificationRows.push({
        id: crypto.randomUUID(),
        incidentId: id,
        stage: "assigned",
        message: `Thanks ${s.citizen}, a crew has been assigned to "${s.title}".`,
        at: iso(createdMs + 60_000),
      });
      if (s.stage === "working") {
        notificationRows.push({
          id: crypto.randomUUID(),
          incidentId: id,
          stage: "working",
          message: "The crew is on site and working on it now.",
          at: iso(now - 30_000),
        });
      }
    }
    if (s.stage === "resolved") {
      notificationRows.push({
        id: crypto.randomUUID(),
        incidentId: id,
        stage: "resolved",
        message: `Good news ${s.citizen}: "${s.title}" has been fixed. Thanks for reporting it!`,
        at: iso(resolvedMs!),
      });
      activityRows.push({
        id: crypto.randomUUID(),
        actor: "quality",
        actorName: "Quality",
        actionName: "review-fix",
        message: `approved the fix and closed ${id} — fix verified against the report`,
        incidentId: id,
        at: iso(resolvedMs!),
      });
    }
  });

  await db.insert(schema.incidents).values(incidentRows);
  if (notificationRows.length) await db.insert(schema.notifications).values(notificationRows);
  activityRows.push({
    id: crypto.randomUUID(),
    actor: "system",
    actorName: "System",
    actionName: "reset-simulation",
    message: `City Brain online — ${incidentRows.length} incidents loaded, ${WORKER_SEED.length} field workers on shift`,
    incidentId: null,
    at: iso(now),
  });
  await db.insert(schema.activity).values(activityRows);

  await db.insert(schema.simState).values({
    id: "main",
    running: true,
    autoReports: true,
    autoIntervalSec: 45,
    lastAutoAt: iso(now + 45_000), // first auto report after the script
    startedAt: iso(now),
    scriptIndex: 0,
    nextSeq: incidentRows.length + 1,
  });

  return { incidents: incidentRows.length, workers: WORKER_SEED.length };
}

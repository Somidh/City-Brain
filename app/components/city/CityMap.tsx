import { travelSeconds, zoneById, zoneDistance } from "@shared/city";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  CATEGORY_ICON,
  type CityIncident,
  type CityWorker,
  pinPosition,
  pinTone,
  STAGE_LABEL,
  TONE_VAR,
  useNow,
  ZONES,
} from "./lib";

// Map space is 0-100 on both axes; 4 columns x 3 rows of city blocks.
const COL_W = 25;
const ROW_H = 100 / 3;

const SKILL_BADGE: Record<string, string> = {
  road: "🚧",
  electrical: "⚡",
  water: "💧",
  sanitation: "🧹",
  safety: "🦺",
};

function zoneOrigin(zoneId: number) {
  const z = zoneById(zoneId) ?? { col: 0, row: 0 };
  return { x: z.col * COL_W, y: z.row * ROW_H };
}

/** Incident marker position in map space. */
function markerPoint(i: Pick<CityIncident, "id" | "zone">) {
  const o = zoneOrigin(i.zone);
  const p = pinPosition(i.id);
  return { x: o.x + (p.x / 100) * COL_W, y: o.y + (p.y / 100) * ROW_H };
}

/** Where an idle worker parks inside their zone (bottom-left lot). */
function parkingPoint(zoneId: number, slot: number) {
  const o = zoneOrigin(zoneId);
  return { x: o.x + 4.6 + slot * 3.4, y: o.y + ROW_H - 5 };
}

/** Deterministic little skyline per zone. */
function skyline(zoneId: number) {
  let seed = zoneId * 9301 + 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const buildings: Array<{ x: number; w: number; h: number; windows: Array<{ x: number; y: number; d: number }> }> = [];
  let x = 34;
  while (x < 100) {
    const w = 6 + rand() * 8;
    const h = 8 + rand() * 20;
    const windows: Array<{ x: number; y: number; d: number }> = [];
    for (let wy = 30 - h + 3; wy < 28; wy += 5) {
      for (let wx = x + 1.5; wx < x + w - 2; wx += 3.5) {
        if (rand() > 0.55) windows.push({ x: wx, y: wy, d: rand() * 6 });
      }
    }
    buildings.push({ x, w, h, windows });
    x += w + 1 + rand() * 2;
  }
  return buildings;
}
const SKYLINES = new Map(ZONES.map((z) => [z.id, skyline(z.id)]));

export function CityMap({
  incidents,
  workers,
  selectedId,
  onSelect,
}: {
  incidents: CityIncident[];
  workers: CityWorker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const now = useNow(1000);
  // Everything open, plus things closed in the last 3 hours as faint dots.
  const cutoff = now - 3 * 60 * 60 * 1000;
  const visible = incidents.filter(
    (i) =>
      i.stage !== "merged" &&
      (!["resolved", "closed"].includes(i.stage) ||
        Date.parse(i.resolvedAt ?? i.updatedAt) > cutoff),
  );
  const byId = new Map(incidents.map((i) => [i.id, i]));

  // Work out where every worker is right now.
  const parkedPerZone = new Map<number, number>();
  const crew = workers.map((w) => {
    const jobs = w.jobs.map((id) => byId.get(id)).filter(Boolean) as CityIncident[];
    const active =
      jobs.find((j) => j.stage === "working") ??
      jobs.find((j) => j.stage === "travelling") ??
      null;
    const slot = parkedPerZone.get(w.zone) ?? 0;
    const home = parkingPoint(w.zone, slot);
    let pos = home;
    let target: { x: number; y: number } | null = null;
    let progress = 0;
    if (active) {
      const dest = markerPoint(active);
      const beside = { x: dest.x - 2.4, y: dest.y + 2.6 };
      if (active.stage === "working") {
        pos = beside;
      } else {
        const total = travelSeconds(zoneDistance(w.zone, active.zone));
        const left = active.etaAt ? Math.max(0, (Date.parse(active.etaAt) - now) / 1000) : total;
        progress = Math.min(1, Math.max(0, 1 - left / total));
        pos = { x: home.x + (beside.x - home.x) * progress, y: home.y + (beside.y - home.y) * progress };
        target = beside;
      }
    } else {
      parkedPerZone.set(w.zone, slot + 1);
    }
    return { worker: w, pos, target, active, progress };
  });

  return (
    <div className="city-streets relative h-full min-h-0 overflow-hidden rounded-lg">
      {/* Lane markings */}
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {[25, 50, 75].map((x) => (
          <line key={`v${x}`} x1={x} y1={0} x2={x} y2={100} stroke="hsl(var(--sev-pending) / 0.28)" strokeWidth={1} strokeDasharray="5 7" vectorEffect="non-scaling-stroke" />
        ))}
        {[ROW_H, ROW_H * 2].map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={100} y2={y} stroke="hsl(var(--sev-pending) / 0.28)" strokeWidth={1} strokeDasharray="5 7" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {/* City blocks */}
      {ZONES.map((zone) => {
        const open = visible.filter(
          (i) => i.zone === zone.id && !["resolved", "closed"].includes(i.stage),
        );
        const hot = open.some((i) => i.severity === "emergency");
        return (
          <div
            key={zone.id}
            className={cn("city-block absolute overflow-hidden rounded-md border border-border", hot && "city-block--alert")}
            style={{
              left: `calc(${zone.col * COL_W}% + 6px)`,
              top: `calc(${zone.row * ROW_H}% + 6px)`,
              width: `calc(${COL_W}% - 12px)`,
              height: `calc(${ROW_H}% - 12px)`,
            }}
          >
            <svg className="city-skyline pointer-events-none absolute inset-x-0 bottom-0 h-[42%] w-full opacity-55" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
              {SKYLINES.get(zone.id)!.map((b, idx) => (
                <g key={idx}>
                  <rect x={b.x} y={30 - b.h} width={b.w} height={b.h} fill="hsl(222 30% 14%)" />
                  {b.windows.map((w, wi) => (
                    <rect key={wi} className="win" x={w.x} y={w.y} width={1.4} height={1.6} style={{ animationDelay: `${w.d}s` }} />
                  ))}
                </g>
              ))}
            </svg>
            <div className="absolute inset-x-2 top-1.5 flex min-w-0 items-center gap-1.5 text-[11px]">
              <span className="city-mono shrink-0 text-[10px] text-muted-foreground">{String(zone.id).padStart(2, "0")}</span>
              <span className="truncate font-semibold tracking-tight text-foreground/85">{zone.name}</span>
              {open.length ? (
                <span
                  className="ml-auto shrink-0 rounded-full px-1.5 text-[10px] font-semibold"
                  style={{
                    background: hot ? "hsl(var(--sev-emergency) / 0.25)" : "hsl(var(--muted))",
                    color: hot ? "hsl(var(--sev-emergency))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  {open.length}
                  <span className="sr-only"> open</span>
                </span>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* Routes for workers on the move */}
      <svg className="pointer-events-none absolute inset-0 z-10 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {crew
          .filter((c) => c.target)
          .map((c) => (
            <line
              key={c.worker.id}
              className="city-route"
              x1={c.pos.x}
              y1={c.pos.y}
              x2={c.target!.x}
              y2={c.target!.y}
              stroke="hsl(var(--city-accent))"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </svg>

      {/* Incident markers */}
      {visible.map((i) => {
        const tone = pinTone(i);
        const p = markerPoint(i);
        const closed = tone === "resolved" || tone === "muted";
        const fresh = now - Date.parse(i.createdAt) < 8000;
        const color = `hsl(${TONE_VAR[tone]})`;
        return (
          <Tooltip key={i.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelect(i.id)}
                aria-label={`${i.id} ${i.title}`}
                className={cn(
                  "city-marker absolute z-20 flex items-center justify-center rounded-full",
                  closed ? "size-2.5" : "size-7 border-2 text-[13px]",
                  tone === "emergency" && "city-pin--emergency",
                  fresh && "city-marker--new",
                  selectedId === i.id && "ring-2 ring-white ring-offset-2 ring-offset-[hsl(var(--city-road))]",
                )}
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: "translate(-50%, -50%)",
                  background: closed ? color : `hsl(${TONE_VAR[tone]} / 0.18)`,
                  borderColor: color,
                  opacity: closed ? 0.55 : 1,
                  boxShadow: closed ? undefined : `0 0 14px hsl(${TONE_VAR[tone]} / 0.55)`,
                  color,
                }}
              >
                {closed ? null : <span aria-hidden>{CATEGORY_ICON[i.category ?? ""] ?? "❔"}</span>}
                {fresh && !closed ? <span className="city-ripple" aria-hidden /> : null}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <span className="city-mono">{i.id}</span> {i.title}
              <br />
              <span className="text-muted-foreground">
                {STAGE_LABEL[i.stage] ?? i.stage}
                {i.reportCount > 1 ? ` · ${i.reportCount} reports` : ""}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}

      {/* Field workers */}
      {crew.map(({ worker: w, pos, active, progress }) => {
        const moving = active?.stage === "travelling";
        const working = active?.stage === "working";
        return (
          <Tooltip key={w.id}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "city-worker absolute z-30 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[10px] font-bold",
                  active
                    ? "border-[hsl(var(--city-accent))] bg-[hsl(var(--city-accent))] text-primary-foreground shadow-[0_0_12px_hsl(var(--city-accent)/0.7)]"
                    : w.load
                      ? "border-[hsl(var(--city-accent)/0.7)] bg-[hsl(var(--city-accent)/0.2)] text-foreground"
                      : "border-border bg-card text-muted-foreground",
                )}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                {w.name.charAt(0)}
                {moving ? (
                  <span className="absolute -right-2 -top-2 text-[11px]" aria-hidden>
                    🚐
                  </span>
                ) : working ? (
                  <span className="city-wrench absolute -right-2 -top-2 text-[11px]" aria-hidden>
                    🔧
                  </span>
                ) : null}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {SKILL_BADGE[w.skills[0] ?? ""]} <b>{w.name}</b> · {w.skills.join(", ")}
              <br />
              <span className="text-muted-foreground">
                {moving
                  ? `Driving to ${active!.id} · ${Math.round(progress * 100)}%`
                  : working
                    ? `On site at ${active!.id}`
                    : w.load
                      ? `${w.load}/${w.maxJobs} jobs queued`
                      : "Free"}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

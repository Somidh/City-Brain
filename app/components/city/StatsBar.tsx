import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { type CityState, useNow } from "./lib";

/** A playful one-glance read of how the city is doing, from real signals. */
function cityMood(state: CityState, now: number) {
  const open = state.incidents.filter(
    (i) => !["resolved", "closed", "merged"].includes(i.stage),
  );
  const emergencies = open.filter((i) => i.severity === "emergency").length;
  const overdue = open.filter(
    (i) => i.deadlineAt && Date.parse(i.deadlineAt) < now && i.stage !== "escalated",
  ).length;
  const waiting = state.stats.openEscalations;
  const score = Math.max(
    0,
    Math.min(100, 100 - emergencies * 18 - waiting * 7 - overdue * 5 - Math.max(0, open.length - 6) * 2),
  );
  const face = score >= 85 ? "😄" : score >= 65 ? "🙂" : score >= 45 ? "😐" : score >= 25 ? "😟" : "😱";
  const label = score >= 85 ? "Thriving" : score >= 65 ? "Calm" : score >= 45 ? "Busy" : score >= 25 ? "Stressed" : "Crisis";
  return { score, face, label, emergencies, waiting, overdue };
}

export function StatsBar({ state }: { state: CityState }) {
  const now = useNow(2000);
  const s = state.stats;
  const mood = cityMood(state, now);
  const items = [
    { label: "Issues today", value: s.totalToday },
    { label: "Open", value: s.open },
    { label: "Resolved", value: s.resolved },
    { label: "Avg fix time", value: `${s.avgResolutionMin}m` },
    { label: "Escalation rate", value: `${s.escalationRate}%` },
  ];
  const moodColor =
    mood.score >= 65 ? "var(--sev-resolved)" : mood.score >= 45 ? "var(--sev-pending)" : "var(--sev-emergency)";

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-border bg-card px-3 py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 py-1 pl-1.5 pr-3">
            <span className="text-2xl leading-none" aria-hidden>
              {mood.face}
            </span>
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">City mood</div>
              <div className="text-sm font-semibold" style={{ color: `hsl(${moodColor})` }}>
                {mood.label} <span className="city-mono text-xs opacity-80">{mood.score}</span>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {mood.emergencies} open emergencies · {mood.waiting} waiting on you · {mood.overdue} overdue
        </TooltipContent>
      </Tooltip>
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="city-mono text-lg font-semibold tabular-nums">{it.value}</span>
          <span className="text-[11px] text-muted-foreground">{it.label}</span>
        </div>
      ))}
      <div className="ml-auto flex items-center gap-2 whitespace-nowrap text-[11px] text-muted-foreground">
        <span
          className="size-2 rounded-full"
          style={{
            background: state.llm.provider === "rules" ? "hsl(var(--sev-pending))" : "hsl(var(--sev-resolved))",
          }}
        />
        Agents thinking with <span className="city-mono text-foreground">{state.llm.model}</span>
      </div>
    </div>
  );
}

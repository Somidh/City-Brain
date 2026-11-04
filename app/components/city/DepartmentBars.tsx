import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { type CityDepartment, money } from "./lib";

const DEPT_ICON: Record<string, string> = {
  roads: "🚧",
  sanitation: "🧹",
  electrical: "⚡",
  water: "💧",
  safety: "🦺",
};

export function DepartmentBars({ departments }: { departments: CityDepartment[] }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {departments.map((d) => {
        const pct = d.budgetTotal ? Math.max(0, d.budgetRemaining / d.budgetTotal) : 0;
        const alert = d.lowBudget || d.overloaded;
        const busy = d.workers - d.availableWorkers;
        return (
          <div
            key={d.id}
            className={cn(
              "relative overflow-hidden rounded-xl border bg-card px-3 py-2 transition-colors duration-500",
              alert ? "border-[hsl(var(--sev-emergency)/0.7)]" : "border-border",
            )}
            style={alert ? { boxShadow: "inset 0 0 28px hsl(var(--sev-emergency) / 0.14)" } : undefined}
          >
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-base" aria-hidden>
                {DEPT_ICON[d.id]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{d.name}</span>
                  {alert ? (
                    <span className="shrink-0 rounded-full bg-[hsl(var(--sev-emergency)/0.2)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[hsl(var(--sev-emergency))] motion-safe:animate-pulse">
                      {d.lowBudget ? "Low budget" : "Overloaded"}
                    </span>
                  ) : (
                    <span className="city-mono shrink-0 text-[11px] text-muted-foreground">{d.activeJobs} jobs</span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-0.5" aria-label={`${d.availableWorkers} of ${d.workers} workers free`}>
                        {Array.from({ length: d.workers }, (_, i) => (
                          <span
                            key={i}
                            className="size-2 rounded-full transition-colors duration-500"
                            style={{
                              background: i < busy ? "hsl(var(--city-accent))" : "hsl(var(--muted-foreground) / 0.35)",
                            }}
                          />
                        ))}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {busy} busy · {d.availableWorkers} free · {d.activeJobs} active jobs
                    </TooltipContent>
                  </Tooltip>
                  <span className={cn("city-mono text-[11px]", d.lowBudget ? "font-semibold text-[hsl(var(--sev-emergency))]" : "text-muted-foreground")}>
                    {money(d.budgetRemaining)}
                  </span>
                </div>
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-muted">
              <div
                className="h-full transition-[width] duration-700"
                style={{
                  width: `${Math.round(pct * 100)}%`,
                  background: d.lowBudget ? "hsl(var(--sev-emergency))" : "hsl(var(--city-accent))",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useActionQuery } from "@agent-native/core/client/hooks";
import { Link, useParams } from "react-router";

import { timeAgo, useNow, zoneById } from "@/components/city/lib";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: "Your report — City Brain" }];
}

const STEPS = [
  { key: "received", label: "Received", stages: ["reported", "classified", "routed", "escalated", "merged"] },
  { key: "assigned", label: "Crew assigned", stages: ["assigned", "travelling"] },
  { key: "working", label: "Being fixed", stages: ["working", "review"] },
  { key: "resolved", label: "Fixed", stages: ["resolved"] },
];

export default function TrackRoute() {
  const { incidentId = "" } = useParams();
  const now = useNow();
  const { data, isPending, error } = useActionQuery(
    "get-incident",
    { incidentId },
    { refetchInterval: 1500 },
  );

  return (
    <div className="city-ops flex min-h-full items-start justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-between text-xs text-muted-foreground">
          <Link to="/report" className="hover:text-foreground">← New report</Link>
          <Link to={`/city?incident=${incidentId}`} className="hover:text-foreground">Supervisor view →</Link>
        </div>
        {/* Phone frame */}
        <div className="mt-3 overflow-hidden rounded-[2.2rem] border-[6px] border-[hsl(0_0%_16%)] bg-[hsl(0_0%_8%)] shadow-2xl">
          <div className="flex items-center justify-between bg-[hsl(0_0%_11%)] px-5 py-3">
            <div>
              <div className="text-sm font-semibold">City Services</div>
              <div className="text-[11px] text-muted-foreground">SMS · {incidentId.toUpperCase()}</div>
            </div>
            <span className="text-lg" aria-hidden>🏙️</span>
          </div>
          {isPending ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : error || !data ? (
            <p className="p-6 text-sm text-muted-foreground">We couldn't find that report.</p>
          ) : (
            <div className="flex min-h-[28rem] flex-col">
              <ol className="flex items-center justify-between gap-1 border-b border-border px-4 py-3">
                {STEPS.map((s, idx) => {
                  const current = STEPS.findIndex((x) => x.stages.includes(data.incident.stage));
                  const done = current >= idx || data.incident.stage === "resolved";
                  return (
                    <li key={s.key} className="flex flex-1 flex-col items-center gap-1 text-center">
                      <span
                        className={cn(
                          "size-2.5 rounded-full transition-colors duration-500",
                          done ? "bg-[hsl(var(--sev-resolved))]" : "bg-muted",
                        )}
                      />
                      <span className={cn("text-[10px]", done ? "text-foreground" : "text-muted-foreground")}>
                        {s.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[hsl(var(--city-accent))] px-3 py-2 text-sm text-white">
                  {data.incident.description}
                  <div className="mt-0.5 text-right text-[10px] text-white/70">
                    {zoneById(data.incident.zone)?.name} · {timeAgo(data.incident.createdAt, now)}
                  </div>
                </div>
                {data.messages.map((m) => (
                  <div key={m.id} className="city-feed-item max-w-[85%] rounded-2xl rounded-bl-sm bg-[hsl(0_0%_16%)] px-3 py-2 text-sm">
                    {m.message}
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(m.at, now)}</div>
                  </div>
                ))}
                {data.messages.length === 0 ? (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-[hsl(0_0%_16%)] px-3 py-2 text-sm text-muted-foreground">
                    <span className="motion-safe:animate-pulse">Agents are reading your report…</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

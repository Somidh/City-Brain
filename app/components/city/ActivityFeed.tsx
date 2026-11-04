import { Fragment } from "react";

import { cn } from "@/lib/utils";

import { ACTOR_META, type Actor, type CityActivity, timeAgo, useNow } from "./lib";

/** One hue per actor so the hand-offs read as a conversation. */
const ACTOR_HUE: Record<string, string> = {
  citizen: "210 80% 65%",
  intake: "199 89% 60%",
  router: "262 83% 70%",
  department: "32 95% 60%",
  worker: "45 96% 58%",
  quality: "142 69% 50%",
  comms: "330 81% 66%",
  supervisor: "172 70% 48%",
  copilot: "172 70% 48%",
  system: "218 14% 60%",
};

/** Turns "INC-042" mentions into small clickable chips. */
function withIncidentChips(text: string, onSelect: (id: string) => void) {
  const parts = text.split(/(INC-\d{3,})/g);
  return parts.map((part, idx) =>
    /^INC-\d{3,}$/.test(part) ? (
      <button
        key={idx}
        type="button"
        onClick={() => onSelect(part)}
        className="city-mono mx-0.5 rounded bg-muted px-1 text-[11px] text-foreground hover:bg-[hsl(var(--city-accent)/0.25)]"
      >
        {part}
      </button>
    ) : (
      <Fragment key={idx}>{part}</Fragment>
    ),
  );
}

export function ActivityFeed({
  activity,
  onSelectIncident,
}: {
  activity: CityActivity[];
  onSelectIncident: (id: string) => void;
}) {
  const now = useNow();
  return (
    <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1" aria-live="polite">
      {activity.map((a) => {
        const meta = ACTOR_META[a.actor as Actor] ?? ACTOR_META.system;
        const hue = ACTOR_HUE[a.actor] ?? ACTOR_HUE.system!;
        const human = a.actor === "supervisor" || a.actor === "copilot";
        return (
          <li
            key={a.id}
            className={cn(
              "city-feed-item rounded-lg border-l-2 py-1.5 pl-2 pr-1.5 text-[12.5px] leading-snug",
              human ? "bg-[hsl(var(--city-accent)/0.1)]" : "bg-card/40",
            )}
            style={{ borderLeftColor: `hsl(${hue})` }}
          >
            <div className="flex items-start gap-2">
              <span
                className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-[13px]"
                style={{ background: `hsl(${hue} / 0.16)` }}
                aria-hidden
              >
                {meta.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-semibold" style={{ color: `hsl(${hue})` }}>
                  {a.actorName}
                </span>{" "}
                <span className="text-foreground/85">{withIncidentChips(a.message, onSelectIncident)}</span>
                <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                  <span>{timeAgo(a.at, now)}</span>
                  <span className="city-mono rounded bg-muted px-1 text-[10px]" title="The shared defineAction() this step called">
                    {a.actionName}()
                  </span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

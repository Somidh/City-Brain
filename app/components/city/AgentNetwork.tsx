import { Fragment } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ACTOR_META, type Actor, type CityActivity, timeAgo, useNow } from "./lib";

/** The pipeline in hand-off order, plus the copilot that works beside it. */
const PIPELINE: Actor[] = ["intake", "router", "department", "worker", "quality", "comms"];
const LIVE_MS = 3500;

export function AgentNetwork({ activity }: { activity: CityActivity[] }) {
  const now = useNow(500);
  const last = new Map<string, CityActivity>();
  for (const a of activity) if (!last.has(a.actor)) last.set(a.actor, a);

  const node = (actor: Actor) => {
    const meta = ACTOR_META[actor];
    const a = last.get(actor);
    const live = a ? now - Date.parse(a.at) < LIVE_MS : false;
    return (
      <Tooltip key={actor}>
        <TooltipTrigger asChild>
          <div
            role="img"
            aria-label={`${meta.name} agent${live ? ", working now" : ""}`}
            className={cn(
              "city-agent-node flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-medium",
              live
                ? "city-agent-node--live border-transparent bg-[hsl(var(--city-accent)/0.18)] text-foreground"
                : "border-border bg-card/60 text-muted-foreground",
            )}
          >
            <span className="city-agent-emoji inline-block text-sm leading-none" aria-hidden>
              {meta.emoji}
            </span>
            <span className="hidden min-[1800px]:inline">{meta.name}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          <b>{meta.name} agent</b>
          <br />
          {a ? (
            <span className="text-muted-foreground">
              {timeAgo(a.at, now)}: {a.message.slice(0, 110)}
              {a.message.length > 110 ? "…" : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Waiting for work</span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <nav aria-label="Agent network" className="flex min-w-0 items-center gap-1">
      {PIPELINE.map((actor, idx) => (
        <Fragment key={actor}>
          {idx > 0 ? (
            <span className="text-[10px] text-muted-foreground/50" aria-hidden>
              →
            </span>
          ) : null}
          {node(actor)}
        </Fragment>
      ))}
      <span className="mx-1.5 h-5 w-px bg-border" aria-hidden />
      {node("copilot")}
    </nav>
  );
}

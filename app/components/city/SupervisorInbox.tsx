import {
  actionErrorMessage,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import { IconCheck, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  ACTOR_META,
  type Actor,
  type CityEscalation,
  type CityIncident,
  timeAgo,
  useNow,
} from "./lib";

const REASON_LABEL: Record<string, { label: string; tone: string }> = {
  emergency: { label: "Emergency", tone: "var(--sev-emergency)" },
  budget: { label: "Budget", tone: "var(--sev-high)" },
  no_workers: { label: "No workers", tone: "var(--sev-pending)" },
  blocked: { label: "Blocked", tone: "var(--sev-pending)" },
  sensitive: { label: "Sensitive", tone: "var(--city-accent)" },
};

export function SupervisorInbox({
  escalations,
  incidents,
  onSelectIncident,
}: {
  escalations: CityEscalation[];
  incidents: CityIncident[];
  onSelectIncident: (id: string) => void;
}) {
  const now = useNow();
  const resolve = useActionMutation("resolve-escalation", {
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? "Could not record the decision."),
    onSuccess: (result) => toast.success(`${result.incidentId}: ${result.outcome}`),
  });
  const open = escalations.filter((e) => e.status === "open");
  const decided = escalations.filter((e) => e.status !== "open").slice(0, 6);
  const title = (id: string) => incidents.find((i) => i.id === id)?.title ?? id;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
      {open.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <span className="text-3xl" aria-hidden>
            ☕
          </span>
          <span className="text-sm font-semibold">All quiet</span>
          <span className="text-xs text-muted-foreground">The agents have the city. Escalations land here.</span>
        </div>
      ) : null}
      {open.map((e) => {
        const reason = REASON_LABEL[e.reason] ?? REASON_LABEL.sensitive!;
        const busy = resolve.isPending && resolve.variables?.escalationId === e.id;
        return (
          <article
            key={e.id}
            className="city-feed-item rounded-lg border bg-card p-3"
            style={{ borderColor: `hsl(${reason.tone} / 0.6)` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: `hsl(${reason.tone} / 0.18)`, color: `hsl(${reason.tone})` }}
              >
                {reason.label}
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                {ACTOR_META[e.raisedBy as Actor]?.emoji} {ACTOR_META[e.raisedBy as Actor]?.name ?? e.raisedBy} · {timeAgo(e.createdAt, now)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectIncident(e.incidentId)}
              className="mt-2 block text-left text-sm font-semibold hover:underline"
            >
              <span className="city-mono text-muted-foreground">{e.incidentId}</span> {title(e.incidentId)}
            </button>
            <p className="mt-1 text-xs text-foreground/80">{e.summary}</p>
            <div className="mt-2 rounded-md bg-muted/70 p-2 text-xs">
              <span className="font-semibold text-[hsl(var(--city-accent))]">Agent recommends: </span>
              {e.recommendation}
            </div>
            <div className="mt-2.5 flex gap-2">
              <Button
                size="sm"
                className="h-8 flex-1 gap-1 bg-[hsl(var(--sev-resolved))] text-black hover:bg-[hsl(var(--sev-resolved)/0.85)]"
                disabled={busy}
                onClick={() => resolve.mutate({ escalationId: e.id, decision: "approve" })}
              >
                <IconCheck className="size-4" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 flex-1 gap-1"
                disabled={busy}
                onClick={() => resolve.mutate({ escalationId: e.id, decision: "override" })}
              >
                <IconX className="size-4" /> Override
              </Button>
            </div>
          </article>
        );
      })}
      {decided.length ? (
        <div className="mt-2">
          <div className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recently decided
          </div>
          <ul className="space-y-1">
            {decided.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11.5px] text-muted-foreground">
                <button type="button" className="city-mono hover:underline" onClick={() => onSelectIncident(e.incidentId)}>
                  {e.incidentId}
                </button>
                <span className="truncate">{REASON_LABEL[e.reason]?.label ?? e.reason}</span>
                <span
                  className={cn(
                    "shrink-0 font-semibold",
                    e.status === "approved" ? "text-[hsl(var(--sev-resolved))]" : "text-[hsl(var(--sev-high))]",
                  )}
                >
                  {e.status === "approved" ? "Approved" : "Overridden"} by {e.resolvedBy === "copilot" ? "🤖 copilot" : "you"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

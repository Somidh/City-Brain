import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import {
  ACTOR_META,
  type Actor,
  CATEGORY_ICON,
  type CityWorker,
  DEPARTMENT_LABEL,
  money,
  pinTone,
  secondsUntil,
  STAGE_LABEL,
  timeAgo,
  TONE_VAR,
  useNow,
  zoneById,
} from "./lib";

const CATEGORY_FOR_DEPT: Record<string, string> = {
  roads: "road",
  sanitation: "sanitation",
  electrical: "electrical",
  water: "water",
  safety: "safety",
};

export function IncidentDrawer({
  incidentId,
  workers,
  onClose,
}: {
  incidentId: string | null;
  workers: CityWorker[];
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(incidentId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="city-ops w-[min(30rem,100vw)] overflow-y-auto border-border p-0 sm:max-w-none">
        {incidentId ? <DrawerBody incidentId={incidentId} workers={workers} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ incidentId, workers }: { incidentId: string; workers: CityWorker[] }) {
  const now = useNow();
  const { data, isPending } = useActionQuery(
    "get-incident",
    { incidentId },
    { refetchInterval: 1500 },
  );
  const [workerId, setWorkerId] = useState("");
  const assign = useActionMutation("assign-worker", {
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Could not reassign."),
    onSuccess: (r) => toast.success(`${r.id} reassigned to ${r.workerName}`),
  });
  const resolve = useActionMutation("resolve-escalation", {
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Could not record the decision."),
  });

  if (isPending || !data) {
    return (
      <div className="space-y-3 p-5">
        <SheetTitle className="sr-only">Loading incident</SheetTitle>
        <SheetDescription className="sr-only">Loading incident details</SheetDescription>
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const { incident, worker, history, messages, escalations, duplicates } = data;
  const tone = pinTone(incident);
  const lead = incident.departmentIds[0];
  const eta = secondsUntil(incident.etaAt, now);
  const workLeft = secondsUntil(incident.workEndsAt, now);
  const deadline = secondsUntil(incident.deadlineAt, now);
  const overdue =
    incident.deadlineAt && Date.parse(incident.deadlineAt) < now && !["resolved", "merged", "closed"].includes(incident.stage);
  const canReassign = ["routed", "assigned", "travelling"].includes(incident.stage);
  const skill = lead ? CATEGORY_FOR_DEPT[lead] : undefined;
  const eligible = workers.filter((w) => (skill ? w.skills.includes(skill) : true));
  const openEsc = escalations.find((e) => e.status === "open");

  return (
    <div className="flex flex-col gap-4 p-5">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="city-mono">{incident.id}</span>
          <span
            className="rounded px-1.5 py-0.5 font-semibold"
            style={{ background: `hsl(${TONE_VAR[tone]} / 0.18)`, color: `hsl(${TONE_VAR[tone]})` }}
          >
            {STAGE_LABEL[incident.stage] ?? incident.stage}
          </span>
          {incident.severity ? <span className="uppercase">{incident.severity}</span> : null}
        </div>
        <SheetTitle className="mt-1 text-lg font-semibold leading-tight">
          {CATEGORY_ICON[incident.category ?? ""] ?? "❔"} {incident.title}
        </SheetTitle>
        <SheetDescription className="mt-1 text-xs text-muted-foreground">
          Zone {incident.zone} · {zoneById(incident.zone)?.name} · reported by {incident.citizenName} {timeAgo(incident.createdAt, now)}
          {incident.reportCount > 1 ? ` · ${incident.reportCount} reports` : ""}
        </SheetDescription>
      </div>

      <blockquote className="rounded-md border-l-2 border-[hsl(var(--city-accent))] bg-muted/60 px-3 py-2 text-sm">
        “{incident.description}”
      </blockquote>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Fact label="Department" value={incident.departmentIds.map((d) => DEPARTMENT_LABEL[d as keyof typeof DEPARTMENT_LABEL] ?? d).join(" + ") || "—"} />
        <Fact label="Worker" value={worker ? `${worker.name} (${worker.skills.join(", ")})` : "—"} />
        <Fact label="Estimate" value={incident.estCost ? money(incident.estCost) : "—"} />
        <Fact
          label={overdue ? "Deadline" : "Deadline in"}
          value={overdue ? "Overdue" : deadline !== null ? `${deadline}s` : "—"}
          alert={Boolean(overdue)}
        />
        {incident.stage === "travelling" && eta !== null ? <Fact label="Arrives in" value={`${eta}s`} /> : null}
        {incident.stage === "working" && workLeft !== null ? <Fact label="Done in" value={`~${workLeft}s`} /> : null}
        {incident.reopenCount ? <Fact label="Reopened" value={`${incident.reopenCount}×`} alert /> : null}
        {incident.duplicateOf ? <Fact label="Duplicate of" value={incident.duplicateOf} /> : null}
      </dl>

      {incident.agentNote || incident.workerReport || incident.qualityNote ? (
        <div className="space-y-1.5 text-xs">
          {incident.agentNote ? <Note who="📥 Intake" text={incident.agentNote} /> : null}
          {incident.workerReport ? <Note who="👷 Worker" text={incident.workerReport} /> : null}
          {incident.qualityNote ? <Note who="✅ Quality" text={incident.qualityNote} /> : null}
        </div>
      ) : null}

      {openEsc ? (
        <div className="rounded-lg border border-[hsl(var(--sev-high)/0.6)] bg-card p-3 text-xs">
          <div className="font-semibold">Waiting for you: {openEsc.reason.replace("_", " ")}</div>
          <p className="mt-1 text-foreground/80">{openEsc.summary}</p>
          <p className="mt-1"><b className="text-[hsl(var(--city-accent))]">Recommends:</b> {openEsc.recommendation}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-8 flex-1" disabled={resolve.isPending} onClick={() => resolve.mutate({ escalationId: openEsc.id, decision: "approve" })}>
              Approve
            </Button>
            <Button size="sm" variant="outline" className="h-8 flex-1" disabled={resolve.isPending} onClick={() => resolve.mutate({ escalationId: openEsc.id, decision: "override" })}>
              Override
            </Button>
          </div>
        </div>
      ) : null}

      {canReassign ? (
        <div className="flex items-center gap-2 text-xs">
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
            aria-label="Reassign to worker"
          >
            <option value="">Reassign to…</option>
            {eligible.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — zone {w.zone}, {w.load}/{w.maxJobs} jobs
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={!workerId || assign.isPending}
            onClick={() => assign.mutate({ incidentId: incident.id, workerId })}
          >
            Assign
          </Button>
        </div>
      ) : null}

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agent history</h3>
        <ol className="relative space-y-2 border-l border-border pl-4">
          {history.map((h) => (
            <li key={h.id} className="text-xs">
              <span className="absolute -left-[5px] mt-1 size-2.5 rounded-full border border-border bg-card" />
              <span className="mr-1">{ACTOR_META[h.actor as Actor]?.emoji}</span>
              <b>{h.actorName}</b> <span className="text-foreground/80">{h.message}</span>
              <div className="mt-0.5 flex gap-2 text-[10.5px] text-muted-foreground">
                <span>{timeAgo(h.at, now)}</span>
                <span className="city-mono">{h.actionName}()</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Messages to {incident.citizenName}</h3>
          <Link to={`/track/${incident.id}`} className="text-[11px] text-[hsl(var(--city-accent))] hover:underline">
            Citizen view →
          </Link>
        </div>
        {messages.length ? (
          <ul className="space-y-1.5">
            {messages.map((m) => (
              <li key={m.id} className="rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-xs">
                {m.message}
                <div className="mt-0.5 text-[10px] text-muted-foreground">💬 {m.stage} · {timeAgo(m.at, now)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No messages yet.</p>
        )}
        {duplicates.length ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Also reported by {duplicates.map((d) => `${d.citizenName} (${d.id})`).join(", ")}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Fact({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={alert ? "font-semibold text-[hsl(var(--sev-emergency))]" : "font-medium"}>{value}</dd>
    </div>
  );
}

function Note({ who, text }: { who: string; text: string }) {
  return (
    <p className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <b className="mr-1">{who}:</b>
      <span className="text-foreground/80">{text}</span>
    </p>
  );
}

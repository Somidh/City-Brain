import {
  actionErrorMessage,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSpeakerphone,
} from "@tabler/icons-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { ActivityFeed } from "@/components/city/ActivityFeed";
import { AgentNetwork } from "@/components/city/AgentNetwork";
import { CityMap } from "@/components/city/CityMap";
import { DepartmentBars } from "@/components/city/DepartmentBars";
import { IncidentDrawer } from "@/components/city/IncidentDrawer";
import { useCityState } from "@/components/city/lib";
import { StatsBar } from "@/components/city/StatsBar";
import { SupervisorInbox } from "@/components/city/SupervisorInbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function meta() {
  return [{ title: "City Brain — Supervisor" }];
}

export default function CityRoute() {
  const { data } = useCityState();
  const [params, setParams] = useSearchParams();
  const selected = params.get("incident");
  const [confirmReset, setConfirmReset] = useState(false);

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("incident", id);
    else next.delete("incident");
    setParams(next, { replace: true });
  };

  const setSim = useActionMutation("set-simulation", {
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Could not update the simulation."),
  });
  const reset = useActionMutation("reset-simulation", {
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Reset failed."),
    onSuccess: () => {
      setConfirmReset(false);
      toast.success("City reset — demo timeline restarted");
    },
  });

  if (!data) {
    return (
      <div className="city-ops flex h-full flex-col gap-3 p-3">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(14rem,19rem)_minmax(0,1fr)_minmax(15rem,22rem)] gap-3">
          <Skeleton className="rounded-lg" />
          <Skeleton className="rounded-lg" />
          <Skeleton className="rounded-lg" />
        </div>
        <Skeleton className="h-11 rounded-lg" />
      </div>
    );
  }

  const running = data.sim?.running ?? false;
  const openEscalations = data.escalations.filter((e) => e.status === "open").length;

  return (
    <div className="city-ops flex h-full min-h-[40rem] flex-col gap-3 p-3">
      <header className="flex items-center gap-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className="flex size-9 items-center justify-center rounded-xl bg-[hsl(var(--city-accent)/0.15)] text-xl shadow-[0_0_20px_-4px_hsl(var(--city-accent)/0.6)]"
            aria-hidden
          >
            {"🧠"}
          </span>
          <h1 className="text-lg font-bold tracking-tight">City Brain</h1>
          <Heartbeat running={running} />
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <AgentNetwork activity={data.activity} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
            <Link to="/report">
              <IconSpeakerphone className="size-4" /> Citizen report
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => setSim.mutate({ autoReports: !data.sim?.autoReports })}
          >
            Auto reports: {data.sim?.autoReports ? "on" : "off"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => setSim.mutate({ running: !running })}
          >
            {running ? <IconPlayerPause className="size-4" /> : <IconPlayerPlay className="size-4" />}
            {running ? "Pause" : "Resume"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => setConfirmReset(true)}>
            <IconRefresh className="size-4" /> Reset
          </Button>
        </div>
      </header>

      <DepartmentBars departments={data.departments} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(14rem,19rem)_minmax(0,1fr)_minmax(15rem,22rem)] gap-3">
        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card/40 p-2.5">
          <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Needs your call
            {openEscalations ? (
              <span className="rounded-full bg-[hsl(var(--sev-emergency))] px-2 py-0.5 text-[10px] text-white">
                {openEscalations}
              </span>
            ) : null}
          </h2>
          <SupervisorInbox escalations={data.escalations} incidents={data.incidents} onSelectIncident={select} />
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card/40 p-2.5">
          <h2 className="mb-2 flex items-center justify-between gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Live city
            <Legend />
          </h2>
          <div className="min-h-0 flex-1">
            <CityMap incidents={data.incidents} workers={data.workers} selectedId={selected} onSelect={select} />
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card/40 p-2.5">
          <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Agent chatter
            <span className="flex items-center gap-1 normal-case tracking-normal">
              <span className="size-1.5 rounded-full bg-[hsl(var(--sev-resolved))] motion-safe:animate-pulse" />
              live
            </span>
          </h2>
          <ActivityFeed activity={data.activity} onSelectIncident={select} />
        </section>
      </div>

      <StatsBar state={data} />

      <IncidentDrawer incidentId={selected} workers={data.workers} onClose={() => select(null)} />

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the city?</AlertDialogTitle>
            <AlertDialogDescription>
              This wipes all incidents and reloads the 30 seed incidents. The scripted demo moments replay from the start.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={reset.isPending} onClick={() => reset.mutate({ confirm: true })}>
              {reset.isPending ? "Resetting…" : "Reset city"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Tiny ECG line: the city's pulse while the agents are running. */
function Heartbeat({ running }: { running: boolean }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
      title={running ? "Agents live" : "Paused"}
    >
      <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden>
        <polyline
          className={running ? "city-heartbeat" : undefined}
          points="0,7 9,7 12,2 15,12 18,4 21,7 34,7"
          fill="none"
          stroke={running ? "hsl(var(--sev-resolved))" : "hsl(var(--muted-foreground))"}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      {running ? "Live" : "Paused"}
    </span>
  );
}

function Legend() {
  const items: Array<[string, string]> = [
    ["Emergency", "var(--sev-emergency)"],
    ["High", "var(--sev-high)"],
    ["Pending", "var(--sev-pending)"],
    ["Resolved", "var(--sev-resolved)"],
  ];
  return (
    <span className="flex items-center gap-3 normal-case tracking-normal">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1 text-[11px] font-normal">
          <span className="size-2 rounded-full" style={{ background: `hsl(${color})` }} />
          {label}
        </span>
      ))}
    </span>
  );
}

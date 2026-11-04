import {
  actionErrorMessage,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { ZONES } from "@/components/city/lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: "Report a problem — City Brain" }];
}

const EXAMPLES = [
  "Huge pothole outside the school gate, a kid fell off his bike this morning",
  "Water is gushing out of the road near the bus stop and flooding the street",
  "Streetlight has been sparking all night next to the playground",
];

export default function ReportRoute() {
  const navigate = useNavigate();
  const [description, setDescription] = useState("");
  const [zone, setZone] = useState<number | null>(null);
  const [name, setName] = useState("");
  const submit = useActionMutation("submit-report", {
    onError: (e) => toast.error(actionErrorMessage(e) ?? "Could not send your report."),
    onSuccess: (r) => navigate(`/track/${r.id}`),
  });

  return (
    <div className="city-ops flex min-h-full items-start justify-center p-6">
      <div className="w-full max-w-md">
        <Link to="/city" className="text-xs text-muted-foreground hover:text-foreground">
          ← Supervisor dashboard
        </Link>
        <div className="mt-3 rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <div className="text-2xl" aria-hidden>
            🏙️
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Report a problem</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us what's wrong in your own words. You'll never need to follow up — we'll text you at every step.
          </p>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (description.trim().length < 5 || !zone) {
                toast.error("Describe the problem and pick where it is.");
                return;
              }
              submit.mutate({
                description: description.trim(),
                zone,
                citizenName: name.trim() || undefined,
                actor: "citizen",
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="desc">What's the problem?</Label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="e.g. There's a deep pothole on Market Street and cars keep swerving around it"
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setDescription(ex)}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-[hsl(var(--city-accent))] hover:text-foreground"
                  >
                    {ex.slice(0, 32)}…
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Where is it?</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {ZONES.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setZone(z.id)}
                    aria-pressed={zone === z.id}
                    className={cn(
                      "rounded-md border px-1 py-2 text-[11px] leading-tight transition-colors",
                      zone === z.id
                        ? "border-[hsl(var(--city-accent))] bg-[hsl(var(--city-accent)/0.2)] text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="city-mono block text-[10px] opacity-60">{z.id}</span>
                    {z.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Your first name (optional)</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <Button type="submit" className="h-10 w-full" disabled={submit.isPending}>
              {submit.isPending ? "Sending…" : "Send report"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useActionQuery } from "@agent-native/core/client/hooks";
import { useEffect, useState } from "react";

export {
  ACTOR_META,
  DEPARTMENT_LABEL,
  ZONES,
  zoneById,
} from "@shared/city";
export type { Actor } from "@shared/city";

/** The live ops-wall snapshot. Polls quickly because the city changes on its own. */
export function useCityState() {
  return useActionQuery(
    "get-city-state",
    {},
    { refetchInterval: 1200, refetchIntervalInBackground: false },
  );
}

export type CityState = NonNullable<ReturnType<typeof useCityState>["data"]>;
export type CityIncident = CityState["incidents"][number];
export type CityEscalation = CityState["escalations"][number];
export type CityActivity = CityState["activity"][number];
export type CityWorker = CityState["workers"][number];
export type CityDepartment = CityState["departments"][number];

/** Re-renders every `ms` so "3s ago" and countdowns stay live. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function timeAgo(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function secondsUntil(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
}

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export type PinTone = "emergency" | "high" | "pending" | "resolved" | "muted";

export function pinTone(i: Pick<CityIncident, "stage" | "severity">): PinTone {
  if (i.stage === "resolved") return "resolved";
  if (i.stage === "merged" || i.stage === "closed") return "muted";
  if (i.severity === "emergency") return "emergency";
  if (i.severity === "high") return "high";
  return "pending";
}

export const TONE_VAR: Record<PinTone, string> = {
  emergency: "var(--sev-emergency)",
  high: "var(--sev-high)",
  pending: "var(--sev-pending)",
  resolved: "var(--sev-resolved)",
  muted: "var(--muted-foreground)",
};

export const STAGE_LABEL: Record<string, string> = {
  reported: "Reported",
  classified: "Classified",
  routed: "Routed",
  assigned: "Assigned",
  travelling: "Worker travelling",
  working: "Work in progress",
  review: "Quality review",
  resolved: "Resolved",
  escalated: "Waiting for supervisor",
  merged: "Merged duplicate",
  closed: "Closed",
};

export const CATEGORY_ICON: Record<string, string> = {
  road: "🛣️",
  sanitation: "🗑️",
  electrical: "💡",
  water: "💧",
  safety: "⚠️",
};

/** Stable pseudo-random position for a pin inside its zone tile (percent). */
export function pinPosition(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const x = 14 + (Math.abs(h) % 72);
  const y = 26 + (Math.abs(h >> 8) % 50);
  return { x, y };
}

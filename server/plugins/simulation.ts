import { defineNitroPlugin } from "@agent-native/core/server";

import { tick } from "../city/orchestrator.js";

// Drives the City Brain simulation: one heartbeat per second. Starts after a
// short delay so the database migrations in db.ts have finished.
export default defineNitroPlugin((nitroApp) => {
  let timer: ReturnType<typeof setInterval> | undefined;
  const start = setTimeout(() => {
    timer = setInterval(() => void tick(), 1000);
  }, 4000);

  nitroApp?.hooks?.hookOnce?.("close", () => {
    clearTimeout(start);
    if (timer) clearInterval(timer);
  });
});

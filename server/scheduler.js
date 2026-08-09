/* Täglicher Zuteilungslauf.
   Im Browser lief die Zuteilung nur, wenn jemand klickte — der eingestellte
   Zuteilungstag hielt also nicht, was er versprach. */

import { recomputeAll } from "./assignment.js";

const HOUR = 60 * 60 * 1000;

export function startScheduler(db, { intervalMs = 6 * HOUR } = {}) {
  const run = () => {
    try {
      recomputeAll(db);
    } catch (err) {
      console.error("Zuteilungslauf fehlgeschlagen:", err);
    }
  };

  run(); // einmal direkt beim Start
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

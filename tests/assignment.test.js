/* Die Zuteilungsregeln — der Teil, bei dem stille Fehler am teuersten sind:
   niemand merkt sie, bis jemand vor verschlossener Tür steht. */

import { describe, expect, test } from "vitest";

import {
  attemptAssign,
  canTakeOver,
  expandShiftDates,
  extendSeriesDates,
  isAssignable,
} from "#shared/assignment.js";
import { fromISO, toISO } from "#shared/dates.js";

const ACCOUNTS = [
  { id: "a1", qualifications: ["q1"] },
  { id: "a2", qualifications: ["q1"] },
  { id: "a3", qualifications: ["q2"] },
];

const shift = (over = {}) => ({
  id: "s1",
  date: "2026-03-10",
  seats: 1,
  qualificationId: "q1",
  enrolled: [],
  assigned: [],
  helpRequests: [],
  assignmentAttempted: false,
  assignedAt: null,
  ...over,
});

describe("Zuteilungsfenster", () => {
  const today = fromISO("2026-03-10");

  test("der laufende Monat ist immer zuteilbar", () => {
    expect(isAssignable("2026-03-01", today, 7)).toBe(true);
    expect(isAssignable("2026-03-31", today, 7)).toBe(true);
  });

  test("der Folgemonat erst ab dem Zuteilungstag", () => {
    expect(isAssignable("2026-04-05", today, 7)).toBe(true); // 10. >= 7.
    expect(isAssignable("2026-04-05", today, 15)).toBe(false); // 10. < 15.
  });

  test("übernächster Monat noch nicht", () => {
    expect(isAssignable("2026-05-05", today, 1)).toBe(false);
  });
});

describe("Zuteilung", () => {
  const today = fromISO("2026-03-10");

  test("teilt nur qualifizierte Eingeschriebene zu", () => {
    const result = attemptAssign(shift({ seats: 2, enrolled: ["a1", "a3"] }), ACCOUNTS, today, 7);
    expect(result.assigned).toEqual(["a1"]);
    expect(result.assignedAt).toBe(toISO(today));
  });

  test("überschreitet die Platzzahl nicht", () => {
    const result = attemptAssign(shift({ seats: 1, enrolled: ["a1", "a2"] }), ACCOUNTS, today, 7);
    expect(result.assigned).toHaveLength(1);
  });

  test("rührt Schichten ausserhalb des Fensters nicht an", () => {
    const untouched = shift({ date: "2026-06-01", enrolled: ["a1"] });
    expect(attemptAssign(untouched, ACCOUNTS, today, 7)).toBe(untouched);
  });

  test("force teilt trotzdem zu", () => {
    const result = attemptAssign(shift({ date: "2026-06-01", enrolled: ["a1"] }), ACCOUNTS, today, 7, true);
    expect(result.assigned).toEqual(["a1"]);
  });
});

describe("Serien", () => {
  const horizon = fromISO("2026-03-31");

  test("einmalig ergibt genau einen Termin", () => {
    expect(expandShiftDates({ date: "2026-03-10", repeat: "once" }, horizon)).toEqual(["2026-03-10"]);
  });

  test("wöchentlich springt in Siebenerschritten", () => {
    expect(expandShiftDates({ date: "2026-03-10", repeat: "weekly" }, horizon))
      .toEqual(["2026-03-10", "2026-03-17", "2026-03-24", "2026-03-31"]);
  });

  test("Wochenende lässt Werktage aus", () => {
    const dates = expandShiftDates({ date: "2026-03-09", repeat: "weekend", endDate: "2026-03-16" }, horizon);
    expect(dates).toEqual(["2026-03-14", "2026-03-15"]);
  });

  test("das Enddatum bremst, der Horizont ebenfalls", () => {
    expect(expandShiftDates({ date: "2026-03-10", repeat: "daily", endDate: "2026-03-12" }, horizon))
      .toEqual(["2026-03-10", "2026-03-11", "2026-03-12"]);
    expect(expandShiftDates({ date: "2026-03-29", repeat: "daily", endDate: "2026-12-31" }, horizon))
      .toEqual(["2026-03-29", "2026-03-30", "2026-03-31"]);
  });
});

describe("Serien nachfüllen", () => {
  const horizon = fromISO("2026-04-30");

  test("läuft ohne Enddatum einfach am letzten Termin weiter", () => {
    expect(extendSeriesDates("weekly", "2026-03-31", null, horizon))
      .toEqual(["2026-04-07", "2026-04-14", "2026-04-21", "2026-04-28"]);
  });

  test("bleibt am Enddatum der Serie stehen, auch wenn der Horizont weiter reicht", () => {
    expect(extendSeriesDates("daily", "2026-04-28", "2026-04-29", horizon))
      .toEqual(["2026-04-29"]);
  });

  test("einmalige Schichten werden nie verlängert", () => {
    expect(extendSeriesDates("once", "2026-03-10", null, horizon)).toEqual([]);
  });

  test("Wochenend-Serien lassen weiterhin Werktage aus", () => {
    expect(extendSeriesDates("weekend", "2026-03-29", null, fromISO("2026-04-06")))
      .toEqual(["2026-04-04", "2026-04-05"]);
  });
});

describe("Übernahme", () => {
  test("nur mit passender Qualifikation", () => {
    expect(canTakeOver(shift({ seats: 2 }), ACCOUNTS, "a3", null)).toBe(false);
    expect(canTakeOver(shift({ seats: 2 }), ACCOUNTS, "a1", null)).toBe(true);
  });

  test("nicht in eine volle Schicht", () => {
    expect(canTakeOver(shift({ seats: 1, assigned: ["a2"] }), ACCOUNTS, "a1", null)).toBe(false);
  });

  test("als Ersatz für eine zugeteilte Person schon", () => {
    expect(canTakeOver(shift({ seats: 1, assigned: ["a2"] }), ACCOUNTS, "a1", "a2")).toBe(true);
  });

  test("nicht doppelt", () => {
    expect(canTakeOver(shift({ seats: 2, assigned: ["a1"] }), ACCOUNTS, "a1", null)).toBe(false);
  });
});

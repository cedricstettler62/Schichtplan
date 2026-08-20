/* Die Zuteilungsregeln — der Teil, bei dem stille Fehler am teuersten sind:
   niemand merkt sie, bis jemand vor verschlossener Tür steht. */

import { describe, expect, test } from "vitest";

import {
  attemptAssign,
  canTakeOver,
  expandShiftDates,
  extendSeriesDates,
  fairnessWindowRange,
  hoursByEmployeeInWindow,
  isAssignable,
  runAssignmentPass,
  weightedPick,
} from "#shared/assignment.js";
import { addMonths, fromISO, toISO } from "#shared/dates.js";

const ACCOUNTS = [
  { id: "a1", qualifications: ["q1"] },
  { id: "a2", qualifications: ["q1"] },
  { id: "a3", qualifications: ["q2"] },
];

const shift = (over = {}) => ({
  id: "s1",
  date: "2026-03-10",
  seats: 1,
  qualificationIds: ["q1"],
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

  test("die Auslosung findet nur einmal statt", () => {
    // Sonst würde jeder Lauf des Zeitplans faktisch neu zuteilen.
    const gelaufen = shift({ enrolled: ["a1"], assignmentAttempted: true });
    expect(attemptAssign(gelaufen, ACCOUNTS, today, 7)).toBe(gelaufen);
  });

  test("die Administration kann trotzdem nachträglich zuteilen", () => {
    const gelaufen = shift({ enrolled: ["a1"], assignmentAttempted: true });
    expect(attemptAssign(gelaufen, ACCOUNTS, today, 7, true).assigned).toEqual(["a1"]);
  });

  test("vor dem Zuteilungstag passiert nichts – auch nicht das Merken", () => {
    const kuenftig = shift({ date: "2026-04-20", enrolled: ["a1"] });
    const result = attemptAssign(kuenftig, ACCOUNTS, today, 15); // heute ist der 10.
    expect(result).toBe(kuenftig);
    expect(result.assignmentAttempted).toBe(false);
  });
});

describe("Monate verschieben", () => {
  test("kappt auf den letzten Tag des Zielmonats", () => {
    expect(toISO(addMonths(fromISO("2026-05-31"), -3))).toBe("2026-02-28");
    expect(toISO(addMonths(fromISO("2024-05-31"), -3))).toBe("2024-02-29"); // Schaltjahr
  });

  test("rechnet über den Jahreswechsel", () => {
    expect(toISO(addMonths(fromISO("2026-02-15"), -3))).toBe("2025-11-15");
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

  test("legt keine Termine in der Vergangenheit an", () => {
    // Serie lag lange still — nachgeholt wird nur, was noch bevorsteht.
    const dates = extendSeriesDates("weekly", "2026-03-03", null, horizon, fromISO("2026-04-10"));
    expect(dates).toEqual(["2026-04-14", "2026-04-21", "2026-04-28"]);
  });

  test("der Takt bleibt am ursprünglichen Wochentag ausgerichtet", () => {
    const dates = extendSeriesDates("weekly", "2026-03-03", null, horizon, fromISO("2026-04-10"));
    const wochentage = new Set(dates.map((d) => fromISO(d).getDay()));
    expect([...wochentage]).toEqual([fromISO("2026-03-03").getDay()]);
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

describe("Ausschliessende Schichten in der Auslosung", () => {
  const today = fromISO("2026-03-10");

  /* Zwei Schichten, die sich ausschliessen. Beide sind derselben Person
     zugesagt worden — möglich, wenn eine Freigabe nachträglich zurückgenommen
     wurde und die Einschreibungen stehen blieben. */
  const frueh = () => shift({ id: "s_frueh", seriesId: "serie_frueh", enrolled: ["a1", "a2"] });
  const spaet = () => shift({ id: "s_spaet", seriesId: "serie_spaet", enrolled: ["a1"] });
  const schliesstAus = (a, b) => a.id !== b.id;

  test("niemand bekommt zwei Schichten, die sich ausschliessen", () => {
    const [a, b] = runAssignmentPass([frueh(), spaet()], ACCOUNTS, today, 7, [], () => 0, schliesstAus);

    // Die erste Schicht bekommt jemanden …
    expect(a.assigned).toHaveLength(1);
    // … und die zweite darf dieselbe Person nicht auch nehmen.
    expect(b.assigned).not.toContain(a.assigned[0]);
  });

  test("wer als Einziger übrig bleibt, lässt den Platz offen", () => {
    const nurA1 = shift({ id: "s_frueh", seriesId: "serie_frueh", enrolled: ["a1"] });
    const [a, b] = runAssignmentPass([nurA1, spaet()], ACCOUNTS, today, 7, [], () => 0, schliesstAus);

    expect(a.assigned).toEqual(["a1"]);
    // Lieber ein offener Platz als eine Person an zwei Orten gleichzeitig.
    expect(b.assigned).toEqual([]);
    expect(b.assignmentAttempted).toBe(true);
  });

  test("ohne Ausschlussregel bleibt es beim alten Verhalten", () => {
    const [a, b] = runAssignmentPass([frueh(), spaet()], ACCOUNTS, today, 7, [], () => 0);
    expect(a.assigned).toHaveLength(1);
    expect(b.assigned).toEqual(["a1"]);
  });

  test("eine bereits bestehende Zuteilung blockiert genauso", () => {
    const belegt = shift({
      id: "s_belegt", seriesId: "serie_belegt", enrolled: ["a1"], assigned: ["a1"],
      assignmentAttempted: true,
    });
    const [, neu] = runAssignmentPass([belegt, spaet()], ACCOUNTS, today, 7, [], () => 0, schliesstAus);

    expect(neu.assigned).toEqual([]);
  });
});

describe("weightedPick", () => {
  const today = fromISO("2026-03-10");

  test("bei Gleichstand sind die Chancen gleich verteilt", () => {
    expect(weightedPick(["a", "b"], {}, { random: () => 0 })).toBe("a");
    expect(weightedPick(["a", "b"], {}, { random: () => 0.9999 })).toBe("b");
  });

  test("wer schon mehr Stunden im Fenster hat, bekommt einen kleineren Anteil am Zahlenstrahl", () => {
    // a: 0h, b: 10h, Schwelle 5h -> Gewicht a = 1, Gewicht b = 1/(1+10/5) = 1/3.
    const hours = { a: 0, b: 10 };
    expect(weightedPick(["a", "b"], hours, { thresholdHours: 5, random: () => 0 })).toBe("a");
    // Summe der Gewichte 4/3 — a allein nimmt schon 3/4 der Fläche ein.
    expect(weightedPick(["a", "b"], hours, { thresholdHours: 5, random: () => 0.7 })).toBe("a");
    expect(weightedPick(["a", "b"], hours, { thresholdHours: 5, random: () => 0.9 })).toBe("b");
  });

  test("niemand ist völlig ausgeschlossen, auch bei grossem Unterschied", () => {
    const hours = { a: 0, b: 1000 };
    expect(weightedPick(["a", "b"], hours, { thresholdHours: 1, random: () => 0.999999 })).toBe("b");
  });

  test("eine leere Kandidatenliste liefert nichts", () => {
    expect(weightedPick([], {})).toBeUndefined();
  });

  test("attemptAssign: derselbe Zufallswert liefert mit und ohne Gewichtung ein anderes Ergebnis", () => {
    const s = shift({ seats: 1, enrolled: ["a1", "a2"] });
    const random = () => 0.7;

    // Ohne Angabe von `fairness` sind die Chancen wie vor der Gewichtung gleich gross.
    expect(attemptAssign(s, ACCOUNTS, today, 7, false, random).assigned).toEqual(["a2"]);

    // a2 ist im Zeitfenster schon deutlich mehr belastet als a1.
    const fairness = { hoursByEmployee: { a1: 0, a2: 20 }, thresholdHours: 4 };
    expect(attemptAssign(s, ACCOUNTS, today, 7, false, random, null, fairness).assigned).toEqual(["a1"]);
  });
});

describe("Fairness-Zeitfenster", () => {
  test("'Aktueller Monat' deckt den ganzen Monat der Schicht ab", () => {
    expect(fairnessWindowRange("2026-03-15", "month")).toEqual({ startISO: "2026-03-01", endISO: "2026-03-31" });
  });

  test("'Letzte 4 Wochen' reicht 27 Tage zurück, bis einschliesslich dem Schichttag", () => {
    expect(fairnessWindowRange("2026-03-15", "4weeks")).toEqual({ startISO: "2026-02-16", endISO: "2026-03-15" });
  });
});

describe("hoursByEmployeeInWindow", () => {
  test("zählt nur zugeteilte Schichten innerhalb des Fensters", () => {
    const shifts = [
      shift({ id: "s1", date: "2026-03-05", startTime: "08:00", endTime: "16:00", assigned: ["a1"] }), // 8h, im Fenster
      shift({ id: "s2", date: "2026-02-05", startTime: "08:00", endTime: "16:00", assigned: ["a1"] }), // ausserhalb
      shift({ id: "s3", date: "2026-03-10", startTime: "08:00", endTime: "12:00", enrolled: ["a2"] }), // nicht zugeteilt
    ];
    expect(hoursByEmployeeInWindow(shifts, "2026-03-01", "2026-03-31")).toEqual({ a1: 8 });
  });
});

describe("runAssignmentPass: Fairness-Einstellungen der Firma", () => {
  const today = fromISO("2026-03-10");

  test("bezieht bereits zugeteilte Schichten im Zeitfenster ein und respektiert die eingestellte Schwelle", () => {
    const belastet = shift({
      id: "s0", date: "2026-03-01", startTime: "06:00", endTime: "18:00", // 12h
      seats: 1, enrolled: ["a1"], assigned: ["a1"], assignmentAttempted: true,
    });
    const offen = shift({
      id: "s1", date: "2026-03-15", startTime: "06:00", endTime: "10:00", // 4h
      seats: 1, enrolled: ["a1", "a2"],
    });

    // Schwelle 0 Schichten -> die Gewichtung greift praktisch sofort: a1 (schon
    // 12h im März) hat kaum noch eine Chance gegen a2 (0h) — bei fast jedem
    // Zufallswert fällt die Wahl auf a2.
    const [, ergebnis] = runAssignmentPass(
      [belastet, offen], ACCOUNTS, today, 7, [], () => 0.01, null, { windowType: "month", thresholdShifts: 0 }
    );
    expect(ergebnis.assigned).toEqual(["a2"]);
  });

  test("ohne eigene Einstellung gilt die Standard-Schwelle von 3 Schichten", () => {
    const offen = shift({ id: "s1", date: "2026-03-15", startTime: "06:00", endTime: "10:00", enrolled: ["a1"] });
    const [ergebnis] = runAssignmentPass([offen], ACCOUNTS, today, 7, [], () => 0, null, null);
    expect(ergebnis.assigned).toEqual(["a1"]);
  });
});

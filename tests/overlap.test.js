/* Die Überschneidungsrechnung für sich — Formular und Server benutzen sie
   gemeinsam, also muss sie einzeln stimmen. */

import { describe, expect, test } from "vitest";

import { overlappingSeries, shiftSpan, shiftsOverlap } from "#shared/overlap.js";

const schicht = (date, startTime, endTime, extra = {}) => ({
  id: `s_${date}_${startTime}`, seriesId: "serie", name: "Dienst", date, startTime, endTime, ...extra,
});

describe("shiftsOverlap", () => {
  test("gleiche Zeit am gleichen Tag", () => {
    expect(shiftsOverlap(schicht("2026-03-10", "08:00", "16:00"), schicht("2026-03-10", "08:00", "16:00"))).toBe(true);
  });

  test("teilweise Überlappung", () => {
    expect(shiftsOverlap(schicht("2026-03-10", "08:00", "16:00"), schicht("2026-03-10", "14:00", "22:00"))).toBe(true);
  });

  test("nahtlos aneinander ist keine Überschneidung", () => {
    // Wer um 16:00 aufhört, kann um 16:00 anfangen.
    expect(shiftsOverlap(schicht("2026-03-10", "08:00", "16:00"), schicht("2026-03-10", "16:00", "22:00"))).toBe(false);
  });

  test("verschiedene Tage berühren sich nicht", () => {
    expect(shiftsOverlap(schicht("2026-03-10", "08:00", "16:00"), schicht("2026-03-11", "08:00", "16:00"))).toBe(false);
  });

  test("eine Nachtschicht reicht in den Folgetag", () => {
    const nacht = schicht("2026-03-10", "22:00", "06:00");
    expect(shiftSpan(nacht).end - shiftSpan(nacht).start).toBe(8 * 60);
    // Ohne den Übertrag über Mitternacht käme hier eine negative Dauer heraus.
    expect(shiftsOverlap(nacht, schicht("2026-03-11", "05:00", "13:00"))).toBe(true);
    expect(shiftsOverlap(nacht, schicht("2026-03-11", "06:00", "14:00"))).toBe(false);
  });
});

describe("overlappingSeries", () => {
  const bestehend = [
    { ...schicht("2026-03-10", "08:00", "16:00"), seriesId: "serie_a", name: "Frühdienst" },
    { ...schicht("2026-03-11", "08:00", "16:00"), seriesId: "serie_a", name: "Frühdienst" },
    { ...schicht("2026-03-11", "20:00", "23:00"), seriesId: "serie_b", name: "Abenddienst" },
  ];

  test("fasst eine Serie zu einem Eintrag zusammen", () => {
    const neu = [schicht("2026-03-10", "14:00", "18:00"), schicht("2026-03-11", "14:00", "18:00")];
    const treffer = overlappingSeries(neu, bestehend);

    // Zwei Termine derselben Serie sind eine Entscheidung, nicht zwei.
    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toMatchObject({ seriesId: "serie_a", name: "Frühdienst", termine: 2, erster: "2026-03-10" });
  });

  test("nennt jede betroffene Serie einzeln", () => {
    const neu = [schicht("2026-03-11", "15:00", "21:00")];
    expect(overlappingSeries(neu, bestehend).map((t) => t.name)).toEqual(["Frühdienst", "Abenddienst"]);
  });

  test("ohne Überschneidung bleibt die Liste leer", () => {
    expect(overlappingSeries([schicht("2026-03-10", "16:00", "20:00")], bestehend)).toEqual([]);
  });
});

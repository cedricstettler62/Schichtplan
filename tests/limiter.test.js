/* Die Anmeldebremse für sich. Wichtig ist nicht nur, dass sie bremst,
   sondern auch, dass sie ihre Einträge wieder loswird — sonst wächst der
   Speicher mit jeder IP, von der je ein Fehlversuch kam. */

import { describe, expect, test, vi } from "vitest";

import { createLoginLimiter } from "../server/auth.js";

describe("createLoginLimiter", () => {
  test("sperrt nach `limit` Fehlversuchen", () => {
    const limiter = createLoginLimiter({ limit: 3, windowMs: 60_000 });
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check("1.2.3.4")).toBe(true);
      limiter.fail("1.2.3.4");
    }
    expect(limiter.check("1.2.3.4")).toBe(false);
    expect(limiter.check("5.6.7.8")).toBe(true); // andere Adresse bleibt frei
  });

  test("erfolgreiche Anmeldung räumt den Eintrag weg", () => {
    const limiter = createLoginLimiter({ limit: 3, windowMs: 60_000 });
    limiter.fail("1.2.3.4");
    limiter.reset("1.2.3.4");
    expect(limiter.size).toBe(0);
  });

  test("abgelaufene Einträge verschwinden aus dem Speicher", () => {
    vi.useFakeTimers();
    try {
      const limiter = createLoginLimiter({ limit: 3, windowMs: 60_000 });
      limiter.fail("1.2.3.4");
      expect(limiter.size).toBe(1);

      vi.advanceTimersByTime(60_001);
      expect(limiter.check("1.2.3.4")).toBe(true);
      expect(limiter.size).toBe(0); // nicht nur logisch abgelaufen, wirklich weg
    } finally {
      vi.useRealTimers();
    }
  });

  test("fremde Einträge werden spätestens nach einem Zeitfenster weggefegt", () => {
    vi.useFakeTimers();
    try {
      const limiter = createLoginLimiter({ limit: 3, windowMs: 60_000 });
      for (let i = 0; i < 100; i += 1) limiter.fail(`10.0.0.${i}`);
      expect(limiter.size).toBe(100);

      vi.advanceTimersByTime(60_001);
      limiter.fail("192.168.0.1"); // ein einziger neuer Versuch räumt mit auf
      expect(limiter.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("deckelt die Zahl der Adressen im selben Zeitfenster", () => {
    const limiter = createLoginLimiter({ limit: 3, windowMs: 60_000, maxKeys: 50 });
    for (let i = 0; i < 500; i += 1) limiter.fail(`10.0.${Math.floor(i / 256)}.${i % 256}`);
    expect(limiter.size).toBe(50);
    expect(limiter.check("10.0.1.243")).toBe(true); // ältestes Fenster ist gewichen
  });
});

// @vitest-environment jsdom
/**
 * UpdateBanner: das eine Stück, das direkt mit `fetch` und `window.location`
 * spricht statt mit dem Testserver — dafür hier mit eigenen Doubles statt im
 * Smoke-Test gegen den echten Server, dessen Versionsnummer sich während des
 * Testlaufs nicht künstlich ändern lässt.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import UpdateBanner from "../src/components/UpdateBanner.jsx";

const STUNDE = 60 * 60 * 1000;

/** Liefert der Reihe nach die genannten Fassungen, danach immer die letzte. */
function stelleFetch(fassungen) {
  let i = 0;
  global.fetch = vi.fn(() => {
    const version = fassungen[Math.min(i, fassungen.length - 1)];
    i += 1;
    return Promise.resolve({ json: () => Promise.resolve({ version }) });
  });
}

describe("UpdateBanner", () => {
  let reload;

  beforeEach(() => {
    reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("meldet still nichts, solange sich die Fassung nicht ändert", async () => {
    stelleFetch(["abc123"]);
    render(<UpdateBanner />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  test("eine neue Fassung während einer laufenden, sichtbaren Sitzung zeigt nur den Hinweis", async () => {
    vi.useFakeTimers();
    stelleFetch(["abc123", "def456"]);
    render(<UpdateBanner />);

    // Der erste Aufruf beim Einhängen setzt die Basis-Fassung.
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Die stündliche Prüfung im Hintergrund entdeckt die neue Fassung — das
    // Fenster war dabei die ganze Zeit sichtbar, also kein Autoreload.
    await act(() => vi.advanceTimersByTimeAsync(STUNDE));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  test("beim Zurückkehren ins Fenster mit neuer Fassung lädt die Seite von selbst neu", async () => {
    stelleFetch(["abc123", "def456"]);
    render(<UpdateBanner />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    // Kein Knopf nötig — es wurde ja schon automatisch neu geladen.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

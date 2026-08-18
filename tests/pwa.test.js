/* Manifest, Symbole und ihre Verweise.
   Ein vertippter Dateiname fällt sonst erst auf, wenn jemand die Installation
   probiert — und dort steht dann nur, dass sie nicht geht. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const wurzel = path.resolve(".");
const publicDir = path.join(wurzel, "public");
const lies = (...teile) => fs.readFileSync(path.join(...teile), "utf8");

const manifest = JSON.parse(lies(publicDir, "manifest.webmanifest"));

describe("Manifest", () => {
  test("nennt alles, was ein Browser zum Einrichten braucht", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    // Ohne "standalone" bleibt es eine Seite im Browser, mit Adresszeile.
    expect(manifest.display).toBe("standalone");
  });

  test("bringt die beiden Groessen mit, ohne die Chrome nicht anbietet", () => {
    const groessen = manifest.icons.map((i) => i.sizes);
    expect(groessen).toContain("192x192");
    expect(groessen).toContain("512x512");
    // Android schneidet eine beliebige Form heraus — dafuer braucht es eines,
    // dessen Inhalt weit genug innen liegt.
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  test("jedes genannte Symbol liegt auch da", () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/")).toBe(true);
      expect(fs.existsSync(path.join(publicDir, icon.src.slice(1)))).toBe(true);
    }
  });

  test("die Symbole sind echte PNG", () => {
    for (const icon of manifest.icons) {
      const kopf = fs.readFileSync(path.join(publicDir, icon.src.slice(1))).subarray(0, 8);
      expect([...kopf]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }
  });
});

describe("index.html", () => {
  const html = lies(wurzel, "index.html");

  test("verweist auf das Manifest", () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('href="/manifest.webmanifest"');
  });

  test("jede verwiesene Datei aus public/ existiert", () => {
    const verweise = [...html.matchAll(/href="\/([A-Za-z0-9._-]+)"/g)].map((t) => t[1]);
    // Ohne Treffer waere der Test stumm gruen.
    expect(verweise.length).toBeGreaterThan(0);
    for (const datei of verweise) {
      expect(fs.existsSync(path.join(publicDir, datei))).toBe(true);
    }
  });

  test("nennt ein Symbol fuer den Homescreen von iOS", () => {
    // iOS liest das Manifest nicht zuverlaessig, sondern diese Zeile.
    expect(html).toContain('rel="apple-touch-icon"');
  });
});

describe("Service Worker", () => {
  const sw = lies(publicDir, "sw.js");

  test("laesst /api unangetastet", () => {
    // Ein zwischengespeicherter Schichtplan saehe aus wie der aktuelle Stand.
    expect(sw).toContain('url.pathname.startsWith("/api/")');
  });

  test("raeumt alte Bundles wieder weg", () => {
    expect(sw).toContain("async function aufraeumen(cache)");
    expect(sw).toContain("cache.delete(eintrag)");
  });
});

/* Baut die Express-App zusammen. Getrennt vom Start (index.js), damit die
   Tests dieselbe App gegen eine Datenbank im Arbeitsspeicher fahren können. */

import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";

import { attachSession } from "./auth.js";
import { readVersion } from "./version.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import calendarRoutes from "./routes/calendar.js";
import companiesRoutes from "./routes/companies.js";
import companyRoutes from "./routes/company.js";
import shiftRoutes from "./routes/shifts.js";

/**
 * Wie lange eine Datei liegen bleiben darf.
 *
 * Der Build schreibt seine Fassung in den Dateinamen (assets/index-a1b2c3.js) —
 * diese Dateien ändern sich nie und dürfen ein Jahr gelten. Alles Übrige
 * behält seinen Namen über Updates hinweg: index.html, der Service Worker, das
 * Manifest, die Symbole. Dort muss der Browser jedes Mal nachfragen, sonst
 * bliebe eine Installation auf einem alten Stand stehen, ohne es zu merken.
 */
function cacheKopfzeile(res, datei) {
  const unveraenderlich = datei.includes(path.sep + "assets" + path.sep);
  res.setHeader("Cache-Control", unveraenderlich ? "public, max-age=31536000, immutable" : "no-cache");
}

export function createApp(db, config) {
  const app = express();
  app.set("trust proxy", 1); // hinter cloudflared
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser(config.sessionSecret));
  app.use(attachSession(db, config));

  /* Der eingespielte Stand, offen abfragbar. Die Oberfläche vergleicht ihn mit
     dem, der beim Laden galt: Weicht er ab, läuft im Fenster eine Fassung von
     gestern gegen einen Server von heute — dann darf ein Hinweis erscheinen.
     Der Kurz-Hash verrät nichts, was nicht schon im Repository steht. */
  app.get("/api/health", (_req, res) => res.json({ ok: true, version: readVersion().commit }));
  app.use("/api", authRoutes(db, config));
  app.use("/api/admin", adminRoutes(db, config));
  app.use("/api", companyRoutes(db, config));
  app.use("/api/shifts", shiftRoutes(db));
  app.use("/api/companies", companiesRoutes(db, config));
  // Ohne Anmeldung erreichbar: das Zeichen in der Adresse ist hier der Zugang.
  app.use("/api", calendarRoutes(db));

  app.use("/api", (_req, res) => res.status(404).json({ error: "Unbekannter Endpunkt." }));

  // Der gebaute Frontend-Build wird direkt mit ausgeliefert — ein Prozess, ein Port.
  const dist = path.resolve("dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { setHeaders: cacheKopfzeile }));
    app.get(/.*/, (_req, res) => {
      // index.html nie zwischenspeichern, sonst hängt ein Browser nach einem
      // Update am alten Stand fest und lädt die Dateien von gestern nach.
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  // Letzte Instanz: nie einen Stacktrace an den Browser geben.
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Serverfehler." });
  });

  return app;
}

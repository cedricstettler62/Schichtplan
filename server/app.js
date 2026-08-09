/* Baut die Express-App zusammen. Getrennt vom Start (index.js), damit die
   Tests dieselbe App gegen eine Datenbank im Arbeitsspeicher fahren können. */

import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";

import { attachSession } from "./auth.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import companiesRoutes from "./routes/companies.js";
import companyRoutes from "./routes/company.js";
import shiftRoutes from "./routes/shifts.js";

export function createApp(db, config) {
  const app = express();
  app.set("trust proxy", 1); // hinter cloudflared
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser(config.sessionSecret));
  app.use(attachSession(db, config));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", authRoutes(db, config));
  app.use("/api/admin", adminRoutes(db, config));
  app.use("/api", companyRoutes(db));
  app.use("/api/shifts", shiftRoutes(db));
  app.use("/api/companies", companiesRoutes(db, config));

  app.use("/api", (_req, res) => res.status(404).json({ error: "Unbekannter Endpunkt." }));

  // Der gebaute Frontend-Build wird direkt mit ausgeliefert — ein Prozess, ein Port.
  const dist = path.resolve("dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  // Letzte Instanz: nie einen Stacktrace an den Browser geben.
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Serverfehler." });
  });

  return app;
}

/* Wartung über die Oberfläche — Sicherung herunterladen, Sicherung einspielen,
   Programm aktualisieren. Alles ausschliesslich für den Super-Admin.

   Das Update stösst der Server nicht selbst an: er legt nur eine Marker-Datei
   in data/ ab. Ein systemd-Pfad-Dienst sieht die Datei und führt update.sh als
   root aus. So bleibt der Webdienst ohne erhöhte Rechte und kann seinen eigenen
   Programmcode nicht überschreiben. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Router } from "express";
import express from "express";
import Database from "better-sqlite3";

import { requireSuper } from "../auth.js";
import { readVersion } from "../version.js";

const PFLICHTTABELLEN = ["companies", "accounts", "qualifications", "shifts", "enrollments", "help_requests"];
const MAX_UPLOAD = 64 * 1024 * 1024;

function zeitstempel() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Prüft, ob die hochgeladene Datei wirklich eine Schichtboard-Datenbank ist. */
function pruefeDatenbank(datei) {
  let db;
  try {
    db = new Database(datei, { readonly: true });
    const tabellen = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    );
    const fehlend = PFLICHTTABELLEN.filter((t) => !tabellen.has(t));
    if (fehlend.length) {
      return { ok: false, error: `Das ist keine Schichtboard-Datenbank. Es fehlen: ${fehlend.join(", ")}` };
    }
    return {
      ok: true,
      companies: db.prepare("SELECT COUNT(*) AS n FROM companies").get().n,
      accounts: db.prepare("SELECT COUNT(*) AS n FROM accounts").get().n,
    };
  } catch (err) {
    return { ok: false, error: `Die Datei liess sich nicht lesen: ${err.message}` };
  } finally {
    db?.close();
  }
}

export default function adminRoutes(db, config) {
  const router = Router();
  router.use(requireSuper);

  // data/ liegt neben backups/ — beide Pfade vom Datenbankort ableiten, damit
  // nichts vom Arbeitsverzeichnis des Prozesses abhängt.
  const datenOrdner = () => path.dirname(path.resolve(config.dbPath));
  const sicherungsOrdner = () => path.join(datenOrdner(), "..", "backups");
  const markerDatei = () => path.join(datenOrdner(), "update-requested");
  const statusDatei = () => path.join(datenOrdner(), "update-status.json");

  const leseUpdateStatus = () => {
    try {
      return JSON.parse(fs.readFileSync(statusDatei(), "utf8"));
    } catch {
      return null;
    }
  };

  /* --- Überblick --- */

  router.get("/info", (_req, res) => {
    const datei = path.resolve(config.dbPath);
    res.json({
      version: readVersion(),
      db: {
        pfad: datei,
        groesse: fs.existsSync(datei) ? fs.statSync(datei).size : 0,
        companies: db.prepare("SELECT COUNT(*) AS n FROM companies").get().n,
        accounts: db.prepare("SELECT COUNT(*) AS n FROM accounts").get().n,
        shifts: db.prepare("SELECT COUNT(*) AS n FROM shifts").get().n,
      },
      update: leseUpdateStatus(),
      updateMoeglich: typeof db.replaceWith === "function",
    });
  });

  /* --- Sicherung herunterladen --- */

  router.get("/db/export", (_req, res, next) => {
    if (typeof db.exportTo !== "function") return res.status(409).json({ error: "Export nicht möglich." });

    const temp = path.join(os.tmpdir(), `schichtboard-export-${Date.now()}.db`);
    try {
      db.exportTo(temp);
    } catch (err) {
      return next(err);
    }

    res.download(temp, `schichtplan_${zeitstempel()}.db`, () => fs.rmSync(temp, { force: true }));
  });

  /* --- Sicherung einspielen --- */

  router.post("/db/import", express.raw({ type: "*/*", limit: MAX_UPLOAD }), (req, res, next) => {
    if (typeof db.replaceWith !== "function") return res.status(409).json({ error: "Import nicht möglich." });
    if (!req.body?.length) return res.status(400).json({ error: "Es kam keine Datei an." });

    const temp = path.join(os.tmpdir(), `schichtboard-import-${Date.now()}.db`);
    try {
      fs.writeFileSync(temp, req.body);

      const geprueft = pruefeDatenbank(temp);
      if (!geprueft.ok) return res.status(400).json({ error: geprueft.error });

      // Der bisherige Stand wandert vorher nach backups/ — nichts geht verloren.
      const sicherung = path.join(sicherungsOrdner(), `vor-import_${zeitstempel()}.db`);
      db.replaceWith(temp, sicherung);

      res.json({
        ok: true,
        companies: geprueft.companies,
        accounts: geprueft.accounts,
        sicherung: path.basename(sicherung),
      });
    } catch (err) {
      next(err);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  });

  /* --- Programm aktualisieren --- */

  router.post("/update", (_req, res, next) => {
    try {
      const laufend = leseUpdateStatus();
      if (laufend?.state === "laeuft") return res.status(409).json({ error: "Es läuft bereits ein Update." });

      fs.writeFileSync(statusDatei(), JSON.stringify({
        state: "angefordert",
        startedAt: new Date().toISOString(),
      }));
      fs.writeFileSync(markerDatei(), new Date().toISOString());
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/update/status", (_req, res) => {
    res.json({ version: readVersion(), update: leseUpdateStatus() });
  });

  return router;
}

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

import { zeitstempel } from "#shared/dates.js";

import { checkPassword, hashPassword, requireSuper } from "../auth.js";
import { ensureSuperAdmin, readSuperAdmin } from "../db.js";
import { pruefeDatenbank } from "../dbCheck.js";
import { readVersion } from "../version.js";
import { emailProblem } from "#shared/email.js";
import { passwortProblem } from "#shared/password.js";

const MAX_UPLOAD = 64 * 1024 * 1024;

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
      // Eine sehr alte Sicherung kennt die super_admin-Tabelle noch nicht.
      ensureSuperAdmin(db, config);

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

  /* --- Eigener Zugang der Verwaltung: Firmencode, E-Mail, Passwort ---
     Dieselbe Selbstverwaltung wie bei Mitarbeitenden und Admins — nur ohne
     die Konten-Tabelle, denn die Verwaltung ist die eine Zeile in
     super_admin, siehe server/db.js. */

  /** Bestätigung des eigenen Passworts vor der Passwortänderung. */
  router.post("/verify-password", (req, res) => {
    const sa = readSuperAdmin(db);
    res.json({ ok: checkPassword(String(req.body?.password || ""), sa.password_hash) });
  });

  router.patch("/password", (req, res) => {
    const sa = readSuperAdmin(db);
    if (!checkPassword(String(req.body?.currentPassword || ""), sa.password_hash)) {
      return res.status(403).json({ error: "Das aktuelle Passwort ist falsch." });
    }
    const password = String(req.body?.password || "");
    const passwortFehler = passwortProblem(password);
    if (passwortFehler) return res.status(400).json({ error: passwortFehler });

    db.prepare("UPDATE super_admin SET password_hash = ? WHERE id = 1").run(hashPassword(password));
    res.json({ ok: true });
  });

  /** Reine Kontaktangabe — anders als bei Mitarbeitenden und Admins optional:
   *  Die Verwaltung bekommt keine Schicht zugeteilt, für die eine
   *  Benachrichtigung nötig wäre. */
  router.patch("/email", (req, res) => {
    const email = String(req.body?.email || "").trim();
    const mailFehler = emailProblem(email);
    if (mailFehler) return res.status(400).json({ error: mailFehler });

    db.prepare("UPDATE super_admin SET email = ? WHERE id = 1").run(email || null);
    res.json({ ok: true });
  });

  /** Der Code, mit dem sich die Verwaltung statt eines Firmencodes anmeldet —
   *  muss sich von jedem vergebenen Firmencode unterscheiden, sonst wüsste
   *  der Login nicht, wer gemeint ist. */
  router.patch("/code", (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Der Firmencode muss 6-stellig sein." });

    const taken = db.prepare("SELECT 1 FROM companies WHERE code = ?").get(code);
    if (taken) return res.status(409).json({ error: "Dieser Firmencode wird bereits verwendet." });

    db.prepare("UPDATE super_admin SET code = ? WHERE id = 1").run(code);
    res.json({ ok: true });
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

/* Datenbank: eine einzige SQLite-Datei. Sichern heisst kopieren.
   Das Schema wird bei jedem Start angelegt, falls es fehlt — ein leeres
   Verzeichnis reicht also aus, um loszulegen. */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

import { uid } from "./ids.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  assignment_day INTEGER NOT NULL DEFAULT 7
);

CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'employee'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_id);

CREATE TABLE IF NOT EXISTS qualifications (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qualifications_company ON qualifications(company_id);

CREATE TABLE IF NOT EXISTS account_qualifications (
  account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  qualification_id TEXT NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, qualification_id)
);

CREATE TABLE IF NOT EXISTS shifts (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  series_id           TEXT NOT NULL,
  name                TEXT NOT NULL,
  date                TEXT NOT NULL,
  start_time          TEXT NOT NULL,
  end_time            TEXT NOT NULL,
  repeat              TEXT NOT NULL,
  seats               INTEGER NOT NULL,
  qualification_id    TEXT REFERENCES qualifications(id) ON DELETE SET NULL,
  assignment_attempted INTEGER NOT NULL DEFAULT 0,
  assigned_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_shifts_company ON shifts(company_id, date);

CREATE TABLE IF NOT EXISTS enrollments (
  shift_id   TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  assigned   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (shift_id, account_id)
);

CREATE TABLE IF NOT EXISTS help_requests (
  shift_id   TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (shift_id, account_id)
);
`;

export function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/**
 * Griff auf die Datenbank, der sich im Betrieb austauschen lässt.
 * Alle Routen arbeiten damit wie mit der Datenbank selbst; nur so kann der
 * Super-Admin eine Sicherung einspielen, ohne den Server neu zu starten.
 */
export class DbHandle {
  constructor(file) {
    this.file = file;
    this.db = openDb(file);
  }

  prepare(sql) { return this.db.prepare(sql); }
  exec(sql) { return this.db.exec(sql); }
  pragma(...args) { return this.db.pragma(...args); }
  transaction(fn) { return this.db.transaction(fn); }
  close() { this.db.close(); }

  /** Schreibt den aktuellen Stand in eine eigenständige Datei. */
  exportTo(target) {
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    this.db.prepare("VACUUM INTO ?").run(path.resolve(target));
    return target;
  }

  /** Sichert den jetzigen Stand und ersetzt ihn durch `source`. */
  replaceWith(source, backupTarget) {
    if (this.file === ":memory:") throw new Error("Eine Datenbank im Arbeitsspeicher lässt sich nicht ersetzen.");
    if (backupTarget) this.exportTo(backupTarget);

    this.db.close();
    fs.copyFileSync(path.resolve(source), path.resolve(this.file));
    // Schreib-Journal der alten Datenbank entfernen, sonst mischen sich Stände.
    for (const suffix of ["-wal", "-shm"]) {
      const stale = path.resolve(this.file) + suffix;
      if (fs.existsSync(stale)) fs.rmSync(stale);
    }
    this.db = openDb(this.file);
  }
}

/* --- Lesen --- */

/** Die Firma in genau der Form, die das Frontend erwartet — ohne Passwörter. */
export function readCompany(db, companyId) {
  const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId);
  if (!row) return null;

  const qualifications = db
    .prepare("SELECT id, name FROM qualifications WHERE company_id = ? ORDER BY rowid")
    .all(companyId);

  const accounts = db
    .prepare("SELECT id, name, email, role FROM accounts WHERE company_id = ? ORDER BY rowid")
    .all(companyId)
    .map((a) => ({
      ...a,
      qualifications: db
        .prepare("SELECT qualification_id FROM account_qualifications WHERE account_id = ?")
        .all(a.id)
        .map((q) => q.qualification_id),
    }));

  const shifts = db
    .prepare("SELECT * FROM shifts WHERE company_id = ? ORDER BY date, start_time")
    .all(companyId)
    .map((s) => toShift(db, s));

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    qualifications,
    accounts,
    shifts,
    settings: { assignmentDay: row.assignment_day },
  };
}

export function toShift(db, s) {
  const enrollments = db
    .prepare("SELECT account_id, assigned FROM enrollments WHERE shift_id = ?")
    .all(s.id);
  return {
    id: s.id,
    seriesId: s.series_id,
    name: s.name,
    date: s.date,
    startTime: s.start_time,
    endTime: s.end_time,
    repeat: s.repeat,
    seats: s.seats,
    qualificationId: s.qualification_id,
    enrolled: enrollments.map((e) => e.account_id),
    assigned: enrollments.filter((e) => e.assigned).map((e) => e.account_id),
    helpRequests: db
      .prepare("SELECT account_id FROM help_requests WHERE shift_id = ?")
      .all(s.id)
      .map((h) => h.account_id),
    assignmentAttempted: !!s.assignment_attempted,
    assignedAt: s.assigned_at,
  };
}

/** Alle Konten einer Firma inklusive Qualifikationen — für die Zuteilungslogik. */
export function readAccountsForLogic(db, companyId) {
  return db
    .prepare("SELECT id, role FROM accounts WHERE company_id = ?")
    .all(companyId)
    .map((a) => ({
      ...a,
      qualifications: db
        .prepare("SELECT qualification_id FROM account_qualifications WHERE account_id = ?")
        .all(a.id)
        .map((q) => q.qualification_id),
    }));
}

export function readShiftsForLogic(db, companyId) {
  return db
    .prepare("SELECT * FROM shifts WHERE company_id = ?")
    .all(companyId)
    .map((s) => toShift(db, s));
}

export function companySummaries(db) {
  return db
    .prepare(
      `SELECT c.id, c.code, c.name,
              SUM(CASE WHEN a.role = 'admin'    THEN 1 ELSE 0 END) AS adminCount,
              SUM(CASE WHEN a.role = 'employee' THEN 1 ELSE 0 END) AS employeeCount
         FROM companies c
    LEFT JOIN accounts a ON a.company_id = c.id
     GROUP BY c.id
     ORDER BY c.rowid`
    )
    .all()
    .map((r) => ({ ...r, adminCount: r.adminCount || 0, employeeCount: r.employeeCount || 0 }));
}

/* --- Schreiben --- */

export function createCompany(db, { code, name, adminName, adminEmail, adminPassword }) {
  const companyId = uid("c");
  db.transaction(() => {
    db.prepare("INSERT INTO companies (id, code, name, assignment_day) VALUES (?, ?, ?, 7)")
      .run(companyId, code, name);
    db.prepare(
      "INSERT INTO accounts (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, 'admin')"
    ).run(uid("a"), companyId, adminName, adminEmail || "", bcrypt.hashSync(adminPassword, 10));
  })();
  return companyId;
}

/** Demo-Firma aus seinem Artifact — nur für den lokalen Betrieb (SB_SEED_DEMO=1). */
export function seedDemo(db) {
  if (db.prepare("SELECT COUNT(*) AS n FROM companies").get().n > 0) return false;

  const companyId = createCompany(db, {
    code: "111111",
    name: "Erste Firma AG",
    adminName: "Mara Vogt",
    adminEmail: "mara@firma.ch",
    adminPassword: "12345",
  });

  const quals = ["Erste Hilfe", "Kassensystem", "Lagerlogistik", "Nachtschicht"].map((name) => {
    const id = uid("q");
    db.prepare("INSERT INTO qualifications (id, company_id, name) VALUES (?, ?, ?)").run(id, companyId, name);
    return id;
  });

  const adminId = db.prepare("SELECT id FROM accounts WHERE company_id = ?").get(companyId).id;
  const leaId = uid("a");
  db.prepare(
    "INSERT INTO accounts (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, 'employee')"
  ).run(leaId, companyId, "Lea Brunner", "lea@firma.ch", bcrypt.hashSync("12345", 10));

  for (const accountId of [adminId, leaId]) {
    for (const qualId of quals.slice(0, 2)) {
      db.prepare("INSERT INTO account_qualifications (account_id, qualification_id) VALUES (?, ?)")
        .run(accountId, qualId);
    }
  }
  return true;
}

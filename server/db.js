/* Datenbank: eine einzige SQLite-Datei. Sichern heisst kopieren.
   Das Schema wird bei jedem Start angelegt, falls es fehlt — ein leeres
   Verzeichnis reicht also aus, um loszulegen. */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

import { uid } from "./ids.js";

/* Eigene Konstante statt inline in SCHEMA: ensureLogbookTypes() unten legt die
   Tabelle bei Bedarf neu an und braucht dieselbe CREATE-Anweisung noch einmal. */
const LOGBOOK_ENTRIES = `
/* Unveränderlicher Audit-Trail: anlegen, ändern, zu-/umteilen, Hilfegesuche,
   Kontoänderungen. Nur INSERT und SELECT — keine Route ändert oder löscht
   einen Eintrag. Name/Schicht bzw. Kontoname stehen zusätzlich als Text da
   (shift_label, message), damit ein Eintrag auch nach gelöschtem Konto oder
   gelöschter Schicht lesbar bleibt. Bei einer Kontoänderung ohne Schicht trägt
   shift_label den Namen des betroffenen Kontos — derselbe Sinn wie bei einer
   Schicht: worum es in dieser Zeile geht. */
CREATE TABLE IF NOT EXISTS logbook_entries (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id           TEXT REFERENCES shifts(id) ON DELETE SET NULL,
  shift_label        TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN
                        ('created', 'updated', 'deleted', 'assigned', 'unassigned', 'reassigned',
                         'help_requested', 'help_withdrawn', 'account_updated', 'password_changed',
                         'enrolled', 'withdrawn')),
  message            TEXT NOT NULL,
  actor_account_id   TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  target_account_id  TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logbook_company ON logbook_entries(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logbook_shift ON logbook_entries(shift_id);
`;

const SCHEMA = `
/* Eine einzige Zeile (id = 1) — die Verwaltung ist kein Konto unter vielen wie
   in accounts, sondern der eine Zugang über allen Firmen. Code, Passwort und
   E-Mail entstehen beim ersten Start aus den Umgebungsvariablen (siehe
   ensureSuperAdmin unten) und lassen sich danach nur noch über die eigenen
   Einstellungen ändern — ein Editieren der .env hat ab dann keine Wirkung
   mehr, genau wie ein Firmen-Admin sein erstes Passwort nur einmal von der
   Administration bekommt und es danach selbst ändert. */
CREATE TABLE IF NOT EXISTS super_admin (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email         TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  assignment_day INTEGER NOT NULL DEFAULT 7,
  /* Fairness-Gewichtung der Auslosung, siehe shared/assignment.js (weightedPick):
     welches Zeitfenster ('month' | '4weeks') die bisherige Belastung misst,
     und ab welchem Schichten-Unterschied sich die Chancen spürbar verschieben. */
  fairness_window          TEXT NOT NULL DEFAULT 'month',
  fairness_threshold_shifts INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
  /* 'pending' für ein Konto, das sich selbst registriert hat und noch auf die
     Bestätigung eines Admins wartet — anmelden kann es sich erst als 'active'.
     Von der Administration angelegte Konten entstehen direkt als 'active'.
     Admin-Konten sind nie 'pending': Selbstregistrierung legt ausschliesslich
     Mitarbeitendenkonten an. */
  status        TEXT NOT NULL DEFAULT 'active',
  /* Optional — nur für Benachrichtigungen (neue Anmeldung wartet, neue
     Zuteilung mit Kalenderdatei). NULL heisst schlicht: keine hinterlegt,
     dieses Konto bekommt dann keine Mail. */
  email         TEXT,
  /* Zählt bei jeder Passwortänderung um eins hoch. Ein Sitzungs-Cookie
     trägt den Stand mit, der beim Anmelden galt — passt er nicht mehr, ist
     die Sitzung vorbei. So endet mit dem alten Passwort auch alles, was mit
     ihm angemeldet wurde. */
  session_epoch INTEGER NOT NULL DEFAULT 0,
  /* Der Zugang zum eigenen Kalenderabo (iCal). NULL, solange niemand den
     Kalender eingeschaltet hat — entsteht erst auf Wunsch, nicht beim Anlegen
     des Kontos. Die Eindeutigkeit erzwingt ein eigener Index weiter unten. */
  calendar_token TEXT
);
CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_id);

/* Legt ein Admin ein Konto an, bekommt es ein zufälliges, niemandem bekanntes
   Passwort — die Person richtet ihr eigenes über den Link aus der
   Einladungsmail ein (siehe server/passwordSetup.js). Eine Zeile hier ist
   dieser eine Link: einlösbar bis expires_at, danach wie nie ausgestellt.
   Eingelöst oder überholt (etwa durch ein von Hand gesetztes Passwort)
   verschwindet die Zeile wieder, statt als Karteileiche liegen zu bleiben. */
CREATE TABLE IF NOT EXISTS password_resets (
  token      TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_account ON password_resets(account_id);

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
  /* Welche Qualifikationen nötig sind, steht in shift_qualifications. */
  end_date            TEXT,
  assignment_attempted INTEGER NOT NULL DEFAULT 0,
  assigned_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_shifts_company ON shifts(company_id, date);
CREATE INDEX IF NOT EXISTS idx_shifts_series ON shifts(company_id, series_id);

/* Was eine Schicht an Qualifikationen verlangt. Eigene Tabelle statt einer
   Spalte, seit es mehrere sein können — und verlangt heisst verlangt: Wer
   übernimmt, braucht sie alle, nicht eine davon. */
CREATE TABLE IF NOT EXISTS shift_qualifications (
  shift_id         TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  qualification_id TEXT NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
  PRIMARY KEY (shift_id, qualification_id)
);
/* Für die Rückfrage „verlangt eine kommende Schicht diese Qualifikation noch?“
   beim Löschen einer Qualifikation — der Primärschlüssel hilft dort nicht. */
CREATE INDEX IF NOT EXISTS idx_shift_qual ON shift_qualifications(qualification_id);

CREATE TABLE IF NOT EXISTS enrollments (
  shift_id   TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  assigned   INTEGER NOT NULL DEFAULT 0,
  /* Wie eine Zuteilung zustande kam: 'lottery' für Auslosung, sofortige
     Zuteilung nach gelaufener Auslosung und Übernahme — 'manual' nur für die
     direkte Zuweisung durch die Administration (siehe assign-manual unten).
     Ohne Bedeutung, solange assigned = 0. */
  assignment_type TEXT NOT NULL DEFAULT 'lottery',
  PRIMARY KEY (shift_id, account_id)
);

/* Sich überschneidende Schichten schliessen einander aus. Hier stehen nur die
   Ausnahmen: Serienpaare, die sich trotzdem zusammen übernehmen lassen. */
CREATE TABLE IF NOT EXISTS combinable_series (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  series_a   TEXT NOT NULL,
  series_b   TEXT NOT NULL,
  PRIMARY KEY (company_id, series_a, series_b)
);

CREATE TABLE IF NOT EXISTS help_requests (
  shift_id   TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (shift_id, account_id)
);

${LOGBOOK_ENTRIES}
/* Bitte eines Mitarbeitenden, das Logbuch einer eigenen vergangenen Schicht
   einsehen zu dürfen. Anders als logbook_entries ein Workflow-Objekt: der
   Status darf sich ändern (pending -> approved/declined). */
CREATE TABLE IF NOT EXISTS logbook_access_requests (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id     TEXT REFERENCES shifts(id) ON DELETE SET NULL,
  shift_label  TEXT NOT NULL,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at   TEXT NOT NULL,
  decided_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_lar_company ON logbook_access_requests(company_id, status);
`;

/** Fügt einer bereits bestehenden Tabelle eine Spalte hinzu, falls sie fehlt
 *  — CREATE TABLE IF NOT EXISTS erreicht ältere Datenbanken nicht mehr. */
function ensureColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Entfernt eine Spalte, die es nicht mehr geben soll — CREATE TABLE IF NOT
 *  EXISTS lässt bestehende Tabellen unangetastet. */
function dropColumn(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
}

/**
 * logbook_entries.type bekam mit den Kontoänderungen und dem Ein-/Austragen
 * neue Werte ('account_updated', 'password_changed', 'enrolled', 'withdrawn').
 * SQLite kann eine CHECK-Bedingung nicht per ALTER TABLE erweitern — anders
 * als bei ensureColumn() reicht ein einfacher Zusatz nicht. Auf einer
 * Datenbank, deren Tabelle die alte, engere Liste noch trägt, wird sie
 * deshalb einmalig neu angelegt und ihr bisheriger Inhalt hinübergeholt; auf
 * einer frisch erzeugten (CREATE TABLE IF NOT EXISTS mit der aktuellen
 * SCHEMA-Fassung) enthält sie die neuen Werte bereits, und diese Funktion
 * tut nichts.
 */
function ensureLogbookTypes(db) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'logbook_entries'")
    .get();
  // Der jüngste hinzugekommene Wert steht stellvertretend für alle: Enthält die
  // Tabelle ihn, ist sie auf dem aktuellen Stand.
  if (!row || row.sql.includes("'withdrawn'")) return;

  db.transaction(() => {
    db.exec("ALTER TABLE logbook_entries RENAME TO logbook_entries_alt");
    db.exec(LOGBOOK_ENTRIES);
    db.exec("INSERT INTO logbook_entries SELECT * FROM logbook_entries_alt");
    db.exec("DROP TABLE logbook_entries_alt");
  })();
}

/**
 * Eine Schicht verlangte früher genau eine Qualifikation (shifts.qualification_id).
 * Jetzt sind es mehrere, und die stehen in shift_qualifications. Der bisherige
 * Inhalt wandert einmalig hinüber, danach ist die Spalte überflüssig — sie
 * stehen zu lassen hiesse, zwei Antworten auf dieselbe Frage aufzubewahren.
 */
function ensureShiftQualifications(db) {
  const hatSpalte = db
    .prepare("PRAGMA table_info(shifts)")
    .all()
    .some((c) => c.name === "qualification_id");
  if (!hatSpalte) return;

  db.transaction(() => {
    db.exec(
      `INSERT OR IGNORE INTO shift_qualifications (shift_id, qualification_id)
            SELECT id, qualification_id FROM shifts WHERE qualification_id IS NOT NULL`
    );
  })();
  dropColumn(db, "shifts", "qualification_id");
}

export function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  ensureLogbookTypes(db);
  ensureShiftQualifications(db);
  ensureColumn(db, "shifts", "end_date", "TEXT");
  ensureColumn(db, "accounts", "session_epoch", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "accounts", "calendar_token", "TEXT");
  ensureColumn(db, "accounts", "status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(db, "accounts", "email", "TEXT");
  /* NULL = normaler Betrieb. Beide unabhängig voneinander: pausiert sperrt nur
     den Zugang, archiviert zusätzlich die sichtbare Firmenliste — beides lässt
     sich einzeln wieder aufheben, siehe server/routes/companies.js. */
  ensureColumn(db, "companies", "paused_at", "TEXT");
  ensureColumn(db, "companies", "archived_at", "TEXT");
  ensureColumn(db, "companies", "fairness_window", "TEXT NOT NULL DEFAULT 'month'");
  ensureColumn(db, "companies", "fairness_threshold_shifts", "INTEGER NOT NULL DEFAULT 3");
  ensureColumn(db, "enrollments", "assignment_type", "TEXT NOT NULL DEFAULT 'lottery'");
  /* SQLite lässt eine per ALTER TABLE nachgerüstete Spalte keine UNIQUE-
     Bedingung tragen (Einschränkung von ALTER TABLE ADD COLUMN) — ein eigener
     Index leistet dasselbe: Jedes Zeichen bleibt genau einem Konto zugeordnet,
     mehrere NULL (Kalender aus) sind dabei ausdrücklich erlaubt. */
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_calendar_token ON accounts(calendar_token)");
  /* Rest einer früheren Fassung: Keine Zeile im Programm liest diese Spalte
     noch. Stehen zu lassen hiesse, bei jedem Blick ins Schema neu zu fragen,
     wofür sie gut ist — und die Antwort wäre jedes Mal: für nichts. */
  dropColumn(db, "shifts", "no_auto_assign");
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

/**
 * Legt die eine Zeile der Verwaltung an, falls sie noch fehlt — aus den
 * Umgebungsvariablen, mit denen der Server gerade gestartet wurde. Danach
 * lebt der Zugang ausschliesslich in der Datenbank; ein Aufruf, der schon
 * eine Zeile vorfindet, tut nichts, ändert also auch ein per Oberfläche
 * geändertes Passwort nicht wieder auf den .env-Wert zurück.
 *
 * Gehört an jede Stelle, die eine `super_admin`-Tabelle ohne Gewähr vorfindet:
 * den Start (server/index.js), die Tests (tests/helpers/server.js) und nach
 * dem Einspielen einer Sicherung (server/routes/admin.js) — eine sehr alte
 * Sicherung könnte die Tabelle noch nicht kennen.
 */
export function ensureSuperAdmin(db, config) {
  if (db.prepare("SELECT 1 FROM super_admin WHERE id = 1").get()) return;
  db.prepare(
    "INSERT INTO super_admin (id, code, name, password_hash, email) VALUES (1, ?, ?, ?, NULL)"
  ).run(config.superAdmin.code, config.superAdmin.name, bcrypt.hashSync(config.superAdmin.password, 10));
}

/** Die eine Zeile der Verwaltung — ohne Gewähr, dass sie existiert, siehe ensureSuperAdmin(). */
export function readSuperAdmin(db) {
  return db.prepare("SELECT code, name, password_hash, email FROM super_admin WHERE id = 1").get();
}

/* --- Lesen --- */

/* Sammelt Zeilen zu Listen je Schlüssel. Damit kommt eine ganze Firma mit
   einer Handvoll Abfragen aus; vorher lief /api/state mit zwei Abfragen pro
   Schicht und einer pro Konto. */
function gruppiere(rows, key, wert) {
  const map = new Map();
  for (const r of rows) map.set(r[key], [...(map.get(r[key]) || []), wert(r)]);
  return map;
}

/**
 * Konten einer Firma samt Qualifikationen; `spalten` bestimmt, was mitkommt.
 * `status` schränkt auf 'active' oder 'pending' ein — ohne Angabe kommen beide.
 */
function readAccounts(db, companyId, spalten, { status = null } = {}) {
  const quals = gruppiere(
    db.prepare(
      `SELECT aq.account_id, aq.qualification_id FROM account_qualifications aq
         JOIN accounts a ON a.id = aq.account_id
        WHERE a.company_id = ? ORDER BY aq.rowid`
    ).all(companyId),
    "account_id",
    (r) => r.qualification_id
  );
  const args = status ? [companyId, status] : [companyId];
  return db
    .prepare(`SELECT ${spalten} FROM accounts WHERE company_id = ?${status ? " AND status = ?" : ""} ORDER BY rowid`)
    .all(...args)
    .map((a) => ({ ...a, qualifications: quals.get(a.id) || [] }));
}

/** Die Schicht in der Form, die Frontend und Zuteilungslogik erwarten. */
function alsSchicht(s, enrolled = [], assigned = [], helpRequests = [], qualificationIds = [], assignmentTypes = {}) {
  return {
    id: s.id,
    seriesId: s.series_id,
    name: s.name,
    date: s.date,
    startTime: s.start_time,
    endTime: s.end_time,
    repeat: s.repeat,
    seats: s.seats,
    qualificationIds,
    endDate: s.end_date,
    enrolled,
    assigned,
    /* Konto-ID auf 'lottery' | 'manual' — nur für Konten in `assigned` gesetzt.
       Damit kann die Oberfläche eine direkte Zuweisung durch die
       Administration von einer per Auslosung zustande gekommenen unterscheiden. */
    assignmentTypes,
    helpRequests,
    assignmentAttempted: !!s.assignment_attempted,
    assignedAt: s.assigned_at,
  };
}

/** Konto-ID auf assignment_type, nur für tatsächlich zugeteilte Zeilen. */
function assignmentTypesVon(rows) {
  const out = {};
  for (const r of rows) if (r.assigned) out[r.account_id] = r.assignment_type;
  return out;
}

/** Eine einzelne Schicht-Zeile — für die Stellen, die genau eine anfassen. */
export function toShift(db, s) {
  const e = db.prepare("SELECT account_id, assigned, assignment_type FROM enrollments WHERE shift_id = ?").all(s.id);
  const h = db.prepare("SELECT account_id FROM help_requests WHERE shift_id = ?").all(s.id);
  const q = db.prepare(
    `SELECT sq.qualification_id FROM shift_qualifications sq
       JOIN qualifications x ON x.id = sq.qualification_id
      WHERE sq.shift_id = ? ORDER BY x.rowid`
  ).all(s.id);
  return alsSchicht(
    s,
    e.map((r) => r.account_id),
    e.filter((r) => r.assigned).map((r) => r.account_id),
    h.map((r) => r.account_id),
    q.map((r) => r.qualification_id),
    assignmentTypesVon(e)
  );
}

/** Alle Schichten einer Firma — drei Abfragen, unabhängig von der Menge. */
export function readShifts(db, companyId, sortiert = false) {
  const einschreibungen = db.prepare(
    `SELECT e.shift_id, e.account_id, e.assigned, e.assignment_type FROM enrollments e
       JOIN shifts s ON s.id = e.shift_id WHERE s.company_id = ?`
  ).all(companyId);
  const hilfegesuche = db.prepare(
    `SELECT h.shift_id, h.account_id FROM help_requests h
       JOIN shifts s ON s.id = h.shift_id WHERE s.company_id = ?`
  ).all(companyId);

  /* Nach der Reihenfolge der Qualifikationsliste sortiert, damit zwei Schichten
     mit denselben Anforderungen sie auch gleich aufzählen. */
  const anforderungen = db.prepare(
    `SELECT sq.shift_id, sq.qualification_id FROM shift_qualifications sq
       JOIN shifts s ON s.id = sq.shift_id
       JOIN qualifications q ON q.id = sq.qualification_id
      WHERE s.company_id = ? ORDER BY q.rowid`
  ).all(companyId);

  const konto = (r) => r.account_id;
  const enrolled = gruppiere(einschreibungen, "shift_id", konto);
  const zugeteilteZeilen = einschreibungen.filter((r) => r.assigned);
  const assigned = gruppiere(zugeteilteZeilen, "shift_id", konto);
  const assignmentTypes = new Map();
  for (const r of zugeteilteZeilen) {
    const bisher = assignmentTypes.get(r.shift_id) || {};
    bisher[r.account_id] = r.assignment_type;
    assignmentTypes.set(r.shift_id, bisher);
  }
  const hilfe = gruppiere(hilfegesuche, "shift_id", konto);
  const quals = gruppiere(anforderungen, "shift_id", (r) => r.qualification_id);

  return db
    .prepare(`SELECT * FROM shifts WHERE company_id = ?${sortiert ? " ORDER BY date, start_time" : ""}`)
    .all(companyId)
    .map((s) =>
      alsSchicht(s, enrolled.get(s.id), assigned.get(s.id), hilfe.get(s.id), quals.get(s.id), assignmentTypes.get(s.id) || {})
    );
}

/**
 * Einsichtsanfragen ins Logbuch. Klein genug fürs Gesamtbündel — anders als
 * logbook_entries, die auf Wunsch pro Tab bzw. pro freigegebener Schicht
 * nachgeladen werden.
 *
 * `accountId` schränkt auf die eigenen ein: Die Notiz einer Anfrage geht
 * niemanden ausser der anfragenden Person und der Administration etwas an.
 */
function readAccessRequests(db, companyId, accountId = null) {
  return db
    .prepare(
      `SELECT r.id, r.shift_id AS shiftId, r.shift_label AS shiftLabel, r.account_id AS accountId,
              a.name AS accountName, r.note, r.status, r.created_at AS createdAt, r.decided_at AS decidedAt
         FROM logbook_access_requests r
         JOIN accounts a ON a.id = r.account_id
        WHERE r.company_id = ?${accountId ? " AND r.account_id = ?" : ""}
        ORDER BY r.created_at DESC`
    )
    .all(...(accountId ? [companyId, accountId] : [companyId]));
}

/**
 * Die Firma in genau der Form, die das Frontend erwartet — ohne Passwörter.
 * `anfragenVon` schränkt die Einsichtsanfragen auf ein Konto ein; ohne die
 * Angabe kommen alle mit (für die Administration).
 */
export function readCompany(db, companyId, { anfragenVon = null, admin = false } = {}) {
  const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId);
  if (!row) return null;

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    qualifications: db
      .prepare("SELECT id, name FROM qualifications WHERE company_id = ? ORDER BY rowid")
      .all(companyId),
    accounts: readAccounts(db, companyId, "id, name, role", { status: "active" }),
    /* Selbst registrierte, noch unbestätigte Konten — ausschliesslich für die
       Administration, die sie unter „Anmeldungen“ annimmt oder ablehnt. Bis
       dahin tauchen sie nirgends sonst auf: nicht in der Mitarbeitendenliste,
       nicht als Nachfolge-Kandidat, nicht in der Zuteilung. */
    pendingAccounts: admin ? readAccounts(db, companyId, "id, name, role", { status: "pending" }) : [],
    shifts: readShifts(db, companyId, true),
    /* Damit das Bearbeiten-Formular zeigen kann, was bereits freigegeben ist —
       sonst nähme jede Änderung einer Schicht eine alte Freigabe stillschweigend
       zurück. */
    combinableSeries: db
      .prepare("SELECT series_a, series_b FROM combinable_series WHERE company_id = ?")
      .all(companyId)
      .map((r) => [r.series_a, r.series_b]),
    logbookAccessRequests: readAccessRequests(db, companyId, anfragenVon),
    settings: {
      assignmentDay: row.assignment_day,
      fairnessWindow: row.fairness_window,
      fairnessThresholdShifts: row.fairness_threshold_shifts,
    },
  };
}

/** Alle aktiven Konten einer Firma inklusive Qualifikationen — für die Zuteilungslogik.
 *  Ein noch unbestätigtes Konto kann sich nicht anmelden und soll deshalb auch
 *  keine Schicht zugeteilt bekommen. */
export function readAccountsForLogic(db, companyId) {
  return readAccounts(db, companyId, "id, role", { status: "active" });
}

/**
 * Kurzfassungen für die Verwaltung. `archiviert` schaltet auf die Unternehmen
 * um, deren Zugang gelöscht wurde — ihre Daten bleiben bis zur endgültigen
 * Löschung erhalten, siehe server/routes/companies.js.
 */
export function companySummaries(db, { archiviert = false } = {}) {
  return db
    .prepare(
      `SELECT c.id, c.code, c.name, c.paused_at AS pausedAt, c.archived_at AS archivedAt,
              COUNT(CASE WHEN a.role = 'admin'    THEN 1 END) AS adminCount,
              COUNT(CASE WHEN a.role = 'employee' THEN 1 END) AS employeeCount
         FROM companies c
    LEFT JOIN accounts a ON a.company_id = c.id
        WHERE c.archived_at IS ${archiviert ? "NOT NULL" : "NULL"}
     GROUP BY c.id
     ORDER BY ${archiviert ? "c.archived_at DESC" : "c.rowid"}`
    )
    .all();
}

/* --- Schreiben --- */

export function createCompany(db, { code, name, adminName, adminPassword, adminEmail = null }) {
  const companyId = uid("c");
  db.transaction(() => {
    db.prepare("INSERT INTO companies (id, code, name, assignment_day) VALUES (?, ?, ?, 7)")
      .run(companyId, code, name);
    db.prepare(
      "INSERT INTO accounts (id, company_id, name, password_hash, role, email) VALUES (?, ?, ?, ?, 'admin', ?)"
    ).run(uid("a"), companyId, adminName, bcrypt.hashSync(adminPassword, 10), adminEmail || null);
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
    "INSERT INTO accounts (id, company_id, name, password_hash, role) VALUES (?, ?, ?, ?, 'employee')"
  ).run(leaId, companyId, "Lea Brunner", bcrypt.hashSync("12345", 10));

  for (const accountId of [adminId, leaId]) {
    for (const qualId of quals.slice(0, 2)) {
      db.prepare("INSERT INTO account_qualifications (account_id, qualification_id) VALUES (?, ?)")
        .run(accountId, qualId);
    }
  }
  return true;
}

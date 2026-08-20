/* Ist diese Datei überhaupt eine Schichtboard-Datenbank?

   Dieselbe Prüfung braucht die Verwaltungsoberfläche (server/routes/admin.js)
   und das Kommandozeilen-Werkzeug (scripts/db-import.js). Zwei Fassungen davon
   liefen mit dem nächsten neuen Pflichtfeld auseinander. */

import Database from "better-sqlite3";

const PFLICHTTABELLEN = [
  "companies", "accounts", "qualifications", "shifts", "enrollments", "help_requests",
];

/** { ok: true, companies, accounts } — oder { ok: false, error } mit fertigem Satz. */
export function pruefeDatenbank(datei) {
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

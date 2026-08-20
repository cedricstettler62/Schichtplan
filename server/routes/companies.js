/* Unternehmensverwaltung — ausschliesslich für den Super-Admin. */

import { Router } from "express";

import { endeAlleSitzungen, hashPassword, kontoWaereUnerreichbar, requireSuper, safeEqual } from "../auth.js";
import { loescheKonto } from "../accounts.js";
import { createCompany } from "../db.js";
import { logPasswordChanged, readLogbook } from "../logbook.js";
import { passwortProblem } from "#shared/password.js";

export default function companiesRoutes(db, config) {
  const router = Router();
  router.use(requireSuper);

  router.post("/", (req, res) => {
    const code = String(req.body?.code || "").trim();
    const name = String(req.body?.name || "").trim();
    const adminName = String(req.body?.adminName || "").trim();
    const adminPassword = String(req.body?.adminPassword || "");

    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Der Firmencode muss 6-stellig sein." });
    if (!name || !adminName) {
      return res.status(400).json({ error: "Firmenname und Admin-Name sind nötig." });
    }
    const passwortFehler = passwortProblem(adminPassword);
    if (passwortFehler) return res.status(400).json({ error: passwortFehler });

    const taken = db.prepare("SELECT 1 FROM companies WHERE code = ?").get(code);
    if (taken || code === config.superAdmin.code) {
      return res.status(409).json({ error: "Dieser Firmencode wird bereits verwendet." });
    }

    // Das erste Passwort setzt die Verwaltung und gibt es persönlich weiter.
    const id = createCompany(db, { code, name, adminName, adminPassword });
    res.json({ id });
  });

  /**
   * Die Firma zu :id — oder schon die fertige Fehlerantwort (null).
   * Ein archiviertes Unternehmen ist eingefroren: Nur Wiederherstellen, die
   * endgültige Löschung und das Nachlesen (`auchArchiviert`) wirken noch.
   */
  const firma = (req, res, { auchArchiviert = false } = {}) => {
    const row = db.prepare("SELECT id, archived_at FROM companies WHERE id = ?").get(req.params.id);
    if (!row) { res.status(404).json({ error: "Unternehmen nicht gefunden." }); return null; }
    if (!auchArchiviert && row.archived_at) {
      res.status(409).json({ error: "Dieses Unternehmen ist archiviert." });
      return null;
    }
    return row;
  };

  router.patch("/:id", (req, res) => {
    if (!firma(req, res)) return;
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name fehlt." });
    db.prepare("UPDATE companies SET name = ? WHERE id = ?").run(name, req.params.id);
    res.json({ ok: true });
  });

  /**
   * Löscht den Zugang eines Unternehmens sofort — ohne seine Daten
   * anzufassen. Schichten, Logbuch und Konten bleiben, damit die
   * Aufbewahrungspflicht (siehe Datenschutzerklärung) eingehalten wird; die
   * Verwaltung sieht das Unternehmen danach nur noch unter „Archiviert“.
   */
  router.post("/:id/archive", (req, res) => {
    if (!firma(req, res, { auchArchiviert: true })) return;
    db.prepare("UPDATE companies SET archived_at = ? WHERE id = ?").run(new Date().toISOString(), req.params.id);
    res.json({ ok: true });
  });

  /** Macht ein archiviertes Unternehmen wieder zugänglich — ohne Datenverlust. */
  router.post("/:id/restore", (req, res) => {
    if (!firma(req, res, { auchArchiviert: true })) return;
    db.prepare("UPDATE companies SET archived_at = NULL WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  /**
   * Endgültige Löschung — nur aus dem Archiv heraus. Erst hier greift das
   * bisherige Verhalten: Konten, Schichten, Einschreibungen und das Logbuch
   * hängen per ON DELETE CASCADE daran und verschwinden mit.
   */
  router.delete("/:id", (req, res) => {
    const company = firma(req, res, { auchArchiviert: true });
    if (!company) return;
    if (!company.archived_at) {
      return res.status(409).json({ error: "Erst archivieren, dann endgültig löschen." });
    }
    db.prepare("DELETE FROM companies WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  /** Sperrt den Zugang reversibel, ohne das Unternehmen zu archivieren — z. B. bei offenen Rückfragen. */
  router.post("/:id/pause", (req, res) => {
    if (!firma(req, res)) return;
    db.prepare("UPDATE companies SET paused_at = ? WHERE id = ?").run(new Date().toISOString(), req.params.id);
    res.json({ ok: true });
  });

  router.post("/:id/unpause", (req, res) => {
    if (!firma(req, res)) return;
    db.prepare("UPDATE companies SET paused_at = NULL WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  /* --- Ausgesperrte Admins --- */

  const konten = (companyId, rolle) =>
    db.prepare("SELECT id, name FROM accounts WHERE company_id = ? AND role = ? ORDER BY rowid").all(companyId, rolle);

  /** Die Mitarbeitendenkonten einer Firma — daraus kommt eine Nachfolge. */
  router.get("/:id/employees", (req, res) => res.json(konten(req.params.id, "employee")));

  /** Das volle Logbuch einer Firma — nur auf Wunsch geladen, nicht mit der Firmenliste. */
  router.get("/:id/logbook", (req, res) => {
    const company = firma(req, res, { auchArchiviert: true });
    if (company) res.json(readLogbook(db, company.id));
  });

  /** Die Admin-Konten einer Firma, damit die Verwaltung weiss, wen sie befreit. */
  router.get("/:id/admins", (req, res) => {
    const company = firma(req, res, { auchArchiviert: true });
    if (company) res.json(konten(company.id, "admin"));
  });

  /**
   * Setzt das Passwort eines Firmen-Admins neu. Unter Admins darf das niemand
   * — sonst könnte einer die Firma übernehmen —, also bleibt für ein
   * ausgesperrtes Admin-Konto nur der Weg über die Verwaltung.
   *
   * Bestätigt wird mit dem Passwort der Verwaltung: Ein offen liegender
   * Browser soll nicht reichen, um sich in jede Firma zu setzen.
   */
  router.post("/:id/admins/:accountId/password", (req, res) => {
    if (!firma(req, res)) return;
    const target = db
      .prepare("SELECT id, name FROM accounts WHERE id = ? AND company_id = ? AND role = 'admin'")
      .get(req.params.accountId, req.params.id);
    if (!target) return res.status(404).json({ error: "Admin-Konto nicht gefunden." });

    if (!safeEqual(String(req.body?.currentPassword || ""), config.superAdmin.password)) {
      return res.status(403).json({ error: "Das Passwort der Verwaltung ist falsch." });
    }

    const password = String(req.body?.password || "");
    const passwortFehler = passwortProblem(password);
    if (passwortFehler) return res.status(400).json({ error: passwortFehler });
    /* Gleicher Name und gleiches Passwort wie ein anderes Konto der Firma: Die
       Anmeldung landete dann immer beim ersten, und das befreite Konto bliebe
       genauso ausgesperrt wie vorher. */
    if (kontoWaereUnerreichbar(db, req.params.id, target.name, password, target.id)) {
      return res.status(409).json({
        error: "Mit diesem Passwort wäre das Konto nicht erreichbar: Ein anderes Konto mit demselben Namen benutzt es bereits. Bitte ein anderes wählen.",
      });
    }

    db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(hashPassword(password), target.id);
    /* Hier zählt es doppelt: Wird ein Admin-Konto befreit, weil es in falsche
       Hände geraten ist, muss jede noch offene Anmeldung damit enden. */
    endeAlleSitzungen(db, target.id);
    // Wer und wann, nie das Passwort selbst — das Logbuch ist kein Tresor dafür.
    logPasswordChanged(db, req.params.id, {
      accountName: target.name, accountId: target.id,
      actorName: config.superAdmin.name, actorAccountId: null, selbst: false,
    });
    res.json({ ok: true });
  });

  /**
   * Löscht ein Admin-Konto. Innerhalb der Firma geht das nicht: Ein Admin darf
   * einen anderen weder aussperren noch entfernen, sonst könnte er die Firma
   * übernehmen. Bleibt jemand als Karteileiche stehen — ausgeschieden, Konto
   * noch da —, ist die Verwaltung der Weg.
   *
   * War es das letzte Admin-Konto, muss dabei eine Nachfolge aus der Belegschaft
   * bestimmt werden. Eine Firma ohne Administration kann niemand mehr
   * verwalten, und ihre Mitarbeitenden kämen an keine Schicht mehr.
   */
  router.delete("/:id/admins/:accountId", (req, res) => {
    if (!firma(req, res)) return;
    const target = db
      .prepare("SELECT id, name FROM accounts WHERE id = ? AND company_id = ? AND role = 'admin'")
      .get(req.params.accountId, req.params.id);
    if (!target) return res.status(404).json({ error: "Admin-Konto nicht gefunden." });

    // Wie beim Zurücksetzen: Ein offen liegender Browser soll nicht reichen.
    if (!safeEqual(String(req.body?.currentPassword || ""), config.superAdmin.password)) {
      return res.status(403).json({ error: "Das Passwort der Verwaltung ist falsch." });
    }

    const { n: admins } = db
      .prepare("SELECT COUNT(*) AS n FROM accounts WHERE company_id = ? AND role = 'admin'")
      .get(req.params.id);

    let nachfolge = null;
    if (admins <= 1) {
      nachfolge = db
        .prepare("SELECT id, name FROM accounts WHERE id = ? AND company_id = ? AND role = 'employee'")
        .get(String(req.body?.nachfolgerId || ""), req.params.id);
      if (!nachfolge) {
        return res.status(409).json({
          error:
            "Das ist die letzte Administration. Bestimme ein Mitarbeitendenkonto, das die Administration übernimmt.",
        });
      }
    }

    loescheKonto(db, req.params.id, target, {
      actorName: config.superAdmin.name,
      nachfolgerId: nachfolge?.id,
    });

    res.json({ ok: true, nachfolge: nachfolge ? nachfolge.name : null });
  });

  return router;
}

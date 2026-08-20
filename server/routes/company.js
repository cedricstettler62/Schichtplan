/* Qualifikationen, Konten und Einstellungen einer Firma.
   Jede Route prüft Rolle *und* Firmenzugehörigkeit — im Browser schützte
   bisher nur das Ausblenden von Tabs. */

import crypto from "node:crypto";

import { Router } from "express";

import { startOfToday, toISO } from "#shared/dates.js";
import { passwortProblem } from "#shared/password.js";

import { loescheKonto } from "../accounts.js";
import {
  checkPassword,
  endeAlleSitzungen,
  hashPassword,
  kontoWaereUnerreichbar,
  requireAdmin,
  requireCompany,
  setAccountSession,
} from "../auth.js";
import { recompute } from "../assignment.js";
import { logAccountChanged, logPasswordChanged } from "../logbook.js";
import { dateiname, personalData } from "../personalData.js";
import { uid } from "../ids.js";

/** Die vollständige, einfügbare Adresse — ein Kalenderprogramm liegt ausserhalb
 *  des Browsers und kommt mit einem relativen Pfad nicht zurecht. */
function kalenderUrl(req, token) {
  return `${req.protocol}://${req.get("host")}/api/kalender/${token}.ics`;
}

function adminCount(db, companyId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM accounts WHERE company_id = ? AND role = 'admin'")
    .get(companyId).n;
}

export default function companyRoutes(db, config) {
  // Bewusst pro Route abgesichert statt per router.use: dieser Router hängt
  // direkt unter /api und darf nachfolgende Router (etwa /api/companies für
  // die Verwaltung) nicht abfangen.
  const router = Router();

  /**
   * Das Konto zu :id aus *dieser* Firma — oder schon die fertige Fehlerantwort
   * (dann null). `regel` sagt, wer hineinreichen darf:
   *
   *   "eingriff" — das eigene immer, ein fremdes nur als Admin und nur, wenn es
   *                kein Admin-Konto ist. Sonst könnte ein Admin die anderen
   *                entmachten und die Firma übernehmen; wer an ein Admin-Konto
   *                muss (löschen, Passwort, Rolle), geht über die Verwaltung.
   *                Dieselbe Grenze gilt für Passwort, Qualifikationen, Rolle
   *                und Löschen — eine mildere Handlung schwächer zu schützen
   *                als eine härtere wäre die falsche Reihenfolge.
   *   "selbst"   — ausschliesslich das eigene. Für rein Persönliches wie das
   *                Kalenderabo: ein fremdes Zeichen zu erzeugen hülfe niemandem.
   *   "auskunft" — das eigene, oder als Admin jedes Konto der Firma.
   */
  const ziel = (req, res, regel, verb = "ändert") => {
    const target = db
      .prepare("SELECT id, company_id, name, role FROM accounts WHERE id = ? AND company_id = ?")
      .get(req.params.id, req.session.companyId);
    if (!target) {
      res.status(404).json({ error: "Konto nicht gefunden." });
      return null;
    }
    const selbst = target.id === req.session.accountId;
    const admin = req.session.role === "admin";

    if (regel === "eingriff" && !selbst && !(admin && target.role !== "admin")) {
      res.status(403).json({ error: `Ein fremdes Admin-Konto ${verb} nur die Verwaltung.` });
      return null;
    }
    if ((regel === "selbst" && !selbst) || (regel === "auskunft" && !selbst && !admin)) {
      res.status(403).json({ error: "Nicht erlaubt." });
      return null;
    }
    return target;
  };

  /* --- Qualifikationen --- */

  router.post("/qualifications", requireAdmin, (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name fehlt." });

    const existing = db
      .prepare("SELECT id FROM qualifications WHERE company_id = ? AND lower(name) = lower(?)")
      .get(req.session.companyId, name);
    if (existing) return res.json({ id: existing.id });

    const id = uid("q");
    db.prepare("INSERT INTO qualifications (id, company_id, name) VALUES (?, ?, ?)")
      .run(id, req.session.companyId, name);
    res.json({ id });
  });

  router.delete("/qualifications/:id", requireAdmin, (req, res) => {
    /* Mit der Qualifikation verschwindet auch ihr Eintrag an jeder Schicht. Eine
       Schicht, die sie als Einzige verlangte, stünde danach ohne Anforderung da
       und liesse sich weder einschreiben noch übernehmen; bei mehreren fiele
       stillschweigend eine Bedingung weg. Deshalb hier abfangen, solange noch
       kommende Schichten die Qualifikation verlangen. */
    const { n } = db
      .prepare(
        `SELECT COUNT(*) AS n FROM shifts s
           JOIN shift_qualifications sq ON sq.shift_id = s.id
          WHERE s.company_id = ? AND sq.qualification_id = ? AND s.date >= ?`
      )
      .get(req.session.companyId, req.params.id, toISO(startOfToday()));

    if (n > 0) {
      return res.status(409).json({
        error:
          n === 1
            ? "Eine kommende Schicht verlangt diese Qualifikation. Löschen ist erst möglich, wenn sie vorbei ist."
            : `${n} kommende Schichten verlangen diese Qualifikation. Löschen ist erst möglich, wenn sie vorbei sind.`,
      });
    }

    // Verknüpfungen und vergangene Schichten räumt das Schema selbst auf.
    db.prepare("DELETE FROM qualifications WHERE id = ? AND company_id = ?")
      .run(req.params.id, req.session.companyId);
    recompute(db, req.session.companyId);
    res.json({ ok: true });
  });

  /* --- Konten --- */

  /**
   * Legt ein Konto samt erstem Passwort an. Die Administration gibt es
   * persönlich weiter und die Person ändert es danach selbst — schriftlich
   * verschickt läge es dauerhaft irgendwo herum.
   */
  router.post("/employees", requireAdmin, (req, res) => {
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");
    if (!name) return res.status(400).json({ error: "Ein Name ist nötig." });
    const passwortFehler = passwortProblem(password);
    if (passwortFehler) return res.status(400).json({ error: passwortFehler });
    if (kontoWaereUnerreichbar(db, req.session.companyId, name, password)) {
      return res.status(409).json({
        error: "Dieses Konto wäre nicht erreichbar: Es gibt bereits ein Konto mit diesem Namen und diesem Passwort. Bitte ein anderes Passwort vergeben.",
      });
    }

    const id = uid("a");
    db.prepare(
      "INSERT INTO accounts (id, company_id, name, password_hash, role) VALUES (?, ?, ?, ?, 'employee')"
    ).run(id, req.session.companyId, name, hashPassword(password));

    res.json({ id });
  });

  /**
   * Qualifikationen vergibt ausschliesslich die Administration — für die
   * Belegschaft und für sich selbst, nicht für andere Admin-Konten.
   *
   * Vorher durfte jedes Konto seine eigenen setzen, damit war „Erste Hilfe“
   * eine Selbstauskunft, während Oberfläche und Handbuch sie als Zusicherung
   * der Administration beschreiben. Von beidem kann nur eines stimmen.
   */
  router.patch("/accounts/:id/qualifications", requireAdmin, (req, res) => {
    const target = ziel(req, res, "eingriff");
    if (!target) return;

    const qual = db
      .prepare("SELECT id, name FROM qualifications WHERE id = ? AND company_id = ?")
      .get(String(req.body?.qualificationId || ""), req.session.companyId);
    if (!qual) return res.status(404).json({ error: "Qualifikation nicht gefunden." });

    if (req.body?.value) {
      db.prepare("INSERT OR IGNORE INTO account_qualifications (account_id, qualification_id) VALUES (?, ?)")
        .run(target.id, qual.id);
    } else {
      db.prepare("DELETE FROM account_qualifications WHERE account_id = ? AND qualification_id = ?")
        .run(target.id, qual.id);
    }
    logAccountChanged(db, req.session.companyId, {
      accountName: target.name, accountId: target.id,
      message: `Qualifikation „${qual.name}“ ${req.body?.value ? "vergeben" : "entzogen"}, durch ${req.session.name}.`,
      actorAccountId: req.session.accountId,
    });
    recompute(db, req.session.companyId);
    res.json({ ok: true });
  });

  /** Rollenwechsel protokollieren — beide Richtungen lesen sich gleich. */
  const logRolle = (req, target, von, nach) =>
    logAccountChanged(db, req.session.companyId, {
      accountName: target.name, accountId: target.id,
      message: `Rolle geändert von ${von} zu ${nach}, durch ${req.session.name}.`,
      actorAccountId: req.session.accountId,
    });

  router.post("/accounts/:id/promote", requireAdmin, (req, res) => {
    const target = ziel(req, res, "eingriff");
    if (!target) return;
    if (target.role === "admin") return res.json({ ok: true });
    db.prepare("UPDATE accounts SET role = 'admin' WHERE id = ?").run(target.id);
    logRolle(req, target, "Mitarbeitende", "Administration");
    res.json({ ok: true });
  });

  /**
   * Adminrechte abgeben — ausschliesslich die eigenen.
   *
   * Ein Admin stuft keinen anderen herunter: Das wäre dasselbe Entmachten wie
   * ein fremdes Passwort zu setzen, nur leiser. Wer versehentlich befördert
   * wurde, gibt die Rechte selbst wieder ab; die letzte Administration kann es
   * nicht, sonst stünde die Firma ohne da.
   */
  router.post("/accounts/:id/demote", requireCompany, (req, res) => {
    const target = db
      .prepare("SELECT id, name, role FROM accounts WHERE id = ? AND company_id = ?")
      .get(req.params.id, req.session.companyId);
    if (!target) return res.status(404).json({ error: "Konto nicht gefunden." });
    if (target.id !== req.session.accountId) {
      return res.status(403).json({ error: "Adminrechte gibt jede Person nur selbst ab." });
    }
    if (target.role !== "admin") return res.json({ ok: true });
    if (adminCount(db, req.session.companyId) <= 1) {
      return res.status(409).json({
        error: "Du bist die letzte Administration. Befördere zuerst jemanden, der übernimmt.",
      });
    }

    db.prepare("UPDATE accounts SET role = 'employee' WHERE id = ?").run(target.id);
    logRolle(req, target, "Administration", "Mitarbeitende");
    res.json({ ok: true });
  });

  /**
   * Eigenes Passwort ändern — oder als Admin das eines Mitarbeitendenkontos
   * zurücksetzen, wenn dort jemand ausgesperrt ist. Bestätigt wird in beiden
   * Fällen mit dem *eigenen* Passwort: Das fremde kennt der Admin ja nicht.
   */
  router.post("/accounts/:id/password", requireCompany, (req, res) => {
    const target = ziel(req, res, "eingriff");
    if (!target) return;

    const password = String(req.body?.password || "");
    const passwortFehler = passwortProblem(password);
    if (passwortFehler) return res.status(400).json({ error: passwortFehler });

    const eigenes = db.prepare("SELECT password_hash FROM accounts WHERE id = ?").get(req.session.accountId);
    if (!checkPassword(String(req.body?.currentPassword || ""), eigenes.password_hash)) {
      return res.status(403).json({ error: "Das aktuelle Passwort ist falsch." });
    }
    // Sonst liesse sich ein Konto nachträglich hinter einem gleichnamigen verstecken.
    if (kontoWaereUnerreichbar(db, req.session.companyId, target.name, password, target.id)) {
      return res.status(409).json({
        error: "Mit diesem Passwort wäre das Konto nicht mehr erreichbar: Ein anderes Konto mit demselben Namen benutzt es bereits. Bitte ein anderes wählen.",
      });
    }

    db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(hashPassword(password), target.id);

    /* Mit dem alten Passwort endet jede Anmeldung, die damit zustande kam —
       sonst liefe das Telefon eines Ausgesperrten unbehelligt weiter, und ein
       neues Passwort wäre nur eine halbe Sperre.

       Das Gerät, an dem gerade jemand sitzt, bekommt ein frisches Cookie:
       Wer sein eigenes Passwort ändert, ist in diesem Moment nachweislich er
       selbst und soll nicht mitten in der Arbeit hinausfliegen. Abgemeldet
       werden also alle anderen. */
    const epoche = endeAlleSitzungen(db, target.id);
    const selbst = target.id === req.session.accountId;
    if (selbst) setAccountSession(res, { id: target.id, session_epoch: epoche }, config);

    // Wer und wann, nie das Passwort selbst — das Logbuch ist kein Tresor dafür.
    logPasswordChanged(db, req.session.companyId, {
      accountName: target.name, accountId: target.id,
      actorName: req.session.name, actorAccountId: req.session.accountId,
      selbst,
    });
    res.json({ ok: true });
  });

  /**
   * Auskunft über alles, was zu einem Konto gespeichert ist — DSG Art. 25,
   * DSGVO Art. 15. Jede Person kommt an ihre eigenen Daten; die
   * Administration zusätzlich an die der Firma, weil sie für die Auskunft
   * gegenüber ihrer Belegschaft geradestehen muss.
   */
  router.get("/accounts/:id/data", requireCompany, (req, res) => {
    const target = ziel(req, res, "auskunft");
    if (!target) return;

    // Der Name geht nur bereinigt in die Kopfzeile — sonst liessen sich weitere einschleusen.
    res.setHeader("Content-Disposition", `attachment; filename="${dateiname(target.name)}"`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(JSON.stringify(personalData(db, target.id), null, 2));
  });

  /**
   * Kalenderabo (iCal): aktueller Stand — aus, oder die Adresse zum Kopieren.
   * Rein persönlich, deshalb ohne die sonstige Admin-Ausnahme.
   */
  router.get("/accounts/:id/calendar-token", requireCompany, (req, res) => {
    const target = ziel(req, res, "selbst");
    if (!target) return;
    const row = db.prepare("SELECT calendar_token FROM accounts WHERE id = ?").get(target.id);
    res.json({ url: row.calendar_token ? kalenderUrl(req, row.calendar_token) : null });
  });

  /**
   * Schaltet das eigene Kalenderabo ein oder erzeugt eine neue Adresse — die
   * alte wird dabei ungültig, weil sie durch den Unique-Index nicht zweimal
   * vergeben sein kann und hier überschrieben wird.
   */
  router.post("/accounts/:id/calendar-token", requireCompany, (req, res) => {
    const target = ziel(req, res, "selbst");
    if (!target) return;
    const token = crypto.randomBytes(32).toString("base64url");
    db.prepare("UPDATE accounts SET calendar_token = ? WHERE id = ?").run(token, target.id);
    res.json({ url: kalenderUrl(req, token) });
  });

  router.delete("/accounts/:id", requireCompany, (req, res) => {
    /* Ein fremdes Admin-Konto löscht niemand aus der Firma heraus — das ist die
       härteste Form des Entmachtens, und sie war bisher als einzige offen. */
    const target = ziel(req, res, "eingriff", "löscht");
    if (!target) return;

    if (target.role === "admin" && adminCount(db, req.session.companyId) <= 1) {
      return res.status(409).json({
        error: "Die letzte Administration lässt sich nicht selbst löschen. Das übernimmt die Verwaltung, die dabei eine Nachfolge bestimmt.",
      });
    }

    const isSelf = target.id === req.session.accountId;
    loescheKonto(db, req.session.companyId, target, {
      actorName: req.session.name,
      actorAccountId: req.session.accountId,
    });
    res.json({ ok: true, self: isSelf });
  });

  /* --- Einstellungen --- */

  router.patch("/settings", requireAdmin, (req, res) => {
    const day = Number(req.body?.assignmentDay);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      return res.status(400).json({ error: "Zuteilungstag muss zwischen 1 und 28 liegen." });
    }
    db.prepare("UPDATE companies SET assignment_day = ? WHERE id = ?").run(day, req.session.companyId);
    recompute(db, req.session.companyId);
    res.json({ ok: true });
  });

  return router;
}

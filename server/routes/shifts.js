/* Schichten: anlegen, einschreiben, um Hilfe bitten, übernehmen.
   Alles, was der Browser bisher nur über ausgegraute Knöpfe verhindert hat,
   wird hier verbindlich geprüft. */

import { Router } from "express";

import { HORIZON_DAYS, buildShiftsFromForm, canTakeOver, hasQualification } from "#shared/assignment.js";
import { addDays, fromISO, startOfToday, toISO } from "#shared/dates.js";
import { REPEAT_KEYS } from "#shared/labels.js";

import { requireAdmin, requireCompany } from "../auth.js";
import { recompute, releaseSeats } from "../assignment.js";
import {
  findeKonflikt, konfliktMeldung, merkeKombinierbar, raeumeFreigaben, vergissKombinierbar,
} from "../conflicts.js";
import { readAccountsForLogic, toShift } from "../db.js";
import { uid } from "../ids.js";
import { logAssigned, logHelp, logReassigned, logShiftCreated, logShiftUpdated, logUnassigned } from "../logbook.js";

/* Dieselbe Liste, die auch das Formular anbietet — zwei Aufzählungen liefen
   sonst auseinander, und eine Wiederholung ohne Beschriftung wäre für niemanden
   auswählbar. */
const REPEATS = new Set(REPEAT_KEYS);
const UMFAENGE = new Set(["einzeln", "ab-datum"]);

const istDatum = (wert) => /^\d{4}-\d{2}-\d{2}$/.test(String(wert || ""));
const istUhrzeit = (wert) => /^\d{2}:\d{2}$/.test(String(wert || ""));

function ownShift(db, req, id) {
  const row = db.prepare("SELECT * FROM shifts WHERE id = ? AND company_id = ?").get(id, req.session.companyId);
  return row ? toShift(db, row) : null;
}

export default function shiftRoutes(db) {
  const router = Router();
  router.use(requireCompany);

  router.post("/", requireAdmin, (req, res) => {
    const form = req.body || {};
    const name = String(form.name || "").trim();
    const seats = Number(form.seats);
    const repeat = String(form.repeat || "once");
    const date = String(form.date || "");
    const startTime = String(form.startTime || "");
    const endTime = String(form.endTime || "");

    if (!name || !istDatum(date)) {
      return res.status(400).json({ error: "Name und Datum sind nötig." });
    }
    /* Ohne diese Prüfung landete eine leere Zeit als "" in der Datenbank. Die
       Überschneidungsrechnung liest daraus 0:00 bis 0:00, macht daraus eine
       Schicht über volle 24 Stunden — und die kollidiert mit allem, was an dem
       Tag sonst noch läuft. */
    if (!istUhrzeit(startTime) || !istUhrzeit(endTime)) {
      return res.status(400).json({ error: "Start- und Endzeit müssen im Format HH:MM angegeben werden." });
    }
    // Wie beim Bearbeiten: rückwirkend anlegen ergibt keine Schicht, die noch jemand übernehmen könnte.
    if (date < toISO(startOfToday())) {
      return res.status(400).json({ error: "Eine Schicht lässt sich nicht in der Vergangenheit anlegen." });
    }
    if (!Number.isInteger(seats) || seats < 1) return res.status(400).json({ error: "Ungültige Platzzahl." });
    if (!REPEATS.has(repeat)) return res.status(400).json({ error: "Unbekannte Wiederholung." });

    const qual = db
      .prepare("SELECT id FROM qualifications WHERE id = ? AND company_id = ?")
      .get(String(form.qualificationId || ""), req.session.companyId);
    if (!qual) return res.status(400).json({ error: "Qualifikation nicht gefunden." });

    const shifts = buildShiftsFromForm(
      { ...form, name, date, startTime, endTime, seats, repeat, qualificationId: qual.id },
      addDays(startOfToday(), HORIZON_DAYS),
      uid
    );

    const insert = db.prepare(
      `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time,
                           repeat, seats, qualification_id, end_date, assignment_attempted, assigned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
    );
    /* Serien, mit denen sich die neue Schicht laut Administration trotz
       Überschneidung zusammen übernehmen lässt. Alles andere schliesst sich
       aus — dafür braucht es keinen Eintrag. */
    const kombinierbar = Array.isArray(form.combinableWith) ? form.combinableWith.map(String) : [];
    const bekannteSerien = new Set(
      db.prepare("SELECT DISTINCT series_id FROM shifts WHERE company_id = ?")
        .all(req.session.companyId)
        .map((r) => r.series_id)
    );

    const seriesId = shifts[0]?.seriesId;
    db.transaction(() => {
      for (const s of shifts) {
        insert.run(s.id, req.session.companyId, s.seriesId, s.name, s.date,
          s.startTime, s.endTime, s.repeat, s.seats, s.qualificationId, s.endDate);
        logShiftCreated(db, req.session.companyId, s, req.session.name, req.session.accountId);
      }
      for (const andere of kombinierbar) {
        if (bekannteSerien.has(andere)) merkeKombinierbar(db, req.session.companyId, seriesId, andere);
      }
    })();

    recompute(db, req.session.companyId);
    res.json({ created: shifts.length });
  });

  /**
   * Eine Schicht ändern.
   *
   * Jede Änderung trägt alle Ein- und Zugeteilten aus: Wer sich für eine
   * Frühschicht mit Kassenschulung eingeschrieben hat, hat nicht der
   * Nachtschicht mit Staplerschein zugestimmt. Die Schicht gilt danach als
   * frisch ausgeschrieben.
   *
   * Bei einer Serie entscheidet `umfang`, wie weit die Änderung reicht:
   *   "einzeln"  — nur dieser Termin. Er verlässt dabei die Serie, sonst
   *                schleppte die Nachfüllung die Ausnahme in alle künftigen
   *                Termine weiter.
   *   "ab-datum" — dieser und jeder spätere Termin der Serie ab `abDatum`.
   *
   * Wiederholungsrhythmus und Enddatum bleiben unangetastet — die ändert man
   * über Löschen der Serie und Neuanlegen.
   */
  router.patch("/:id", requireAdmin, (req, res) => {
    const shift = ownShift(db, req, req.params.id);
    if (!shift) return res.status(404).json({ error: "Schicht nicht gefunden." });

    const form = req.body || {};
    const name = String(form.name || "").trim();
    const seats = Number(form.seats);
    const startTime = String(form.startTime || "");
    const endTime = String(form.endTime || "");
    const umfang = shift.repeat === "once" ? "einzeln" : String(form.umfang || "einzeln");

    if (!name) return res.status(400).json({ error: "Ein Name ist nötig." });
    if (!istUhrzeit(startTime) || !istUhrzeit(endTime)) {
      return res.status(400).json({ error: "Start- und Endzeit müssen im Format HH:MM angegeben werden." });
    }
    if (!Number.isInteger(seats) || seats < 1) return res.status(400).json({ error: "Ungültige Platzzahl." });
    if (!UMFAENGE.has(umfang)) return res.status(400).json({ error: "Unbekannter Umfang." });

    const qual = db
      .prepare("SELECT id FROM qualifications WHERE id = ? AND company_id = ?")
      .get(String(form.qualificationId || ""), req.session.companyId);
    if (!qual) return res.status(400).json({ error: "Qualifikation nicht gefunden." });

    const heute = toISO(startOfToday());
    let betroffen;
    let neuesDatum = shift.date;

    if (umfang === "einzeln") {
      /* Nur beim einzelnen Termin lässt sich das Datum verschieben: Bei einer
         Serie gibt der Rhythmus die Termine vor, ein gemeinsames Datum für
         viele Schichten ergäbe keinen Sinn. */
      neuesDatum = form.date === undefined ? shift.date : String(form.date);
      if (!istDatum(neuesDatum)) return res.status(400).json({ error: "Ungültiges Datum." });
      if (neuesDatum < heute) {
        return res.status(400).json({ error: "Eine Schicht lässt sich nicht in die Vergangenheit verschieben." });
      }
      betroffen = [shift.id];
    } else {
      const abDatum = form.abDatum === undefined ? shift.date : String(form.abDatum);
      if (!istDatum(abDatum)) return res.status(400).json({ error: "Ungültiges Datum." });
      /* Vergangene Termine bleiben, wie sie waren. Sie auszutragen hiesse zu
         löschen, wer die Schicht tatsächlich geleistet hat. */
      if (abDatum < heute) {
        return res.status(400).json({ error: "Änderungen lassen sich erst ab heute anwenden." });
      }
      betroffen = db
        .prepare("SELECT id FROM shifts WHERE company_id = ? AND series_id = ? AND date >= ? ORDER BY date")
        .all(req.session.companyId, shift.seriesId, abDatum)
        .map((r) => r.id);
      if (betroffen.length === 0) {
        return res.status(400).json({ error: "Ab diesem Datum gibt es keine Schichten dieser Serie mehr." });
      }
    }

    const platzhalter = betroffen.map(() => "?").join(", ");

    /* Löst sich der Termin aus der Serie, gilt er ab jetzt als eigene Serie —
       auch für die Freigaben, die gleich geschrieben werden. */
    const loestSichHeraus = umfang === "einzeln" && shift.repeat !== "once";
    const eigeneSerie = loestSichHeraus ? uid("serie") : shift.seriesId;

    /* Wer nur eine Freigabe nachträgt, soll dafür nicht die halbe Belegschaft
       aus der Schicht werfen. Ausgetragen wird deshalb nur, wenn sich an der
       Schicht selbst etwas ändert. */
    const abweichend = db
      .prepare(
        `SELECT COUNT(*) AS n FROM shifts
          WHERE id IN (${platzhalter})
            AND NOT (name = ? AND start_time = ? AND end_time = ? AND seats = ? AND qualification_id IS ?)`
      )
      .get(...betroffen, name, startTime, endTime, seats, qual.id).n;
    const geaendert = abweichend > 0 || neuesDatum !== shift.date;

    const ausgetragen = geaendert
      ? db.prepare(`SELECT COUNT(*) AS n FROM enrollments WHERE shift_id IN (${platzhalter})`)
          .get(...betroffen).n
      : 0;

    /* Freigaben, die mit dieser Änderung gelten sollen: { serienId: true|false }.
       Anders als beim Anlegen muss sich hier auch ein "nein" ausdrücken lassen —
       eine bestehende Freigabe soll zurücknehmbar sein. */
    const freigaben = Object.entries(
      form.combinable && typeof form.combinable === "object" ? form.combinable : {}
    ).filter(([andere]) => andere && andere !== eigeneSerie);

    const bekannteSerien = new Set(
      db.prepare("SELECT DISTINCT series_id FROM shifts WHERE company_id = ?")
        .all(req.session.companyId)
        .map((r) => r.series_id)
    );

    db.transaction(() => {
      db.prepare(
        `UPDATE shifts
            SET name = ?, start_time = ?, end_time = ?, seats = ?, qualification_id = ?
          WHERE id IN (${platzhalter})`
      ).run(name, startTime, endTime, seats, qual.id, ...betroffen);

      if (umfang === "einzeln") {
        db.prepare("UPDATE shifts SET date = ? WHERE id = ?").run(neuesDatum, shift.id);
        // Der Termin verlässt die Serie, damit die Ausnahme nicht weiterwandert.
        if (loestSichHeraus) {
          db.prepare("UPDATE shifts SET series_id = ?, repeat = 'once', end_date = NULL WHERE id = ?")
            .run(eigeneSerie, shift.id);
        }
      }

      if (geaendert) {
        // Die Schicht gilt als frisch ausgeschrieben, die Auslosung steht wieder aus.
        db.prepare(
          `UPDATE shifts SET assignment_attempted = 0, assigned_at = NULL WHERE id IN (${platzhalter})`
        ).run(...betroffen);
        db.prepare(`DELETE FROM enrollments WHERE shift_id IN (${platzhalter})`).run(...betroffen);
        db.prepare(`DELETE FROM help_requests WHERE shift_id IN (${platzhalter})`).run(...betroffen);
      }

      for (const [andere, erlaubt] of freigaben) {
        if (!bekannteSerien.has(andere)) continue;
        if (erlaubt) merkeKombinierbar(db, req.session.companyId, eigeneSerie, andere);
        else vergissKombinierbar(db, req.session.companyId, eigeneSerie, andere);
      }

      /* Beim Herauslösen erbt der Termin die Freigaben seiner bisherigen Serie
         nicht: Er ist ab jetzt eine eigene. Was gelten soll, stand im Formular
         und ist oben schon geschrieben. */
    })();

    if (geaendert) {
      const updatedRows = db.prepare(`SELECT * FROM shifts WHERE id IN (${platzhalter})`).all(...betroffen);
      for (const row of updatedRows) {
        logShiftUpdated(db, req.session.companyId, toShift(db, row), req.session.name, req.session.accountId);
      }
    }

    recompute(db, req.session.companyId);
    res.json({ updated: betroffen.length, ausgetragen, geaendert });
  });

  /** Sofortige Zuteilung durch die Administration ("Jetzt zuteilen"). */
  router.post("/:id/assign", requireAdmin, (req, res) => {
    if (!ownShift(db, req, req.params.id)) return res.status(404).json({ error: "Schicht nicht gefunden." });
    recompute(db, req.session.companyId, [req.params.id]);
    res.json({ ok: true });
  });

  router.post("/:id/enroll", (req, res) => {
    const shift = ownShift(db, req, req.params.id);
    if (!shift) return res.status(404).json({ error: "Schicht nicht gefunden." });

    const me = req.session.accountId;
    if (shift.enrolled.includes(me)) {
      // Eine feste Zuteilung darf niemand still zurückgeben: sonst stünde die
      // Schicht kurzfristig unbesetzt da, ohne dass es jemand merkt.
      if (shift.assigned.includes(me)) {
        return res.status(403).json({
          error: "Diese Schicht ist dir fest zugeteilt. Nur ein Admin kann dich austragen – oder du stellst ein Hilfegesuch.",
        });
      }
      db.prepare("DELETE FROM enrollments WHERE shift_id = ? AND account_id = ?").run(shift.id, me);
      recompute(db, req.session.companyId);
      return res.json({ ok: true });
    }

    const accounts = readAccountsForLogic(db, req.session.companyId);
    if (!hasQualification(accounts, me, shift.qualificationId)) {
      return res.status(403).json({ error: "Dir fehlt die nötige Qualifikation." });
    }

    /* Zwei Schichten zur selben Zeit gehen nur, wenn die Administration sie
       ausdrücklich als zusammen übernehmbar eingetragen hat. */
    const konflikt = findeKonflikt(db, req.session.companyId, me, shift);
    if (konflikt) return res.status(409).json({ error: konfliktMeldung(shift, konflikt) });

    /* Ist die Auslosung für diese Schicht schon gelaufen und trotzdem ein Platz
       frei, bekommt ihn sofort, wer sich jetzt einschreibt. Ein zweiter
       Zuteilungstermin kommt für diese Schicht nicht mehr — warten liesse den
       Platz bis zum Schichtbeginn leer. */
    const sofortZuteilen = shift.assignmentAttempted && shift.assigned.length < shift.seats;

    db.transaction(() => {
      db.prepare("INSERT INTO enrollments (shift_id, account_id, assigned) VALUES (?, ?, ?)")
        .run(shift.id, me, sofortZuteilen ? 1 : 0);
      if (sofortZuteilen && !shift.assignedAt) {
        db.prepare("UPDATE shifts SET assigned_at = ? WHERE id = ?").run(toISO(startOfToday()), shift.id);
      }
      if (sofortZuteilen) {
        logAssigned(db, req.session.companyId, shift, req.session.name, me);
      }
    })();

    recompute(db, req.session.companyId);
    res.json({ ok: true });
  });

  /**
   * Diese Schicht und alle späteren derselben Serie löschen.
   *
   * Muss vor der Nachfüllung geschützt werden: `extendSeries` hängt an die
   * jeweils letzte Schicht einer Serie weitere an, würde die gelöschten Termine
   * also beim nächsten Lauf wieder anlegen. Ein Enddatum auf den verbleibenden
   * (vergangenen) Schichten beendet die Serie sauber.
   */
  router.delete("/:id/series", requireAdmin, (req, res) => {
    const shift = ownShift(db, req, req.params.id);
    if (!shift) return res.status(404).json({ error: "Schicht nicht gefunden." });

    const enddatum = toISO(addDays(fromISO(shift.date), -1));
    let geloescht = 0;

    db.transaction(() => {
      geloescht = db
        .prepare("DELETE FROM shifts WHERE company_id = ? AND series_id = ? AND date >= ?")
        .run(req.session.companyId, shift.seriesId, shift.date).changes;
      db.prepare("UPDATE shifts SET end_date = ? WHERE company_id = ? AND series_id = ?")
        .run(enddatum, req.session.companyId, shift.seriesId);
    })();

    // Bleibt von der Serie nichts übrig, hat auch ihre Freigabe keinen Bezug mehr.
    raeumeFreigaben(db);
    res.json({ deleted: geloescht });
  });

  /** Eine einzelne Schicht löschen. Einschreibungen und Hilfegesuche gehen mit. */
  router.delete("/:id", requireAdmin, (req, res) => {
    const shift = ownShift(db, req, req.params.id);
    if (!shift) return res.status(404).json({ error: "Schicht nicht gefunden." });
    db.prepare("DELETE FROM shifts WHERE id = ?").run(shift.id);
    raeumeFreigaben(db);
    res.json({ deleted: 1 });
  });

  /** Austragen durch die Administration — der einzige Weg aus einer festen Zuteilung. */
  router.delete("/:id/enrollments/:accountId", requireAdmin, (req, res) => {
    const shift = ownShift(db, req, req.params.id);
    if (!shift) return res.status(404).json({ error: "Schicht nicht gefunden." });

    const accountId = req.params.accountId;
    if (!shift.enrolled.includes(accountId)) {
      return res.status(404).json({ error: "Diese Person ist für die Schicht nicht eingetragen." });
    }

    const warAssigned = shift.assigned.includes(accountId);
    const betroffenePerson = db.prepare("SELECT name FROM accounts WHERE id = ?").get(accountId);

    db.transaction(() => {
      db.prepare("DELETE FROM enrollments WHERE shift_id = ? AND account_id = ?").run(shift.id, accountId);
      db.prepare("DELETE FROM help_requests WHERE shift_id = ? AND account_id = ?").run(shift.id, accountId);
      if (warAssigned && betroffenePerson) {
        logUnassigned(db, req.session.companyId, shift, betroffenePerson.name, accountId, req.session.name, req.session.accountId);
      }
    })();
    releaseSeats(db, [shift.id]);

    res.json({ ok: true });
  });

  router.post("/:id/help", (req, res) => {
    const shift = ownShift(db, req, req.params.id);
    if (!shift) return res.status(404).json({ error: "Schicht nicht gefunden." });

    const me = req.session.accountId;
    if (!shift.assigned.includes(me)) {
      return res.status(403).json({ error: "Nur zugeteilte Personen können um Hilfe bitten." });
    }

    if (shift.helpRequests.includes(me)) {
      db.prepare("DELETE FROM help_requests WHERE shift_id = ? AND account_id = ?").run(shift.id, me);
      logHelp(db, req.session.companyId, shift, req.session.name, me, false);
    } else {
      db.prepare("INSERT INTO help_requests (shift_id, account_id) VALUES (?, ?)").run(shift.id, me);
      logHelp(db, req.session.companyId, shift, req.session.name, me, true);
    }
    res.json({ ok: true });
  });

  router.post("/:id/takeover", (req, res) => {
    const shift = ownShift(db, req, req.params.id);
    if (!shift) return res.status(404).json({ error: "Schicht nicht gefunden." });

    const me = req.session.accountId;
    const replaceId = req.body?.replaceId || null;
    const accounts = readAccountsForLogic(db, req.session.companyId);

    // Prüft Qualifikation, Doppelbelegung und — anders als bisher — die Platzzahl.
    if (!canTakeOver(shift, accounts, me, replaceId)) {
      return res.status(409).json({ error: "Diese Schicht kannst du nicht übernehmen." });
    }

    const konflikt = findeKonflikt(db, req.session.companyId, me, shift);
    if (konflikt) return res.status(409).json({ error: konfliktMeldung(shift, konflikt) });

    const replacedAccount = replaceId ? db.prepare("SELECT name FROM accounts WHERE id = ?").get(replaceId) : null;

    db.transaction(() => {
      if (replaceId) {
        db.prepare("DELETE FROM enrollments WHERE shift_id = ? AND account_id = ?").run(shift.id, replaceId);
        db.prepare("DELETE FROM help_requests WHERE shift_id = ? AND account_id = ?").run(shift.id, replaceId);
      }
      db.prepare("INSERT OR REPLACE INTO enrollments (shift_id, account_id, assigned) VALUES (?, ?, 1)")
        .run(shift.id, me);
      if (!shift.assignedAt) {
        db.prepare("UPDATE shifts SET assigned_at = ? WHERE id = ?").run(toISO(startOfToday()), shift.id);
      }
      logReassigned(db, req.session.companyId, shift, req.session.name, me, replacedAccount?.name);
      if (replaceId && replacedAccount) {
        logUnassigned(db, req.session.companyId, shift, replacedAccount.name, replaceId, req.session.name, me, "durch Übernahme ersetzt");
      }
    })();

    res.json({ ok: true });
  });

  return router;
}

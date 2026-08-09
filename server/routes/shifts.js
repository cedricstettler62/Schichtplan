/* Schichten: anlegen, einschreiben, um Hilfe bitten, übernehmen.
   Alles, was der Browser bisher nur über ausgegraute Knöpfe verhindert hat,
   wird hier verbindlich geprüft. */

import { Router } from "express";

import { HORIZON_DAYS, buildShiftsFromForm, canTakeOver, hasQualification } from "#shared/assignment.js";
import { addDays, startOfToday, toISO } from "#shared/dates.js";

import { requireAdmin, requireCompany } from "../auth.js";
import { recompute } from "../assignment.js";
import { readAccountsForLogic, toShift } from "../db.js";
import { uid } from "../ids.js";

const REPEATS = new Set(["once", "daily", "weekly", "weekday", "weekend"]);

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

    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(String(form.date || ""))) {
      return res.status(400).json({ error: "Name und Datum sind nötig." });
    }
    if (!Number.isInteger(seats) || seats < 1) return res.status(400).json({ error: "Ungültige Platzzahl." });
    if (!REPEATS.has(repeat)) return res.status(400).json({ error: "Unbekannte Wiederholung." });

    const qual = db
      .prepare("SELECT id FROM qualifications WHERE id = ? AND company_id = ?")
      .get(String(form.qualificationId || ""), req.session.companyId);
    if (!qual) return res.status(400).json({ error: "Qualifikation nicht gefunden." });

    const shifts = buildShiftsFromForm(
      { ...form, name, seats, repeat, qualificationId: qual.id },
      addDays(startOfToday(), HORIZON_DAYS),
      uid
    );

    const insert = db.prepare(
      `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time,
                           repeat, seats, qualification_id, assignment_attempted, assigned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
    );
    db.transaction(() => {
      for (const s of shifts) {
        insert.run(s.id, req.session.companyId, s.seriesId, s.name, s.date,
          s.startTime, s.endTime, s.repeat, s.seats, s.qualificationId);
      }
    })();

    recompute(db, req.session.companyId);
    res.json({ created: shifts.length });
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
      db.prepare("DELETE FROM enrollments WHERE shift_id = ? AND account_id = ?").run(shift.id, me);
    } else {
      const accounts = readAccountsForLogic(db, req.session.companyId);
      if (!hasQualification(accounts, me, shift.qualificationId)) {
        return res.status(403).json({ error: "Dir fehlt die nötige Qualifikation." });
      }
      db.prepare("INSERT INTO enrollments (shift_id, account_id, assigned) VALUES (?, ?, 0)").run(shift.id, me);
    }

    recompute(db, req.session.companyId);
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
    } else {
      db.prepare("INSERT INTO help_requests (shift_id, account_id) VALUES (?, ?)").run(shift.id, me);
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
    })();

    res.json({ ok: true });
  });

  return router;
}

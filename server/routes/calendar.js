/* Der öffentliche Kalenderabo-Feed — bewusst ohne Anmeldung: Ein
   Kalenderprogramm (Google, Apple, Outlook) kann sich nicht anmelden, das
   Zeichen in der Adresse *ist* hier der Zugang. */

import { Router } from "express";

import { buildCalendar } from "../ical.js";

export default function calendarRoutes(db) {
  const router = Router();

  router.get("/kalender/:token.ics", (req, res) => {
    const account = db
      .prepare(
        `SELECT a.id, a.name AS accountName
           FROM accounts a
          WHERE a.calendar_token = ?`
      )
      .get(req.params.token);

    // Unbekanntes Zeichen wie eine unbekannte Adresse behandeln — ein 403
    // verriete sonst schon, dass es überhaupt gültige Zeichen gibt.
    if (!account) return res.status(404).type("text/plain").send("Nicht gefunden.");

    // Nur zugeteilte Schichten: Eine Einschreibung ist ein Wunsch, eine
    // Zuteilung eine Verpflichtung — nur die gehört in einen Kalender.
    const shifts = db
      .prepare(
        `SELECT s.id, s.name, s.date, s.start_time AS startTime, s.end_time AS endTime,
                (SELECT group_concat(q.name, ', ')
                   FROM shift_qualifications sq
                   JOIN qualifications q ON q.id = sq.qualification_id
                  WHERE sq.shift_id = s.id) AS qualificationName
           FROM enrollments e
           JOIN shifts s ON s.id = e.shift_id
          WHERE e.account_id = ? AND e.assigned = 1
       ORDER BY s.date, s.start_time`
      )
      .all(account.id);

    const feed = buildCalendar({
      calendarName: `Schichtboard – ${account.accountName}`,
      shifts,
    });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(feed);
  });

  return router;
}

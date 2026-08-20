/* Bündelt, wer bei welchem Ereignis eine Mail bekommt — getrennt von den
   Stellen, die das Ereignis auslösen (Registrierung, Zuteilung), und von
   mail.js, das nur weiss, wie eine Mail überhaupt verschickt wird. */

import { buildCalendar } from "./ical.js";
import { sendMail } from "./mail.js";

/** Alle Admin-Mailadressen einer Firma, die eine hinterlegt haben. */
function adminMails(db, companyId) {
  return db
    .prepare(
      `SELECT email FROM accounts
        WHERE company_id = ? AND role = 'admin' AND status = 'active' AND email IS NOT NULL AND email != ''`
    )
    .all(companyId)
    .map((r) => r.email);
}

/**
 * Neue Selbstregistrierung: alle Admins der Firma bekommen Bescheid, damit
 * eine offene Anfrage nicht erst beim nächsten Blick in die Oberfläche
 * auffällt. Ohne hinterlegte Admin-Mailadresse bleibt es beim Hinweis in der
 * Oberfläche selbst — kein Fehler, nur keine Mail.
 */
export function notifyPendingRegistration(db, config, companyId, accountName) {
  const company = db.prepare("SELECT name FROM companies WHERE id = ?").get(companyId);
  for (const to of adminMails(db, companyId)) {
    sendMail(config, {
      to,
      subject: `Neue Anmeldung wartet – ${company?.name || "Schichtboard"}`,
      text:
        `${accountName} hat sich bei Schichtboard registriert und wartet auf deine Bestätigung.\n\n` +
        "Unter „Anmeldungen“ kannst du sie annehmen oder ablehnen.",
    });
  }
}

/**
 * Ein Admin hat ein Konto angelegt: die Person bekommt den Link, mit dem sie
 * ihr eigenes erstes Passwort setzt — der Admin selbst kennt keins, siehe
 * server/passwordSetup.js. Ohne hinterlegte E-Mail entsteht kein Konto (die
 * Route verlangt sie), diese Funktion bekommt also immer eine Adresse.
 */
export function notifyAccountCreated(config, { to, name, companyName, url }) {
  sendMail(config, {
    to,
    subject: `Konto erstellt – ${companyName || "Schichtboard"}`,
    text:
      `Hallo ${name}\n\n` +
      `Für dich wurde ein Konto bei Schichtboard angelegt (${companyName}).\n\n` +
      `Richte dein Passwort über diesen Link ein, bevor du dich anmeldest:\n${url}\n\n` +
      "Der Link ist eine Woche gültig.",
  });
}

/**
 * Neue Zuteilung(en): die betroffene Person bekommt eine Mail mit den frisch
 * zugeteilten Schichten als ICS-Anhang zum Importieren.
 *
 * `neuZugeteilt` bildet Konto-ID auf die Liste der in diesem Durchlauf neu
 * zugeteilten Schicht-IDs ab (siehe assignment.js) — nicht auf alle
 * insgesamt zugeteilten. Jede Mail beschreibt also genau, was sich gerade
 * geändert hat, statt bei jeder einzelnen neuen Schicht den ganzen bisherigen
 * Plan noch einmal zu verschicken.
 */
export function notifyAssignments(db, config, companyId, neuZugeteilt) {
  if (!neuZugeteilt || neuZugeteilt.size === 0) return;
  const company = db.prepare("SELECT name FROM companies WHERE id = ?").get(companyId);

  for (const [accountId, shiftIds] of neuZugeteilt) {
    if (!shiftIds || shiftIds.length === 0) continue;
    const account = db.prepare("SELECT name, email FROM accounts WHERE id = ?").get(accountId);
    if (!account?.email) continue;

    const shifts = db
      .prepare(
        `SELECT s.id, s.name, s.date, s.start_time AS startTime, s.end_time AS endTime,
                (SELECT group_concat(q.name, ', ')
                   FROM shift_qualifications sq
                   JOIN qualifications q ON q.id = sq.qualification_id
                  WHERE sq.shift_id = s.id) AS qualificationName
           FROM shifts s WHERE s.id IN (${shiftIds.map(() => "?").join(", ")})
       ORDER BY s.date, s.start_time`
      )
      .all(...shiftIds);
    if (shifts.length === 0) continue;

    const mehrzahl = shifts.length > 1;
    const liste = shifts.map((s) => `– ${s.name}, ${s.date} ${s.startTime}–${s.endTime}`).join("\n");
    const ics = buildCalendar({ calendarName: `Schichtboard – ${account.name}`, shifts });

    sendMail(config, {
      to: account.email,
      subject: `Neue Zuteilung – ${company?.name || "Schichtboard"}`,
      text:
        `Dir wurde${mehrzahl ? "n" : ""} folgende Schicht${mehrzahl ? "en" : ""} zugeteilt:\n\n${liste}\n\n` +
        "Im Anhang findest du eine Kalenderdatei (.ics) zum Importieren.",
      attachments: [{ filename: "schichten.ics", content: ics, contentType: "text/calendar; charset=utf-8" }],
    });
  }
}

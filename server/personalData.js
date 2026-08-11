/* Auskunft nach DSG Art. 25 / DSGVO Art. 15: alles, was zu einer Person
   gespeichert ist, in einer Datei.

   Bewusst aus der Datenbank zusammengetragen statt aus dem, was die Oberfläche
   ohnehin zeigt — sonst fiele beim nächsten neuen Feld genau der Teil aus der
   Auskunft, den niemand auf dem Schirm hatte. */

/** Aus einem Namen einen brauchbaren Dateinamen machen. */
export function dateiname(name, datum = new Date()) {
  const teil =
    name
      .toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "konto";
  return `auskunft_${teil}_${datum.toISOString().slice(0, 10)}.json`;
}

/**
 * Alles zu einem Konto. Gibt null zurück, wenn es das Konto nicht gibt —
 * die Route entscheidet, ob daraus ein 404 wird.
 */
export function personalData(db, accountId) {
  const konto = db
    .prepare(
      `SELECT a.id, a.name, a.role, c.name AS firma, c.code AS firmencode
         FROM accounts a JOIN companies c ON c.id = a.company_id
        WHERE a.id = ?`
    )
    .get(accountId);
  if (!konto) return null;

  const qualifikationen = db
    .prepare(
      `SELECT q.name FROM account_qualifications aq
         JOIN qualifications q ON q.id = aq.qualification_id
        WHERE aq.account_id = ? ORDER BY q.rowid`
    )
    .all(accountId)
    .map((q) => q.name);

  const einschreibungen = db
    .prepare(
      `SELECT s.name, s.date, s.start_time, s.end_time, e.assigned
         FROM enrollments e JOIN shifts s ON s.id = e.shift_id
        WHERE e.account_id = ? ORDER BY s.date, s.start_time`
    )
    .all(accountId)
    .map((s) => ({
      schicht: s.name,
      datum: s.date,
      von: s.start_time,
      bis: s.end_time,
      zugeteilt: !!s.assigned,
    }));

  const hilfegesuche = db
    .prepare(
      `SELECT s.name, s.date FROM help_requests h JOIN shifts s ON s.id = h.shift_id
        WHERE h.account_id = ? ORDER BY s.date`
    )
    .all(accountId)
    .map((s) => ({ schicht: s.name, datum: s.date }));

  return {
    auskunftErstelltAm: new Date().toISOString(),
    konto: {
      kontonummer: konto.id,
      name: konto.name,
      rolle: konto.role === "admin" ? "Administration" : "Mitarbeitende",
      unternehmen: konto.firma,
      firmencode: konto.firmencode,
    },
    qualifikationen,
    einschreibungen,
    hilfegesuche,
    hinweise: [
      "Das Passwort ist nur als bcrypt-Hash gespeichert und lässt sich daraus nicht zurückrechnen. Es steht deshalb nicht in dieser Auskunft.",
      "Eine E-Mail-Adresse wird nicht gespeichert; das Programm verschickt keine Nachrichten.",
      "IP-Adressen von Anmeldeversuchen liegen nur flüchtig im Arbeitsspeicher und werden nicht in die Datenbank geschrieben.",
      "Schichten und die daran hängenden Einschreibungen werden drei Monate nach ihrem Datum vollständig gelöscht. Ältere Einträge stehen deshalb nicht mehr hier.",
      "Sicherungskopien der Datenbank können ältere Stände enthalten, bis sie nachrücken.",
    ],
  };
}

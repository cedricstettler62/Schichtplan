/* Erzeugt einen iCalendar-Feed (RFC 5545) von Hand — bewusst ohne eigenes
   Paket, das Format ist reiner, gut dokumentierter Text.

   Zeitzone: Die Termine stehen als schwebende Ortszeit im Feed (kein TZID,
   kein VTIMEZONE-Block). Die Datenbank speichert Schichten ohnehin nur als
   lokale Uhrzeit ohne Zone, und ein Kalenderprogramm zeigt eine schwebende
   Zeit einfach in seiner eigenen Zone an. Für einen Betrieb an einem Standort
   ist das der richtige Stand: Reist jemand mit dem Kalender in eine andere
   Zeitzone, soll dort trotzdem die Schweizer Ortszeit der Schicht stehen —
   genau das liefert schwebende Zeit ohne den zusätzlichen VTIMEZONE-Block. */

import { shiftSpan } from "#shared/overlap.js";

const CRLF = "\r\n";

function pad(n) {
  return String(n).padStart(2, "0");
}

/** \, ; , und Zeilenumbrüche maskieren (RFC 5545) — Schichtnamen und Qualifikationen kommen von Menschen. */
function escapeText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Bricht eine Zeile bei 75 Oktett (nicht Zeichen — Umlaute zählen mehrfach).
 * Die Folgezeile beginnt mit einem Leerzeichen, das selbst mitzählt.
 */
function foldLine(line) {
  const bytes = Buffer.byteLength(line, "utf8");
  if (bytes <= 75) return line + CRLF;

  let out = "";
  let chunk = "";
  let chunkBytes = 0;
  let ersteZeile = true;
  for (const zeichen of line) {
    const zeichenBytes = Buffer.byteLength(zeichen, "utf8");
    const grenze = ersteZeile ? 75 : 74; // Folgezeilen: 74 + das vorangestellte Leerzeichen = 75
    if (chunkBytes + zeichenBytes > grenze) {
      out += chunk + CRLF + " ";
      chunk = "";
      chunkBytes = 0;
      ersteZeile = false;
    }
    chunk += zeichen;
    chunkBytes += zeichenBytes;
  }
  return out + chunk + CRLF;
}

/** Minuten aus shiftSpan (UTC-verankert, siehe shared/overlap.js) zurück in
 *  einen iCalendar-Zeitstempel — dieselbe Rechnung, die auch Überschneidungen
 *  prüft, statt sie für den Kalender ein zweites Mal zu erfinden. Da der
 *  Nullpunkt in UTC verankert ist, liefern die UTC-Anteile hier genau die
 *  lokale Uhrzeit der Schicht zurück. */
function stamp(minuten) {
  const d = new Date(minuten * 60000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

function nowStamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function vevent(shift) {
  const { start, end } = shiftSpan(shift);
  const zeilen = [
    "BEGIN:VEVENT",
    // Stabil über Abrufe hinweg: Ändert sich die UID, legt der Kalender ein
    // Duplikat an statt den bestehenden Termin zu aktualisieren.
    `UID:${shift.id}@schichtboard`,
    `DTSTAMP:${nowStamp()}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(shift.name)}`,
  ];
  if (shift.qualificationName) {
    zeilen.push(`DESCRIPTION:${escapeText(`Erfordert: ${shift.qualificationName}`)}`);
  }
  zeilen.push("END:VEVENT");
  return zeilen;
}

/**
 * Der ganze Feed für ein Konto: nur zugeteilte Schichten, ein VEVENT je
 * Schicht. Kein METHOD:CANCEL nötig — der Kalender holt jedes Mal die ganze
 * Datei, was nicht mehr drinsteht, verschwindet von selbst.
 */
export function buildCalendar({ calendarName, shifts }) {
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Schichtboard//Kalenderabo//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ...shifts.flatMap(vevent),
    "END:VCALENDAR",
  ];
  return zeilen.map(foldLine).join("");
}

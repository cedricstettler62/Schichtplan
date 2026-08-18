/* Zeitliche Überschneidung zweier Schichten.

   Bewusst frei von React und Datenbank: Das Formular zeigt damit schon beim
   Anlegen, womit sich eine neue Schicht überschneidet, und der Server benutzt
   dieselbe Rechnung, wenn sich jemand einschreiben will. Zwei Auslegungen von
   "überschneidet sich" wären ein Fehler mit Ansage. */

const TAG = 24 * 60;

function minutenAusUhrzeit(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Die Schicht als Spanne in Minuten seit einem festen Nullpunkt.
 *
 * Endet eine Schicht früher, als sie beginnt, läuft sie über Mitternacht und
 * endet am Folgetag — sonst käme für eine Nachtschicht eine negative Dauer
 * heraus und sie überschnitte sich mit nichts.
 */
export function shiftSpan(shift) {
  /* Der Nullpunkt wird in UTC gerechnet: In der Nacht der Zeitumstellung hat
     ein lokaler Tag 23 oder 25 Stunden, und eine Nachtschicht käme dadurch
     eine Stunde verschoben heraus. */
  const [jahr, monat, tag] = shift.date.split("-").map(Number);
  const tagNull = Date.UTC(jahr, monat - 1, tag) / 60000;
  const start = tagNull + minutenAusUhrzeit(shift.startTime);
  const ende = tagNull + minutenAusUhrzeit(shift.endTime);
  return { start, end: ende <= start ? ende + TAG : ende };
}

/** Berühren sich zwei Schichten zeitlich? Ein gemeinsamer Endpunkt zählt nicht. */
export function shiftsOverlap(a, b) {
  const x = shiftSpan(a);
  const y = shiftSpan(b);
  return x.start < y.end && y.start < x.end;
}

/**
 * Alle `bestehende`, die sich mit mindestens einer aus `neue` überschneiden —
 * nach Serie gruppiert, weil eine Serie für die Rückfrage eine Einheit ist:
 * Niemand entscheidet zwanzig Mal dasselbe für zwanzig Termine.
 *
 * Zurück kommt je Serie ein Eintrag mit dem Namen, der Zahl betroffener
 * Termine und dem ersten davon.
 */
export function overlappingSeries(neue, bestehende) {
  const treffer = new Map();

  for (const alt of bestehende) {
    if (!neue.some((n) => n.id !== alt.id && shiftsOverlap(n, alt))) continue;

    const eintrag = treffer.get(alt.seriesId);
    if (eintrag) {
      eintrag.termine += 1;
      if (alt.date < eintrag.erster) eintrag.erster = alt.date;
    } else {
      treffer.set(alt.seriesId, {
        seriesId: alt.seriesId,
        name: alt.name,
        startTime: alt.startTime,
        endTime: alt.endTime,
        termine: 1,
        erster: alt.date,
      });
    }
  }

  return [...treffer.values()].sort((a, b) => a.erster.localeCompare(b.erster));
}

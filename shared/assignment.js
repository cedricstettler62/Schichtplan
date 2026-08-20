/* Zuteilungs- und Serienlogik.
   Bewusst frei von React und Datenbank, damit Frontend, Server und Tests
   dieselben Funktionen benutzen. */

import { toISO, fromISO, addDays, monthDiff } from "./dates.js";

/** Wie weit im Voraus Serien überhaupt erzeugt werden. */
export const HORIZON_DAYS = 92;

/**
 * Bringt dieses Konto mit, was die Schicht verlangt?
 *
 * Verlangt heisst verlangt: Stehen zwei Qualifikationen an der Schicht,
 * braucht es beide. Eine Schicht ohne jede Anforderung kann niemand
 * übernehmen — sonst wäre „erforderlich“ eine Empfehlung.
 */
export function hasQualifications(accounts, userId, qualIds) {
  const acc = accounts.find((a) => a.id === userId);
  const noetig = qualIds || [];
  return !!acc && noetig.length > 0 && noetig.every((q) => acc.qualifications.includes(q));
}

function shuffle(arr, random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Schichten des laufenden Monats sind immer zuteilbar; die des Folgemonats
 * erst ab dem eingestellten Zuteilungstag. Alles danach noch nicht.
 */
export function isAssignable(shiftDateISO, today, assignmentDay) {
  const diff = monthDiff(today, fromISO(shiftDateISO));
  if (diff <= 0) return true;
  if (diff === 1 && today.getDate() >= assignmentDay) return true;
  return false;
}

/**
 * Wann für diese Schicht ausgelost wird: am Zuteilungstag des Vormonats.
 * Kürzere Monate kappen den Tag, damit der 30. im Februar nicht in den März rutscht.
 */
export function assignmentDateOf(shiftDateISO, assignmentDay) {
  const d = fromISO(shiftDateISO);
  const vormonat = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const letzter = new Date(vormonat.getFullYear(), vormonat.getMonth() + 1, 0).getDate();
  vormonat.setDate(Math.min(assignmentDay, letzter));
  return toISO(vormonat);
}

/**
 * `blockiert(accountId)` sagt, wer für diese Schicht nicht in Frage kommt, weil
 * er zur selben Zeit schon einer anderen zugeteilt ist. Ohne die Angabe wird
 * nur nach Qualifikation ausgewählt — so verhielt sich die Auslosung früher.
 */
export function attemptAssign(shift, accounts, today, assignmentDay, force = false, random = Math.random, blockiert = null) {
  // Die Auslosung findet genau einmal statt: am Zuteilungstermin der Schicht.
  // Danach besetzt niemand mehr automatisch nach — freie Plätze bekommt, wer
  // sich einschreibt oder übernimmt. Sonst würde die Zuteilung faktisch bei
  // jedem Lauf des Zeitplans neu stattfinden.
  if (shift.assignmentAttempted && !force) return shift;
  const assignableNow = force || isAssignable(shift.date, today, assignmentDay);
  if (!assignableNow) return shift;
  if (shift.assigned.length >= shift.seats) {
    return { ...shift, assignmentAttempted: true };
  }
  const eligible = shuffle(
    shift.enrolled.filter(
      (id) =>
        !shift.assigned.includes(id) &&
        hasQualifications(accounts, id, shift.qualificationIds) &&
        !(blockiert && blockiert(id))
    ),
    random
  );
  const needed = shift.seats - shift.assigned.length;
  const chosen = eligible.slice(0, needed);
  if (chosen.length === 0) {
    return { ...shift, assignmentAttempted: true };
  }
  return {
    ...shift,
    assigned: [...shift.assigned, ...chosen],
    assignmentAttempted: true,
    assignedAt: shift.assignedAt || toISO(today),
  };
}

/**
 * Ein Durchgang über alle Schichten.
 *
 * `schliesstAus(a, b)` sagt, ob sich zwei Schichten gegenseitig ausschliessen.
 * Ist die Angabe da, läuft der Durchgang der Reihe nach statt nebeneinander:
 * Wer eben einer Schicht zugeteilt wurde, darf für eine überschneidende in
 * derselben Runde nicht mehr in Frage kommen. Ohne die Angabe bleibt es beim
 * bisherigen Verhalten.
 */
export function runAssignmentPass(
  shifts, accounts, today, assignmentDay, forceIds = [], random = Math.random, schliesstAus = null
) {
  if (!schliesstAus) {
    return shifts.map((s) => attemptAssign(s, accounts, today, assignmentDay, forceIds.includes(s.id), random));
  }

  const stand = [...shifts];
  for (let i = 0; i < stand.length; i++) {
    const diese = stand[i];
    /* Geprüft wird gegen den laufenden Stand: die schon bearbeiteten Schichten
       mit ihren frischen Zuteilungen, die übrigen so, wie sie hereinkamen. */
    const blockiert = (accountId) =>
      stand.some((andere, j) => j !== i && andere.assigned.includes(accountId) && schliesstAus(diese, andere));

    stand[i] = attemptAssign(diese, accounts, today, assignmentDay, forceIds.includes(diese.id), random, blockiert);
  }
  return stand;
}

function repeatStep(repeat) { return repeat === "weekly" ? 7 : 1; }

function keepDate(repeat, d) {
  const wd = d.getDay();
  if (repeat === "weekday") return wd >= 1 && wd <= 5;
  if (repeat === "weekend") return wd === 0 || wd === 6;
  return true;
}

/**
 * Termine einer Schichtserie. Reine Datumsrechnung — wer daraus Datensätze
 * baut (Frontend-State oder DB-Zeilen), entscheidet der Aufrufer.
 */
export function expandShiftDates(form, horizonDate) {
  const start = fromISO(form.date);
  const limit = form.endDate ? fromISO(form.endDate) : horizonDate;
  const capped = limit < horizonDate ? limit : horizonDate;

  if (form.repeat === "once") {
    return start <= capped ? [toISO(start)] : [];
  }

  const step = repeatStep(form.repeat);
  const out = [];
  let d = new Date(start);
  while (d <= capped) {
    if (keepDate(form.repeat, d)) out.push(toISO(d));
    d = addDays(d, step);
  }
  return out;
}

/**
 * Weitere Termine einer bereits bestehenden Serie, ab dem letzten schon
 * erzeugten Datum bis zum neuen Horizont — damit Serien nicht nach
 * HORIZON_DAYS stillschweigend auslaufen, sondern laufend nachgefüllt werden.
 *
 * `notBefore` verhindert Termine in der Vergangenheit: Lag die Serie länger
 * still (Server aus, alte Sicherung eingespielt), würde sonst die ganze
 * Lücke nachträglich als Schichten angelegt. Der Takt bleibt trotzdem am
 * ursprünglichen Termin ausgerichtet, weil weiterhin von dort gezählt wird.
 */
export function extendSeriesDates(repeat, lastDateISO, endDateISO, horizonDate, notBefore = null) {
  if (repeat === "once") return [];
  const limit = endDateISO ? fromISO(endDateISO) : horizonDate;
  const capped = limit < horizonDate ? limit : horizonDate;
  const step = repeatStep(repeat);

  const out = [];
  let d = addDays(fromISO(lastDateISO), step);
  while (d <= capped) {
    if (keepDate(repeat, d) && (!notBefore || d >= notBefore)) out.push(toISO(d));
    d = addDays(d, step);
  }
  return out;
}

/** Vollständige Schicht-Datensätze aus einem Formular. */
export function buildShiftsFromForm(form, horizonDate, makeId) {
  const seriesId = makeId("serie");
  return expandShiftDates(form, horizonDate).map((date) => ({
    id: makeId("s"),
    seriesId,
    name: form.name,
    date,
    startTime: form.startTime,
    endTime: form.endTime,
    repeat: form.repeat,
    seats: form.seats,
    qualificationIds: form.qualificationIds,
    endDate: form.endDate || null,
    enrolled: [],
    assigned: [],
    helpRequests: [],
    assignmentAttempted: false,
    assignedAt: null,
  }));
}

/** Kann `helperId` diese Schicht übernehmen? Ersetzt ggf. `replaceId`. */
export function canTakeOver(shift, accounts, helperId, replaceId) {
  if (!hasQualifications(accounts, helperId, shift.qualificationIds)) return false;
  if (shift.assigned.includes(helperId)) return false;
  if (replaceId) return shift.assigned.includes(replaceId);
  return shift.assigned.length < shift.seats;
}

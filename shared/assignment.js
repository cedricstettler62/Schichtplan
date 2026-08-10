/* Zuteilungs- und Serienlogik.
   Bewusst frei von React und Datenbank, damit Frontend, Server und Tests
   dieselben Funktionen benutzen. */

import { toISO, fromISO, addDays, monthDiff } from "./dates.js";

/** Wie weit im Voraus Serien überhaupt erzeugt werden. */
export const HORIZON_DAYS = 92;

export function hasQualification(accounts, userId, qualId) {
  const acc = accounts.find((a) => a.id === userId);
  return !!acc && !!qualId && acc.qualifications.includes(qualId);
}

export function shuffle(arr, random = Math.random) {
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

export function attemptAssign(shift, accounts, today, assignmentDay, force = false, random = Math.random) {
  const assignableNow = force || isAssignable(shift.date, today, assignmentDay);
  if (!assignableNow) return shift;
  if (shift.assigned.length >= shift.seats) {
    return shift.assignmentAttempted ? shift : { ...shift, assignmentAttempted: true };
  }
  const eligible = shuffle(
    shift.enrolled.filter(
      (id) => !shift.assigned.includes(id) && hasQualification(accounts, id, shift.qualificationId)
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

export function runAssignmentPass(shifts, accounts, today, assignmentDay, forceIds = [], random = Math.random) {
  return shifts.map((s) => attemptAssign(s, accounts, today, assignmentDay, forceIds.includes(s.id), random));
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
 */
export function extendSeriesDates(repeat, lastDateISO, endDateISO, horizonDate) {
  if (repeat === "once") return [];
  const limit = endDateISO ? fromISO(endDateISO) : horizonDate;
  const capped = limit < horizonDate ? limit : horizonDate;
  const step = repeatStep(repeat);

  const out = [];
  let d = addDays(fromISO(lastDateISO), step);
  while (d <= capped) {
    if (keepDate(repeat, d)) out.push(toISO(d));
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
    qualificationId: form.qualificationId,
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
  if (!hasQualification(accounts, helperId, shift.qualificationId)) return false;
  if (shift.assigned.includes(helperId)) return false;
  if (replaceId) return shift.assigned.includes(replaceId);
  return shift.assigned.length < shift.seats;
}

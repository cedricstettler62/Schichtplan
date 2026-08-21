/* Zuteilungs- und Serienlogik.
   Bewusst frei von React und Datenbank, damit Frontend, Server und Tests
   dieselben Funktionen benutzen. */

import { toISO, fromISO, addDays, monthDiff } from "./dates.js";
import { shiftSpan } from "./overlap.js";

/** Wie weit im Voraus Serien überhaupt erzeugt werden. */
export const HORIZON_DAYS = 92;

/** Default für die Fairness-Schwelle (siehe weightedPick), sofern die Firma keine eigene eingestellt hat. */
export const DEFAULT_FAIRNESS_THRESHOLD_SHIFTS = 3;

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

/**
 * Der Zeitraum, über den die Fairness-Gewichtung die bisherige Belastung
 * misst — bezogen auf das Datum der Schicht, um die gerade ausgelost wird,
 * nicht auf heute: Wessen Auslosung erst im Folgemonat läuft, soll an der
 * Belastung *jenes* Monats gemessen werden.
 */
export function fairnessWindowRange(shiftDateISO, windowType) {
  const d = fromISO(shiftDateISO);
  if (windowType === "4weeks") {
    return { startISO: toISO(addDays(d, -27)), endISO: shiftDateISO };
  }
  const anfang = new Date(d.getFullYear(), d.getMonth(), 1);
  const ende = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { startISO: toISO(anfang), endISO: toISO(ende) };
}

/** Dauer einer Schicht in Stunden — dieselbe Über-Mitternacht-Rechnung wie shiftsOverlap(). */
export function shiftDurationHours(shift) {
  const { start, end } = shiftSpan(shift);
  return (end - start) / 60;
}

/**
 * Bisherige Arbeitsbelastung je Konto: Summe der Stunden aus Schichten, die im
 * Zeitfenster liegen und wo das Konto tatsächlich zugeteilt ist (nicht nur
 * eingeschrieben) — nur was jemand schon leistet, soll den Ausgleich treiben.
 */
export function hoursByEmployeeInWindow(shifts, startISO, endISO) {
  const stunden = {};
  for (const s of shifts) {
    if (s.date < startISO || s.date > endISO || s.assigned.length === 0) continue;
    const dauer = shiftDurationHours(s);
    for (const id of s.assigned) stunden[id] = (stunden[id] || 0) + dauer;
  }
  return stunden;
}

/**
 * Zieht gewichtet eine Person aus `candidates`: Wer laut `hoursByEmployee`
 * bereits mehr Stunden im Zeitfenster hat, kommt seltener dran — aber nie mit
 * Sicherheit leer aus. Ein starres Ranking (immer die am wenigsten belastete
 * Person) wäre keine Auslosung mehr, nur noch eine Warteliste nach Stunden.
 *
 * `thresholdHours` ist die Stundendifferenz, ab der sich die Chancen spürbar
 * verschieben: Bei Gleichstand sind die Chancen für alle gleich gross, bei
 * einem Unterschied von genau `thresholdHours` nur noch halb so gross wie für
 * die am wenigsten belastete Person, danach nimmt sie mit wachsendem
 * Unterschied immer weiter (aber nie auf null) ab.
 */
export function weightedPick(candidates, hoursByEmployee = {}, { thresholdHours = Infinity, random = Math.random } = {}) {
  if (candidates.length === 0) return undefined;
  const schwelle = thresholdHours > 0 ? thresholdHours : Number.EPSILON;
  const stunden = candidates.map((id) => hoursByEmployee[id] || 0);
  const minimum = Math.min(...stunden);
  const gewichte = stunden.map((h) => 1 / (1 + Math.max(0, h - minimum) / schwelle));
  const summe = gewichte.reduce((a, b) => a + b, 0);
  const zug = random() * summe;
  let stand = 0;
  for (let i = 0; i < candidates.length; i++) {
    stand += gewichte[i];
    if (zug < stand) return candidates[i];
  }
  return candidates[candidates.length - 1]; // Rundungsrest landet bei der letzten Person
}

/** `weightedPick()` mehrfach ohne Zurücklegen — für Schichten mit mehreren Plätzen. */
function weightedSample(candidates, hoursByEmployee, count, options) {
  const rest = [...candidates];
  const gezogen = [];
  while (gezogen.length < count && rest.length > 0) {
    const wahl = weightedPick(rest, hoursByEmployee, options);
    gezogen.push(wahl);
    rest.splice(rest.indexOf(wahl), 1);
  }
  return gezogen;
}

/**
 * „Am letzten Tag des Monats“ steht als Tag 31 in den Einstellungen: Ein
 * Zuteilungstag hinter dem Monatsende fällt immer auf dessen letzten Tag
 * (siehe effectiveAssignmentDay), und 31 liegt in keinem Monat davor. Ein
 * eigenes Kennzeichen neben dem Tag gäbe eine zweite Wahrheit über denselben
 * Termin — hier bleibt es bei einer Zahl.
 */
export const LAST_DAY_OF_MONTH = 31;

/**
 * Der eingestellte Zuteilungstag, wie er in *diesem* Monat tatsächlich fällt.
 * Kürzere Monate kappen ihn, damit der 31. im Februar nicht in den März rutscht
 * — und damit ein Tag hinterm Monatsende überhaupt je erreicht wird.
 */
export function effectiveAssignmentDay(assignmentDay, date) {
  const letzter = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.min(assignmentDay, letzter);
}

/**
 * Schichten des laufenden Monats sind immer zuteilbar; die des Folgemonats
 * erst ab dem eingestellten Zuteilungstag. Alles danach noch nicht.
 */
export function isAssignable(shiftDateISO, today, assignmentDay) {
  const diff = monthDiff(today, fromISO(shiftDateISO));
  if (diff <= 0) return true;
  if (diff === 1 && today.getDate() >= effectiveAssignmentDay(assignmentDay, today)) return true;
  return false;
}

/** Wann für diese Schicht ausgelost wird: am Zuteilungstag des Vormonats. */
export function assignmentDateOf(shiftDateISO, assignmentDay) {
  const d = fromISO(shiftDateISO);
  const vormonat = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  vormonat.setDate(effectiveAssignmentDay(assignmentDay, vormonat));
  return toISO(vormonat);
}

/**
 * `blockiert(accountId)` sagt, wer für diese Schicht nicht in Frage kommt, weil
 * er zur selben Zeit schon einer anderen zugeteilt ist. Ohne die Angabe wird
 * nur nach Qualifikation ausgewählt — so verhielt sich die Auslosung früher.
 */
export function attemptAssign(
  shift, accounts, today, assignmentDay, force = false, random = Math.random, blockiert = null, fairness = null
) {
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
  const eligible = shift.enrolled.filter(
    (id) =>
      !shift.assigned.includes(id) &&
      hasQualifications(accounts, id, shift.qualificationIds) &&
      !(blockiert && blockiert(id))
  );
  const needed = shift.seats - shift.assigned.length;
  // Wer bisher weniger Stunden im Zeitfenster hatte, kommt öfter dran — siehe
  // weightedPick(). Ohne `fairness` (etwa in einem Aufruf ohne Angabe) bleiben
  // die Chancen gleich gross, wie vor der Gewichtung.
  const chosen = weightedSample(eligible, fairness?.hoursByEmployee || {}, needed, {
    thresholdHours: fairness?.thresholdHours ?? Infinity,
    random,
  });
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
  shifts, accounts, today, assignmentDay, forceIds = [], random = Math.random, schliesstAus = null,
  fairnessConfig = null
) {
  const windowType = fairnessConfig?.windowType || "month";
  const thresholdShifts = fairnessConfig?.thresholdShifts ?? DEFAULT_FAIRNESS_THRESHOLD_SHIFTS;

  /* Belastung und Schwelle werden je Schicht neu berechnet, gegen den
     laufenden Bestand `pool` — so zählen auch Zuteilungen mit, die in diesem
     selben Durchgang schon gefallen sind. Sonst könnte dieselbe Person an
     einem Auslosungstag mehrere verschiedene Schichten gewinnen, ohne dass
     die Gewichtung das noch merkt. */
  const fairnessFor = (shift, pool) => {
    const { startISO, endISO } = fairnessWindowRange(shift.date, windowType);
    return {
      hoursByEmployee: hoursByEmployeeInWindow(pool, startISO, endISO),
      thresholdHours: thresholdShifts * shiftDurationHours(shift),
    };
  };

  if (!schliesstAus) {
    return shifts.map((s) =>
      attemptAssign(s, accounts, today, assignmentDay, forceIds.includes(s.id), random, null, fairnessFor(s, shifts))
    );
  }

  const stand = [...shifts];
  for (let i = 0; i < stand.length; i++) {
    const diese = stand[i];
    /* Geprüft wird gegen den laufenden Stand: die schon bearbeiteten Schichten
       mit ihren frischen Zuteilungen, die übrigen so, wie sie hereinkamen. */
    const blockiert = (accountId) =>
      stand.some((andere, j) => j !== i && andere.assigned.includes(accountId) && schliesstAus(diese, andere));

    stand[i] = attemptAssign(
      diese, accounts, today, assignmentDay, forceIds.includes(diese.id), random, blockiert, fairnessFor(diese, stand)
    );
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

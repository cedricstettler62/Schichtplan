/* Die eine Liste der Wiederholungen: Beschriftung fürs Formular, Schlüsselmenge
   für die Prüfung im Server. */
export const REPEAT_LABELS = {
  once: "Einmalig",
  daily: "Täglich",
  weekly: "Wöchentlich",
  weekday: "Jeden Arbeitstag",
  weekend: "Am Wochenende",
};

export const REPEAT_KEYS = Object.keys(REPEAT_LABELS);

/** Zeitfenster, über das die Fairness-Gewichtung die bisherige Belastung misst. */
export const FAIRNESS_WINDOW_LABELS = {
  month: "Aktueller Monat der Schicht",
  "4weeks": "Letzte 4 Wochen",
};

export const FAIRNESS_WINDOW_KEYS = Object.keys(FAIRNESS_WINDOW_LABELS);

/**
 * Die Namen zu einer Liste von Qualifikations-IDs, in der Reihenfolge der
 * Firmenliste. Unbekannte IDs fallen weg — eine gelöschte Qualifikation soll
 * keine leere Stelle im Text hinterlassen.
 */
export function qualifikationsNamen(qualifications, ids) {
  return (ids || [])
    .map((id) => qualifications.find((q) => q.id === id)?.name)
    .filter(Boolean);
}

/** Dieselben Namen als fertiger Text — oder null, wenn keine übrig bleiben. */
export function qualifikationsListe(qualifications, ids) {
  const namen = qualifikationsNamen(qualifications, ids);
  return namen.length ? namen.join(", ") : null;
}

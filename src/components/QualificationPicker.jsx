import { useState } from "react";
import Chip from "./Chip.jsx";

/**
 * Welche Qualifikationen eine Schicht verlangt. Mehrere sind möglich, und
 * verlangt heisst verlangt: Wer die Schicht übernimmt, braucht jede der hier
 * ausgewählten — nicht irgendeine davon.
 *
 * Chips statt einer Mehrfachauswahl: <select multiple> ist auf dem Telefon
 * kaum zu bedienen, und die Filterleisten der App zeigen Qualifikationen
 * ohnehin schon als Chips.
 *
 * `onAddQualification` ist freiwillig. Wo es mitkommt (beim Anlegen einer
 * Schicht), lässt sich eine fehlende Qualifikation gleich hier anlegen, statt
 * das halb ausgefüllte Formular dafür zu verlassen.
 */
export default function QualificationPicker({ qualifications, gewaehlt, onChange, onAddQualification }) {
  const [offen, setOffen] = useState(false);
  const [neu, setNeu] = useState("");

  const umschalten = (id) =>
    onChange(gewaehlt.includes(id) ? gewaehlt.filter((x) => x !== id) : [...gewaehlt, id]);

  /* Gibt es die Qualifikation schon (nur anders geschrieben), wird sie bloss
     ausgewählt — sonst stünde sie zweimal in der Liste. */
  const anlegen = async () => {
    const name = neu.trim();
    if (!name) return;
    const vorhanden = qualifications.find((q) => q.name.toLowerCase() === name.toLowerCase());
    const id = vorhanden ? vorhanden.id : await onAddQualification(name);
    if (id && !gewaehlt.includes(id)) onChange([...gewaehlt, id]);
    setNeu("");
    setOffen(false);
  };

  return (
    <div className="sb-field-wrap">
      <div className="sb-field">
        <span>Erforderliche Qualifikationen</span>
        {qualifications.length === 0 ? (
          <p className="sb-empty">Noch keine Qualifikation angelegt.</p>
        ) : (
          <div className="sb-chip-row" role="group" aria-label="Erforderliche Qualifikationen">
            {qualifications.map((q) => (
              <Chip key={q.id} active={gewaehlt.includes(q.id)} onClick={() => umschalten(q.id)}>
                {q.name}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <span className="sb-field-hint">
        Mehrere sind möglich. Übernehmen kann die Schicht nur, wer alle ausgewählten mitbringt.
      </span>

      {onAddQualification &&
        (offen ? (
          <div className="sb-inline-add">
            <input
              autoFocus
              value={neu}
              onChange={(e) => setNeu(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && anlegen()}
              placeholder="Name der neuen Qualifikation"
              aria-label="Name der neuen Qualifikation"
            />
            <button type="button" className="sb-btn sb-btn-ink" onClick={anlegen}>Hinzufügen</button>
            <button type="button" className="sb-btn sb-btn-quiet" onClick={() => { setOffen(false); setNeu(""); }}>
              Abbrechen
            </button>
          </div>
        ) : (
          <div className="sb-form-actions">
            <button type="button" className="sb-btn sb-btn-quiet" onClick={() => setOffen(true)}>
              Qualifikation anlegen
            </button>
          </div>
        ))}
    </div>
  );
}

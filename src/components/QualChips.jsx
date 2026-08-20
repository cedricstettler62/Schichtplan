import Chip from "./Chip.jsx";

/**
 * Eine Reihe an- und abwählbarer Qualifikationen: dieselbe Geste filtert die
 * Schichtlisten und wählt aus, was eine neue Schicht verlangt.
 *
 * `label` macht daraus eine benannte Gruppe — nur dort setzen, wo die Auswahl
 * selbst die Frage ist; über einer Filterleiste wäre der Name leer.
 */
export default function QualChips({ qualifications, gewaehlt, onChange, label }) {
  const umschalten = (id) =>
    onChange(gewaehlt.includes(id) ? gewaehlt.filter((x) => x !== id) : [...gewaehlt, id]);

  return (
    <div className="sb-chip-row" role={label ? "group" : undefined} aria-label={label}>
      {qualifications.map((q) => (
        <Chip key={q.id} active={gewaehlt.includes(q.id)} onClick={() => umschalten(q.id)}>
          {q.name}
        </Chip>
      ))}
    </div>
  );
}

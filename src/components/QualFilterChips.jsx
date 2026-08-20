import Chip from "./Chip.jsx";

/**
 * Filterleiste über die Qualifikationen — dieselbe in der Admin- und in der
 * Mitarbeitendenansicht. Der Zustand bleibt beim Tab, der damit filtert;
 * hier steht nur, wie eine Auswahl umschaltet.
 */
export default function QualFilterChips({ qualifications, gewaehlt, setGewaehlt }) {
  const umschalten = (id) =>
    setGewaehlt((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  return (
    <div className="sb-chip-row">
      {qualifications.map((q) => (
        <Chip key={q.id} active={gewaehlt.includes(q.id)} onClick={() => umschalten(q.id)}>
          {q.name}
        </Chip>
      ))}
    </div>
  );
}

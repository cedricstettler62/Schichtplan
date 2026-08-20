/** Die ganze Zeile schaltet um, nicht nur der Schieber rechts. */
export default function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className="sb-toggle-row"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span>{label}</span>
      <span className={`sb-toggle ${checked ? "sb-toggle-on" : ""}`}>
        <span className="sb-toggle-knob" />
      </span>
    </button>
  );
}

/** Die Qualifikationen eines Kontos an- und abschalten — für ein fremdes Konto
    (Mitarbeitende) wie für das eigene (Einstellungen). */
export function QualToggles({ qualifications, gewaehlt, onSet, leerText }) {
  if (qualifications.length === 0) return <p className="sb-empty">{leerText}</p>;
  return (
    <div className="sb-toggle-list">
      {qualifications.map((q) => (
        <Toggle key={q.id} label={q.name} checked={gewaehlt.includes(q.id)} onChange={(wert) => onSet(q.id, wert)} />
      ))}
    </div>
  );
}

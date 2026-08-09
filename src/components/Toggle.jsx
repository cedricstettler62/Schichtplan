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

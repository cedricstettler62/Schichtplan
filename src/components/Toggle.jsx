export default function Toggle({ checked, onChange, label }) {
  return (
    <label className="sb-toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className={`sb-toggle ${checked ? "sb-toggle-on" : ""}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span className="sb-toggle-knob" />
      </button>
    </label>
  );
}

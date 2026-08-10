export default function Chip({ active, onClick, children }) {
  return (
    <button type="button" className={`sb-chip ${active ? "sb-chip-active" : ""}`} onClick={onClick} aria-pressed={!!active}>
      {children}
    </button>
  );
}

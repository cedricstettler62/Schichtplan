export default function Chip({ active, onClick, children }) {
  return (
    <button type="button" className={`sb-chip ${active ? "sb-chip-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

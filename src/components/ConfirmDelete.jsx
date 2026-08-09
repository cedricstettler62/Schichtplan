import { useState } from "react";

/**
 * Löschen-Aktion, die erst nach einer Rückfrage auslöst.
 * `variant="button"` für eigenständige Aktionen, `"icon"` für das kleine ×
 * an einem Chip, wo kein Platz für Text ist.
 */
export default function ConfirmDelete({ onConfirm, label = "Löschen", question, variant = "icon" }) {
  const [asking, setAsking] = useState(false);

  if (asking) {
    // Kleine Knöpfe, damit die Rückfrage auch in einer Chip-Reihe Platz hat.
    return (
      <span className="sb-confirm">
        <span>{question || "Wirklich löschen?"}</span>
        <button type="button" className="sb-btn sb-btn-sm sb-btn-rust" onClick={() => { onConfirm(); setAsking(false); }}>
          Ja, löschen
        </button>
        <button type="button" className="sb-btn sb-btn-sm sb-btn-quiet" onClick={() => setAsking(false)}>
          Abbrechen
        </button>
      </span>
    );
  }
  if (variant === "button") {
    return <button type="button" className="sb-btn sb-btn-rust" onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <button type="button" className="sb-icon-btn" title={label} aria-label={label} onClick={() => setAsking(true)}>
      ×
    </button>
  );
}

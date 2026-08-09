import { useState } from "react";

/** Löschen-Aktion, die erst nach einer Rückfrage auslöst. */
export default function ConfirmDelete({ onConfirm, label = "Löschen", variant = "icon" }) {
  const [asking, setAsking] = useState(false);

  if (asking) {
    return (
      <span className="sb-confirm">
        <span>Sicher?</span>
        <button type="button" className="sb-link-btn sb-link-rust" onClick={() => { onConfirm(); setAsking(false); }}>Ja</button>
        <button type="button" className="sb-link-btn" onClick={() => setAsking(false)}>Nein</button>
      </span>
    );
  }
  if (variant === "button") {
    return <button type="button" className="sb-btn sb-btn-rust" onClick={() => setAsking(true)}>{label}</button>;
  }
  return <button type="button" className="sb-icon-btn" title={label} onClick={() => setAsking(true)}>×</button>;
}

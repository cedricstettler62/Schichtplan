import { useState } from "react";

export default function DeleteAccountButton({ onConfirm, label = "Konto löschen", question = "Konto wirklich löschen? Das lässt sich nicht rückgängig machen." }) {
  const [asking, setAsking] = useState(false);

  if (asking) {
    return (
      <span className="sb-confirm">
        <span>{question}</span>
        <button type="button" className="sb-btn sb-btn-rust sb-btn-sm" onClick={() => { onConfirm(); setAsking(false); }}>Ja, löschen</button>
        <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setAsking(false)}>Abbrechen</button>
      </span>
    );
  }
  return <button type="button" className="sb-btn sb-btn-rust" onClick={() => setAsking(true)}>{label}</button>;
}

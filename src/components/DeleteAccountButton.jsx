import { useState } from "react";

export default function DeleteAccountButton({ onConfirm }) {
  const [asking, setAsking] = useState(false);

  if (asking) {
    return (
      <span className="sb-confirm">
        <span>Konto wirklich löschen?</span>
        <button type="button" className="sb-btn sb-btn-rust" onClick={() => { onConfirm(); setAsking(false); }}>Ja, löschen</button>
        <button type="button" className="sb-link-btn" onClick={() => setAsking(false)}>Abbrechen</button>
      </span>
    );
  }
  return <button type="button" className="sb-btn sb-btn-rust" onClick={() => setAsking(true)}>Konto löschen</button>;
}

import { useState } from "react";
import { downloadPersonalData } from "../api.js";

/**
 * Auskunft über ein Konto als Datei — DSG Art. 25, DSGVO Art. 15.
 * `wessen` steht im Begleittext, damit klar ist, um wen es geht.
 */
export default function DataExportButton({ accountId, wessen = "dir" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [datei, setDatei] = useState("");

  const holen = async () => {
    setBusy(true);
    setError("");
    try {
      setDatei(await downloadPersonalData(accountId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sb-stack">
      <p className="sb-tab-intro">
        Alles, was zu {wessen} gespeichert ist, als Datei — Konto, Qualifikationen, Einschreibungen
        und Hilfegesuche.
      </p>
      <div className="sb-form-actions">
        <button type="button" className="sb-btn sb-btn-quiet" onClick={holen} disabled={busy}>
          {busy ? "Wird zusammengestellt …" : "Auskunft herunterladen"}
        </button>
        {datei && <span className="sb-saved-note">Gespeichert als {datei}</span>}
      </div>
      {error && <p className="sb-error">{error}</p>}
    </div>
  );
}

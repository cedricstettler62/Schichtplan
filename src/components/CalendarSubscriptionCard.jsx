import { useEffect, useState } from "react";
import { calendarStatus, renewCalendarToken } from "../api.js";

/**
 * Kalenderabo (iCal): zugeteilte Schichten als Termine in Google-, Apple-
 * oder Outlook-Kalender. Die Adresse *ist* der Zugang — wer sie hat, sieht
 * die Schichten, deshalb der Hinweis unten.
 */
export default function CalendarSubscriptionCard({ accountId }) {
  const [url, setUrl] = useState(null);
  const [geladen, setGeladen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    let aktiv = true;
    calendarStatus(accountId)
      .then((data) => { if (aktiv) setUrl(data.url); })
      .catch((err) => { if (aktiv) setError(err.message); })
      .finally(() => { if (aktiv) setGeladen(true); });
    return () => { aktiv = false; };
  }, [accountId]);

  const erzeugen = async () => {
    setBusy(true);
    setError("");
    try {
      setUrl((await renewCalendarToken(accountId)).url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Kein Zwischenspeicher-Zugriff — die Adresse steht im Feld und lässt sich von Hand markieren.
    }
  };

  return (
    <div className="sb-card">
      <h3 className="sb-subheading">Kalenderabo</h3>
      <p className="sb-tab-intro">
        Trägt deine zugeteilten Schichten als Termine in deinen Kalender ein – Google, Apple oder
        Outlook holen sie sich von selbst und bleiben damit aktuell.
      </p>

      {geladen && url && (
        <div className="sb-inline-add">
          <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Kalenderadresse" />
          <button type="button" className="sb-btn sb-btn-quiet" onClick={kopieren}>Kopieren</button>
          {kopiert && <span className="sb-saved-note">Kopiert.</span>}
        </div>
      )}

      <div className="sb-form-actions">
        <button type="button" className="sb-btn sb-btn-ink" onClick={erzeugen} disabled={busy || !geladen}>
          {busy ? "Wird erzeugt …" : url ? "Neue Adresse erzeugen" : "Kalenderabo einschalten"}
        </button>
      </div>

      {url && (
        <p className="sb-tab-intro">
          Wer diese Adresse hat, sieht deine zugeteilten Schichten. Eine neue Adresse macht die
          alte ungültig.
        </p>
      )}
      {error && <p className="sb-error">{error}</p>}
    </div>
  );
}

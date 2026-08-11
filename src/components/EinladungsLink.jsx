import { useState } from "react";

/**
 * Zeigt den Einladungslink zum Weitergeben. Er steht auch dann hier, wenn die
 * E-Mail rausging — scheitert die Zustellung still, wäre das Konto sonst
 * unerreichbar und niemand hätte etwas in der Hand.
 */
export default function EinladungsLink({ link, hinweis }) {
  const [kopiert, setKopiert] = useState(false);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Ohne Zwischenablage-Rechte bleibt der Link zum Markieren stehen.
      setKopiert(false);
    }
  };

  return (
    <div className="sb-invite">
      <p className="sb-status">{hinweis}</p>
      <div className="sb-invite-row">
        <code className="sb-invite-link">{link}</code>
        <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={kopieren}>
          {kopiert ? "Kopiert" : "Kopieren"}
        </button>
      </div>
    </div>
  );
}

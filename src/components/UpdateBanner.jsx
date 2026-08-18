import { useEffect, useState } from "react";

/**
 * Weist darauf hin, dass auf dem Server eine neue Fassung liegt.
 *
 * Ein Fenster, das wochenlang offen steht, ruft nie eine Seite neu auf — es
 * läuft dann mit dem JavaScript von damals gegen einen Server, der sich
 * inzwischen geändert hat. Wer die App schliesst und wieder öffnet, merkt
 * nichts davon; wer sie offen lässt, merkte es bisher gar nicht.
 *
 * Verglichen wird der Stand, den `/api/health` meldet, mit dem, der beim Laden
 * galt. Er ändert sich nur, wenn tatsächlich etwas eingespielt wurde. Gefragt
 * wird beim Zurückkehren ins Fenster und stündlich — häufiger wäre Lärm, denn
 * aktualisiert wird selten und nichts davon ist dringend.
 */

const STUNDE = 60 * 60 * 1000;

export default function UpdateBanner() {
  const [neu, setNeu] = useState(false);

  useEffect(() => {
    let geladeneFassung = null;
    let abgemeldet = false;

    const nachsehen = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const { version } = await res.json();
        if (abgemeldet || !version) return;
        if (geladeneFassung === null) geladeneFassung = version;
        else if (version !== geladeneFassung) setNeu(true);
      } catch {
        // Kein Netz, kein Hinweis. Beim nächsten Mal wieder.
      }
    };

    const beiRueckkehr = () => {
      if (document.visibilityState === "visible") nachsehen();
    };

    nachsehen();
    const uhr = setInterval(nachsehen, STUNDE);
    document.addEventListener("visibilitychange", beiRueckkehr);

    return () => {
      abgemeldet = true;
      clearInterval(uhr);
      document.removeEventListener("visibilitychange", beiRueckkehr);
    };
  }, []);

  if (!neu) return null;

  return (
    <div className="sb-update-banner" role="status">
      <span>Es gibt eine neue Fassung von Schichtboard.</span>
      <button type="button" className="sb-btn sb-btn-ink sb-btn-sm" onClick={() => window.location.reload()}>
        Jetzt neu laden
      </button>
    </div>
  );
}

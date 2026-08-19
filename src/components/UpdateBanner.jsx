import { useEffect, useState } from "react";

/**
 * Weist darauf hin, dass auf dem Server eine neue Fassung liegt — und holt sie
 * beim (Wieder-)Start der PWA gleich von selbst.
 *
 * Ein Fenster, das wochenlang offen steht, ruft nie eine Seite neu auf — es
 * läuft dann mit dem JavaScript von damals gegen einen Server, der sich
 * inzwischen geändert hat. Als installierte App wird dabei selten wirklich neu
 * geladen: Das Betriebssystem friert sie im Hintergrund ein, statt sie zu
 * beenden, und beim nächsten Antippen läuft einfach der eingefrorene Stand
 * weiter. Genau dieser Moment — die App kommt aus dem Hintergrund zurück,
 * also "startet" aus Sicht der Person, die sie antippt — lädt automatisch neu,
 * ohne zu fragen: Beim Zurückkehren ist noch nichts unterwegs, das dabei
 * verloren gehen könnte.
 *
 * Taucht eine neue Fassung dagegen auf, während das Fenster durchgehend
 * sichtbar und in Benutzung ist (die stündliche Prüfung im Hintergrund),
 * könnte ein automatisches Neuladen mitten in eine Eingabe platzen — dort
 * bleibt es beim Hinweis mit Knopf, den man selbst auslöst.
 *
 * Verglichen wird der Stand, den `/api/health` meldet, mit dem, der beim Laden
 * galt. Er ändert sich nur, wenn tatsächlich etwas eingespielt wurde.
 */

const STUNDE = 60 * 60 * 1000;

export default function UpdateBanner() {
  const [neu, setNeu] = useState(false);

  useEffect(() => {
    let geladeneFassung = null;
    let abgemeldet = false;

    const nachsehen = async ({ beimStart = false } = {}) => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const { version } = await res.json();
        if (abgemeldet || !version) return;
        if (geladeneFassung === null) { geladeneFassung = version; return; }
        if (version === geladeneFassung) return;

        if (beimStart) window.location.reload();
        else setNeu(true);
      } catch {
        // Kein Netz, kein Hinweis. Beim nächsten Mal wieder.
      }
    };

    const beiRueckkehr = () => {
      if (document.visibilityState === "visible") nachsehen({ beimStart: true });
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

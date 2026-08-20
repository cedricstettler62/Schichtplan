import { useEffect, useState } from "react";
import Karte from "./Karte.jsx";

/**
 * Legt die Anwendung als eigenes Programm auf den Rechner.
 *
 * Es gibt nichts herunterzuladen: Die Anwendung *ist* diese Seite. Der Browser
 * richtet daraus ein Fenster ohne Adresszeile ein, mit eigenem Symbol im
 * Startmenü und in der Taskleiste — dieselbe Adresse, derselbe Stand, nur ohne
 * Browser drumherum. Ein Update kommt damit automatisch mit; eine
 * heruntergeladene Datei wäre ab dem nächsten Update veraltet.
 *
 * Chrome und Edge kündigen die Installation mit `beforeinstallprompt` an. Das
 * Ereignis kommt gleich beim Laden der Seite, also lange bevor jemand die
 * Einstellungen öffnet — deshalb wird es hier auf Modulebene aufgefangen und
 * aufbewahrt. Die Komponente holt es sich, wenn sie erscheint.
 *
 * Safari und Firefox kennen es nicht. Dort steht der Weg als Text da, denn ein
 * Knopf, der nichts tut, wäre schlimmer als kein Knopf.
 */

let angebot = null;
const wartende = new Set();
const melden = (wert) => {
  angebot = wert;
  for (const w of wartende) w(wert);
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Ohne das schiebt der Browser sein eigenes Band ein, wann es ihm passt.
    event.preventDefault();
    melden(event);
  });
  window.addEventListener("appinstalled", () => melden(null));
}

/** Läuft die Seite gerade schon als eigenständiges Fenster? */
const alsAppGeoeffnet = () =>
  window.matchMedia?.("(display-mode: standalone)").matches === true ||
  window.navigator.standalone === true;

export default function AppInstallCard() {
  const [verfuegbar, setVerfuegbar] = useState(angebot);
  const [installiert, setInstalliert] = useState(alsAppGeoeffnet);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    const w = (wert) => {
      setVerfuegbar(wert);
      if (!wert) setInstalliert(true);
    };
    wartende.add(w);
    return () => wartende.delete(w);
  }, []);

  const installieren = async () => {
    if (!verfuegbar) return;
    setLaeuft(true);
    try {
      await verfuegbar.prompt();
      const { outcome } = await verfuegbar.userChoice;
      if (outcome === "accepted") setInstalliert(true);
      // Ein Angebot lässt sich nur einmal auslösen; ein neues kommt vom Browser.
      melden(null);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Karte titel="Als Programm einrichten">
      {installiert ? (
        <p className="sb-empty">
          Schichtboard ist auf diesem Gerät eingerichtet. Du findest es im Startmenü.
        </p>
      ) : (
        <>
          <p className="sb-tab-intro">
            Schichtboard bekommt ein eigenes Fenster und ein Symbol im Startmenü – ohne
            Adresszeile, ohne Tabs. Es bleibt dieselbe Anwendung, Aktualisierungen kommen also
            von selbst mit.
          </p>
          {verfuegbar ? (
            <div className="sb-form-actions">
              <button type="button" className="sb-btn sb-btn-ink" onClick={installieren} disabled={laeuft}>
                {laeuft ? "Wird eingerichtet …" : "Auf dem Desktop einrichten"}
              </button>
            </div>
          ) : (
            <p className="sb-empty">
              Dein Browser bietet dafür keinen Knopf an. In Safari geht es über
              <em> Teilen → Zum Dock hinzufügen</em>, in Chrome und Edge über das
              Installationssymbol rechts in der Adresszeile. Firefox kann es am Rechner nicht –
              dort bleibt Schichtboard eine Seite im Browser.
            </p>
          )}
        </>
      )}
    </Karte>
  );
}

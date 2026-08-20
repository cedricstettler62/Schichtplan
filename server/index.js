/* Startpunkt des Servers. */

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { DbHandle, seedDemo } from "./db.js";
import { startScheduler } from "./scheduler.js";

/**
 * Die Standardwerte aus config.js und .env.example sind für den lokalen
 * Betrieb gedacht. Im Betrieb hinter HTTPS (SB_SECURE_COOKIE=1) wäre der
 * Sitzungsschlüssel aus dem Beispiel ein offenes Tor: Wer ihn kennt — er steht
 * im Repository —, unterschreibt sich sein Sitzungs-Cookie selbst. install.sh
 * erzeugt beides zufällig; wer von Hand aufsetzt, soll es hier merken.
 */
function warneVorBeispielwerten(config) {
  if (!config.secureCookie) return;
  const beispiel = [];
  if (["lokaler-entwicklungsschluessel", "bitte-aendern"].includes(config.sessionSecret)) {
    beispiel.push("SB_SESSION_SECRET");
  }
  if (config.superAdmin.password === "123456") beispiel.push("SB_SUPER_PASSWORD");
  if (beispiel.length === 0) return;

  console.warn(
    `WARNUNG: ${beispiel.join(" und ")} steht noch auf dem Beispielwert aus .env.example. ` +
      "Bitte in .env ersetzen (openssl rand -hex 32) und den Dienst neu starten."
  );
}

const config = loadConfig();
warneVorBeispielwerten(config);
// Griff statt roher Datenbank: so lässt sich im Betrieb eine Sicherung einspielen.
const db = new DbHandle(config.dbPath);

if (config.seedDemo && seedDemo(db)) {
  console.log("Demo-Firma angelegt: Firmencode 111111, Mara Vogt / Lea Brunner, Passwort 12345");
}

startScheduler(db);

createApp(db, config).listen(config.port, config.host, () => {
  console.log(`Schichtboard läuft auf http://${config.host}:${config.port}`);
  console.log(`Datenbank: ${config.dbPath}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    db.close();
    process.exit(0);
  });
}

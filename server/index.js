/* Startpunkt des Servers. */

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { DbHandle, seedDemo } from "./db.js";
import { startScheduler } from "./scheduler.js";

const config = loadConfig();
// Griff statt roher Datenbank: so lässt sich im Betrieb eine Sicherung einspielen.
const db = new DbHandle(config.dbPath);

if (config.seedDemo && seedDemo(db)) {
  console.log("Demo-Firma angelegt: Firmencode 111111, Mara Vogt / Lea Brunner, Passwort 12345");
}

startScheduler(db);

createApp(db, config).listen(config.port, () => {
  console.log(`Schichtboard läuft auf http://localhost:${config.port}`);
  console.log(`Datenbank: ${config.dbPath}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    db.close();
    process.exit(0);
  });
}

/* Spielt eine exportierte Datenbank ein.

   Der Server muss dabei gestoppt sein — deploy/db-import.sh erledigt das.
   Vor dem Überschreiben wird die bisherige Datenbank automatisch gesichert;
   ein Fehlgriff ist also jederzeit rückgängig zu machen.

   Aufruf:  npm run db:import -- quelle.db */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { loadConfig } from "../server/config.js";
import { pruefeDatenbank } from "../server/dbCheck.js";

const source = process.argv[2];
if (!source) {
  console.error("Aufruf: npm run db:import -- quelle.db");
  process.exit(1);
}
if (!fs.existsSync(source)) {
  console.error(`Datei nicht gefunden: ${source}`);
  process.exit(1);
}

// Erst prüfen, ob es überhaupt eine Schichtboard-Datenbank ist.
const geprueft = pruefeDatenbank(source);
if (!geprueft.ok) {
  console.error(geprueft.error);
  process.exit(1);
}
console.log(`Quelle geprüft: ${geprueft.companies} Unternehmen, ${geprueft.accounts} Konten.`);

const config = loadConfig();
const target = path.resolve(config.dbPath);
fs.mkdirSync(path.dirname(target), { recursive: true });

if (fs.existsSync(target)) {
  const backup = path.join("backups", `vor-import_${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  fs.mkdirSync("backups", { recursive: true });
  new Database(target, { readonly: true }).prepare("VACUUM INTO ?").run(path.resolve(backup));
  console.log(`Bisherige Datenbank gesichert: ${backup}`);
}

fs.copyFileSync(path.resolve(source), target);
// Reste des Schreib-Journals der alten Datenbank entfernen.
for (const suffix of ["-wal", "-shm"]) {
  if (fs.existsSync(target + suffix)) fs.rmSync(target + suffix);
}

console.log(`Eingespielt nach ${target}. Server wieder starten.`);

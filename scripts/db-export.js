/* Exportiert die Datenbank in eine einzelne, in sich abgeschlossene Datei.
   Benutzt VACUUM INTO — das Ergebnis ist auch dann konsistent, wenn der
   Server gerade weiterläuft.

   Aufruf:  npm run db:export -- [zieldatei.db] */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { loadConfig } from "../server/config.js";

const config = loadConfig();

if (!fs.existsSync(config.dbPath)) {
  console.error(`Keine Datenbank unter ${config.dbPath} gefunden.`);
  process.exit(1);
}

function defaultTarget() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
  return path.join("backups", `schichtplan_${stamp}.db`);
}

const target = path.resolve(process.argv[2] || defaultTarget());
fs.mkdirSync(path.dirname(target), { recursive: true });
if (fs.existsSync(target)) {
  console.error(`${target} existiert bereits — bitte einen anderen Namen wählen.`);
  process.exit(1);
}

const db = new Database(config.dbPath, { readonly: true });
db.prepare("VACUUM INTO ?").run(target);
db.close();

const size = (fs.statSync(target).size / 1024).toFixed(0);
console.log(`Export geschrieben: ${target} (${size} kB)`);

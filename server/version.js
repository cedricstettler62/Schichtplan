/* Liest den installierten Stand direkt aus .git — ohne git aufzurufen.
   Der Dienst läuft mit eingeschränkten Rechten; Dateien lesen darf er. */

import fs from "node:fs";
import path from "node:path";

function readRef(gitDir, ref) {
  const direkt = path.join(gitDir, ref);
  if (fs.existsSync(direkt)) return fs.readFileSync(direkt, "utf8").trim();

  const packed = path.join(gitDir, "packed-refs");
  if (fs.existsSync(packed)) {
    const zeile = fs.readFileSync(packed, "utf8").split("\n").find((l) => l.endsWith(` ${ref}`));
    if (zeile) return zeile.split(" ")[0];
  }
  return null;
}

export function readVersion(root = process.cwd()) {
  const gitDir = path.join(root, ".git");
  try {
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    const commit = head.startsWith("ref:") ? readRef(gitDir, head.slice(4).trim()) : head;
    return {
      commit: commit ? commit.slice(0, 7) : "unbekannt",
      // Wann zuletzt etwas eingespielt wurde.
      date: fs.statSync(path.join(gitDir, "HEAD")).mtime.toISOString(),
    };
  } catch {
    return { commit: "unbekannt", date: null };
  }
}

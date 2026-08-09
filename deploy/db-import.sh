#!/usr/bin/env bash
#
# Spielt eine exportierte Datenbank ein und ersetzt damit die aktuelle.
#
#   sudo bash /opt/schichtplan/deploy/db-import.sh /pfad/zur/datei.db
#
# Der Dienst wird dafür kurz gestoppt. Die bisherige Datenbank wird vorher
# automatisch gesichert — ein Fehlgriff ist also rückgängig zu machen.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/schichtplan}"
APP_USER="${APP_USER:-schichtplan}"
QUELLE="${1:-}"

[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo starten." >&2; exit 1; }
[ -n "$QUELLE" ] || { echo "Aufruf: sudo bash db-import.sh /pfad/zur/datei.db" >&2; exit 1; }
[ -f "$QUELLE" ] || { echo "Datei nicht gefunden: $QUELLE" >&2; exit 1; }

cd "$APP_DIR"

echo "Achtung: die jetzigen Daten werden durch $QUELLE ersetzt."
read -r -p "Weiter? [ja/nein] " ANTWORT
[ "$ANTWORT" = "ja" ] || { echo "Abgebrochen."; exit 1; }

systemctl stop schichtplan
node --env-file="$APP_DIR/.env" scripts/db-import.js "$QUELLE"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/data" "$APP_DIR/backups"
systemctl start schichtplan

sleep 2
systemctl is-active --quiet schichtplan && echo "Fertig — der Server läuft wieder." || {
  journalctl -u schichtplan -n 30 --no-pager
  echo "Der Server ist nicht gestartet. Die Sicherung liegt in $APP_DIR/backups/" >&2
  exit 1
}

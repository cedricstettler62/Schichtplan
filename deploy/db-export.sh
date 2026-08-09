#!/usr/bin/env bash
#
# Schreibt die komplette Datenbank in eine einzelne Datei.
# Der Server darf dabei weiterlaufen.
#
#   sudo bash /opt/schichtplan/deploy/db-export.sh            → nach backups/
#   sudo bash /opt/schichtplan/deploy/db-export.sh /tmp/x.db  → an einen eigenen Ort

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/schichtplan}"
APP_USER="${APP_USER:-schichtplan}"

[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo starten." >&2; exit 1; }
cd "$APP_DIR"

node --env-file="$APP_DIR/.env" scripts/db-export.js "$@"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/backups"

cat <<EOF

Die Datei auf den eigenen Rechner holen — dieser Befehl läuft auf dem
eigenen Rechner, nicht auf dem Server:

  scp benutzer@server:$APP_DIR/backups/DATEINAME.db .
EOF

#!/usr/bin/env bash
#
# Aktualisiert Schichtboard auf den neuesten Stand.
#
#   sudo bash /opt/schichtplan/deploy/update.sh
#
# Denselben Ablauf startet der Knopf „Jetzt aktualisieren" in der Verwaltung:
# die Oberfläche legt data/update-requested an, systemd sieht die Datei und ruft
# dieses Skript als root auf.
#
# Zuerst wird die Datenbank gesichert, dann erst etwas verändert. Die Datenbank
# liegt in data/ und wird von Git nie angefasst.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/schichtplan}"
APP_USER="${APP_USER:-schichtplan}"
BRANCH="${SCHICHTPLAN_BRANCH:-main}"
KEEP_BACKUPS=20

STATUS_DATEI="$APP_DIR/data/update-status.json"
MARKER="$APP_DIR/data/update-requested"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
asuser() { sudo -H -u "$APP_USER" "$@"; }

# Zustand für die Oberfläche: status <laeuft|fertig|fehler> "<meldung>"
status() {
  mkdir -p "$APP_DIR/data"
  cat > "$STATUS_DATEI" <<EOF
{"state":"$1","message":"${2//\"/\'}","from":"${VORHER:-}","to":"${NACHHER:-}","startedAt":"${STARTED:-}","finishedAt":"$(date -Iseconds)"}
EOF
  chown "$APP_USER:$APP_USER" "$STATUS_DATEI" 2>/dev/null || true
}

fail() {
  printf '\n\033[31mFehler: %s\033[0m\n' "$*" >&2
  status fehler "$*"
  exit 1
}

[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo starten." >&2; exit 1; }
[ -d "$APP_DIR/.git" ] || { echo "$APP_DIR sieht nicht nach einer Installation aus." >&2; exit 1; }

cd "$APP_DIR"

# Als Erstes die Anforderung quittieren, sonst löst systemd sofort erneut aus.
rm -f "$MARKER"
STARTED="$(date -Iseconds)"
trap 'status fehler "Der Lauf wurde unerwartet abgebrochen."' ERR

status laeuft "Update gestartet."

PORT="$(grep -E '^PORT=' .env | cut -d= -f2- || true)"
PORT="${PORT:-3000}"
DB="$(grep -E '^SB_DB=' .env | cut -d= -f2- || true)"

log "Datenbank sichern"
STAMP="$(date +%Y-%m-%d_%H%M)"
BACKUP="backups/vor-update_${STAMP}.db"
if [ -n "$DB" ] && [ -f "$DB" ]; then
  asuser node --env-file="$APP_DIR/.env" scripts/db-export.js "$BACKUP" || fail "Die Sicherung ist fehlgeschlagen — es wurde nichts verändert."
else
  echo "Noch keine Datenbank vorhanden — nichts zu sichern."
  BACKUP="(keine)"
fi

log "Neue Version holen"
VORHER="$(asuser git rev-parse --short HEAD)"
asuser git fetch --quiet origin "$BRANCH" || fail "GitHub war nicht erreichbar."
asuser git reset --quiet --hard "origin/$BRANCH"
NACHHER="$(asuser git rev-parse --short HEAD)"
echo "$VORHER → $NACHHER"

if [ "$VORHER" = "$NACHHER" ]; then
  log "Schon auf dem neuesten Stand"
  status fertig "Schon auf dem neuesten Stand."
  exit 0
fi

log "Abhängigkeiten und Build"
asuser bash -c "cd '$APP_DIR' && npm ci --silent && npm run build --silent" || fail "Der Build ist fehlgeschlagen. Die alte Version läuft weiter."

log "Dienst neu starten"
systemctl restart schichtplan

for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done

if [ "${OK:-0}" != "1" ]; then
  journalctl -u schichtplan -n 30 --no-pager
  cat >&2 <<EOF

Der Server antwortet nicht. Die Daten sind unversehrt — sie liegen weiterhin in
$APP_DIR/data/ und zusätzlich als Sicherung in $APP_DIR/$BACKUP

Zurück auf die vorherige Version:
  sudo -u $APP_USER git -C $APP_DIR reset --hard $VORHER
  sudo bash $APP_DIR/deploy/update.sh
EOF
  fail "Der Server ist nach dem Update nicht gestartet. Zurück mit: git reset --hard $VORHER"
fi

# Alte Sicherungen ausdünnen, die neuesten bleiben.
ls -1t backups/*.db 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --
chown -R "$APP_USER:$APP_USER" "$APP_DIR/data" "$APP_DIR/backups"

trap - ERR
status fertig "Aktualisiert auf $NACHHER."
log "Fertig. Sicherung dieses Laufs: $APP_DIR/$BACKUP"

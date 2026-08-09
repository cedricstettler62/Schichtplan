#!/usr/bin/env bash
#
# Installiert Schichtboard auf einem frischen Ubuntu- oder Debian-Server.
#
#   sudo bash install.sh https://github.com/DEIN-KONTO/Schichtplan.git
#
# Ein zweiter Durchlauf repariert, statt kaputtzumachen: vorhandene Daten,
# Passwörter und die .env bleiben unangetastet.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/schichtplan}"
APP_USER="${APP_USER:-schichtplan}"
REPO="${1:-${SCHICHTPLAN_REPO:-https://github.com/cedricstettler62/Schichtplan.git}}"
BRANCH="${SCHICHTPLAN_BRANCH:-main}"
NODE_MAJOR=22

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mFehler: %s\033[0m\n' "$*" >&2; exit 1; }
asuser() { sudo -H -u "$APP_USER" "$@"; }

[ "$(id -u)" -eq 0 ] || fail "Bitte mit sudo starten:  sudo bash install.sh <repo-url>"

if [ -z "$REPO" ] && [ ! -d "$APP_DIR/.git" ]; then
  fail "Repo-Adresse fehlt.  Aufruf: sudo bash install.sh https://github.com/DEIN-KONTO/Schichtplan.git"
fi

log "Systempakete"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates openssl >/dev/null

log "Zugang zur Verwaltung"
# Gleich zu Beginn fragen, damit der Rest ohne Zutun durchläuft.
# Gelesen wird ausdrücklich von /dev/tty: beim Aufruf "curl … | sudo bash" ist
# die normale Eingabe das Skript selbst, ein blosses read bekäme nichts.
SUPER_NAME="${SB_SUPER_NAME:-}"
SUPER_PASSWORD="${SB_SUPER_PASSWORD:-}"

frage() { # frage <Text> <Vorgabe> — fragt über Kanal 3, das offene Terminal
  local antwort=""
  printf '   %s [%s]: ' "$1" "$2" >&3
  read -r antwort <&3 || antwort=""
  printf '%s' "${antwort:-$2}"
}

if [ -f "$APP_DIR/.env" ]; then
  echo "Bleibt wie er ist — .env ist schon da."
else
  NEW_ENV=1
  VORSCHLAG="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  # Das Terminal wirklich öffnen statt nur zu prüfen, ob es da ist: läuft die
  # Installation ohne Terminal (Automatik, Cloud-Init), scheitert genau hier das
  # Öffnen — und es bleibt bei den Vorgaben, statt abzubrechen.
  if [ -z "$SUPER_NAME$SUPER_PASSWORD" ] && { exec 3<>/dev/tty; } 2>/dev/null; then
    printf '\n   Damit meldest du dich später an. Enter übernimmt den Vorschlag.\n\n' >&3
    while :; do
      SUPER_NAME="$(frage 'Name    ' 'Verwaltung')"
      # Node liest die .env zeichengenau: ab einem # ist der Wert zu Ende, und
      # Anführungszeichen verschwinden. Solche Eingaben lieber gleich abweisen.
      case "$SUPER_NAME" in
        ""|*'#'*|*'"'*|*"'"*) printf '   Bitte ohne # und ohne Anführungszeichen.\n' >&3 ;;
        *) break ;;
      esac
    done
    while :; do
      SUPER_PASSWORD="$(frage 'Passwort' "$VORSCHLAG")"
      case "$SUPER_PASSWORD" in
        *[[:space:]]*|*'#'*|*'"'*|*"'"*)
          printf '   Bitte ohne Leerzeichen, # und Anführungszeichen.\n' >&3 ;;
        *) [ "${#SUPER_PASSWORD}" -ge 6 ] && break
           printf '   Mindestens 6 Zeichen, bitte nochmal.\n' >&3 ;;
      esac
    done
    printf '\n' >&3
    exec 3>&-
  fi
  SUPER_NAME="${SUPER_NAME:-Verwaltung}"
  SUPER_PASSWORD="${SUPER_PASSWORD:-$VORSCHLAG}"
  echo "Firmencode ${SB_SUPER_CODE:-000000}, Name $SUPER_NAME"
fi

log "Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node --version)"

log "Benutzerkonto $APP_USER"
# Kein eigenes Heimatverzeichnis anlegen — $APP_DIR wird es, und git clone
# braucht das Verzeichnis leer.
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

log "Quellcode nach $APP_DIR"
# Git läuft durchgehend als $APP_USER — sonst gehören die Dateien hinterher root.
if [ -d "$APP_DIR/.git" ]; then
  [ -n "$REPO" ] && asuser git -C "$APP_DIR" remote set-url origin "$REPO"
  asuser git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  asuser git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
else
  asuser git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
asuser mkdir -p "$APP_DIR/data" "$APP_DIR/backups"

log "Einstellungen"
if [ "${NEW_ENV:-0}" = "1" ]; then
  cat > "$APP_DIR/.env" <<EOF
PORT=3000
SB_DB=$APP_DIR/data/schichtplan.db
SB_SESSION_SECRET=$(openssl rand -hex 32)
SB_SUPER_CODE=${SB_SUPER_CODE:-000000}
SB_SUPER_NAME=$SUPER_NAME
SB_SUPER_PASSWORD=$SUPER_PASSWORD
SB_SEED_DEMO=0
SB_SECURE_COOKIE=1
EOF
else
  echo ".env ist schon da und bleibt unverändert."
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

log "Abhängigkeiten und Build"
asuser bash -c "cd '$APP_DIR' && npm ci --silent && npm run build --silent"

log "Dienst einrichten"
install -m 644 "$APP_DIR/deploy/schichtplan.service" /etc/systemd/system/schichtplan.service
# Damit der Knopf „Jetzt aktualisieren" in der Verwaltung funktioniert: der
# Pfad-Dienst wartet auf data/update-requested und ruft dann update.sh als root.
install -m 644 "$APP_DIR/deploy/schichtplan-update.service" /etc/systemd/system/schichtplan-update.service
install -m 644 "$APP_DIR/deploy/schichtplan-update.path" /etc/systemd/system/schichtplan-update.path
systemctl daemon-reload
systemctl enable --quiet --now schichtplan
systemctl enable --quiet --now schichtplan-update.path
systemctl restart schichtplan
sleep 2
systemctl is-active --quiet schichtplan || {
  journalctl -u schichtplan -n 30 --no-pager
  fail "Der Dienst ist nicht gestartet. Die Ausgabe oben sagt warum."
}

log "cloudflared"
if ! command -v cloudflared >/dev/null; then
  ARCH="$(dpkg --print-architecture)"
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  apt-get install -y -qq /tmp/cloudflared.deb >/dev/null
  rm -f /tmp/cloudflared.deb
fi

if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  cloudflared service install "$CLOUDFLARE_TUNNEL_TOKEN"
  TUNNEL_HINWEIS="Tunnel eingerichtet. Im Cloudflare-Dashboard muss der Public Hostname auf http://localhost:3000 zeigen."
else
  TUNNEL_HINWEIS="Noch offen: Tunnel verbinden mit
   sudo cloudflared service install <TOKEN aus dem Cloudflare-Dashboard>"
fi

cat <<EOF

────────────────────────────────────────────────────────────
 Schichtboard läuft.

 Verzeichnis   $APP_DIR
 Datenbank     $APP_DIR/data/schichtplan.db
 Dienst        systemctl status schichtplan

 $TUNNEL_HINWEIS
EOF

if [ "${NEW_ENV:-0}" = "1" ]; then
  cat <<EOF

 Zugang zur Verwaltung — bitte jetzt notieren:

   Firmencode  ${SB_SUPER_CODE:-000000}
   Name        $SUPER_NAME
   Passwort    $SUPER_PASSWORD

 Damit anmelden und das erste Unternehmen anlegen.
 Das Passwort steht auch in $APP_DIR/.env
EOF
fi

echo "────────────────────────────────────────────────────────────"

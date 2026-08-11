# Schichtboard

Schichtplanung für kleine Teams. Die Administration legt Schichten an, Mitarbeitende
schreiben sich ein, und am eingestellten Zuteilungstag verteilt das Programm die
Plätze automatisch — nur an Leute mit der passenden Qualifikation.

Mehrere Unternehmen teilen sich eine Installation, getrennt durch einen
sechsstelligen Firmencode.

## Schnellstart (lokal)

```bash
npm install
npm run dev
```

Das startet Server und Oberfläche zusammen: **http://localhost:5173**

Beim ersten Start entsteht eine Demo-Firma:

| Rolle        | Firmencode | Name        | Passwort |
| ------------ | ---------- | ----------- | -------- |
| Admin        | `111111`   | Mara Vogt   | `12345`  |
| Mitarbeitend | `111111`   | Lea Brunner | `12345`  |
| Verwaltung   | `000000`   | Kira X      | `123456` |

## Zugänge

Das Programm verschickt nichts. Passwörter werden vergeben und persönlich
weitergegeben — geschrieben blieben sie sonst irgendwo liegen.

| Wer ist ausgesperrt?  | Wer hilft                                                          |
| --------------------- | ------------------------------------------------------------------ |
| Mitarbeitende         | die Administration der Firma, unter *Mitarbeitende*                |
| Administration        | die Verwaltung, unter *Unternehmen* → Firma aufklappen             |
| Verwaltung            | `SB_SUPER_PASSWORD` in der `.env`, danach Dienst neu starten       |

Ein neues Konto bekommt sein erstes Passwort gleich beim Anlegen. Ändern kann
es die Person danach selbst — unter *Konto* beziehungsweise *Einstellungen*.
Admins setzen einander bewusst **nicht** zurück: sonst könnte einer die
anderen aussperren und die Firma übernehmen.

## Auf einem Server

Alles über SSH, ein Befehl:

```bash
curl -fsSL https://raw.githubusercontent.com/cedricstettler62/Schichtplan/main/deploy/install.sh \
  | sudo bash -s -- https://github.com/cedricstettler62/Schichtplan.git
```

Zu Beginn fragt das Skript nach Name und Passwort für die Verwaltung (Enter
übernimmt den zufälligen Vorschlag), danach läuft es allein durch: Node, Dienst,
Autostart und cloudflared. Der Zugang steht am Ende noch einmal in der Ausgabe.

Schritt für Schritt, auch für cloudflared: **[deploy/ANLEITUNG.md](deploy/ANLEITUNG.md)**

## Wartung – im Browser oder über SSH

Angemeldet als **Verwaltung** gibt es unten den Bereich *Wartung*: Version und
Datenbankgrösse auf einen Blick, dazu drei Knöpfe — Sicherung herunterladen,
Sicherung einspielen, Jetzt aktualisieren.

Dasselbe über SSH:

```bash
sudo bash /opt/schichtplan/deploy/update.sh                 # aktualisieren
sudo bash /opt/schichtplan/deploy/db-export.sh              # Sicherung schreiben
sudo bash /opt/schichtplan/deploy/db-import.sh datei.db     # Sicherung einspielen
```

## Datenbank

Alles liegt in einer einzigen Datei: `data/schichtplan.db`. Sichern heisst kopieren.

Der Export nutzt `VACUUM INTO` und läuft deshalb im laufenden Betrieb. Der Import
prüft die Datei erst auf ein gültiges Schema, legt den bisherigen Stand in
`backups/` ab und tauscht die Datenbank dann aus — über die Oberfläche sogar ohne
Neustart, weil alle Routen über einen austauschbaren Griff auf die Datenbank gehen
(`DbHandle` in [server/db.js](server/db.js)).

## Wie Updates funktionieren

Es gibt keine Release-Pakete und keine Registry. Die Wahrheit ist der `main`-Branch
auf GitHub, und der Server ist ein Klon davon:

```
git push  →  GitHub main  →  update.sh auf dem Server  →  git reset --hard origin/main
                                                          npm ci · npm run build
                                                          systemctl restart
```

`update.sh` sichert **zuerst** die Datenbank und bricht bei einem fehlgeschlagenen
Build ab, bevor irgendetwas neu gestartet wird — die laufende Version bleibt dann
einfach stehen. Die Datenbank kann ein Update nicht treffen: sie liegt in `data/`
und steht in `.gitignore`.

Der Knopf in der Oberfläche startet **nicht** selbst ein Update. Der Webdienst läuft
ohne erhöhte Rechte und darf sein eigenes Verzeichnis gar nicht beschreiben
(`ProtectSystem=strict`). Er legt nur `data/update-requested` an; ein
systemd-Pfad-Dienst sieht die Datei und ruft `update.sh` als root auf. Den Fortschritt
schreibt das Skript nach `data/update-status.json`, die Oberfläche fragt ihn ab.

## Aufbau

```
src/            Oberfläche (React)
  features/       ein Ordner je Bereich: login, overview, shifts, employees, …
  components/     kleine wiederverwendete Bausteine
  api.js          Aufrufe an den Server
shared/         Datums- und Zuteilungsregeln — von Browser, Server und Tests genutzt
server/         Express, SQLite, Anmeldung
  routes/         die API-Endpunkte, inkl. admin.js für die Wartung
scripts/        Export und Import der Datenbank
deploy/         Installation, Update, systemd, Anleitung
tests/          Regel-, API- und Oberflächentests
```

Die Zuteilungsregeln stehen genau einmal — in `shared/assignment.js`. Der Server
setzt sie durch, die Oberfläche zeigt sie an, die Tests prüfen sie.

`Schichtboard.jsx` im Wurzelverzeichnis ist der ursprüngliche Entwurf aus einer
einzigen Datei. Er wird nicht mehr benutzt und liegt nur noch zum Nachschlagen dort.

## Einstellungen

Alles über `.env` (Vorlage: `.env.example`). `install.sh` erzeugt sie mit
zufälligen Werten.

| Variable            | Bedeutung                                             |
| ------------------- | ----------------------------------------------------- |
| `PORT`              | Port des Servers, Standard 3000                       |
| `SB_DB`             | Pfad zur Datenbankdatei                               |
| `SB_SESSION_SECRET` | unterschreibt das Sitzungs-Cookie, geheim und zufällig |
| `SB_SUPER_*`        | Zugang zur Unternehmensverwaltung                     |
| `SB_SEED_DEMO`      | `1` legt die Demo-Firma an, wenn die Datenbank leer ist |
| `SB_SECURE_COOKIE`  | `1` hinter HTTPS (auf dem Server also immer)          |

## Tests

```bash
npm test
```

Drei Ebenen: die Zuteilungsregeln einzeln, die API über echte HTTP-Aufrufe, und
die Oberfläche einmal komplett durchgeklickt gegen einen laufenden Server.

## Technik

React + Vite · Express · SQLite (better-sqlite3) · bcrypt · Vitest · systemd + cloudflared.
Bewusst wenig Bewegliches — Node und eine Datei genügen zum Betrieb.

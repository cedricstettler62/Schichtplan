## 1. Einmalig: installieren

Auf dem Server anmelden:

```bash
ssh ubuntu@DEINE-SERVER-ADRESSE
```

Dann diesen einen Befehl

```bash
curl -fsSL https://raw.githubusercontent.com/cedricstettler62/Schichtplan/main/deploy/install.sh \
  | sudo bash -s -- https://github.com/cedricstettler62/Schichtplan.git
```

Ganz am Anfang fragt die Installation nach deinem Zugang zur **Verwaltung**:

```
   Damit meldest du dich später an. Enter übernimmt den Vorschlag.

   Name     [Verwaltung]: Cedric
   Passwort [k3nQx8ZvR2mLpTa4]:
```

Namen eintippen oder Enter drücken. Beim Passwort dasselbe: eigenes eintippen, oder
mit Enter das zufällig vorgeschlagene übernehmen — das ist die sicherere Variante.
Leerzeichen, `#` und Anführungszeichen gehen nicht, das Skript sagt es dir.

Der Firmencode für die Verwaltung ist immer `000000`.

Danach läuft die Installation ein paar Minuten allein durch und zeigt am Ende einen
Kasten mit deinem Zugang.

> **Das Passwort jetzt notieren.** Es steht sonst nur noch in `/opt/schichtplan/.env`.

Das Programm läuft ab sofort auf dem Server und startet nach einem Neustart von
selbst wieder.

---

## 2. Einmalig: öffentlich erreichbar machen

Der Server ist bis hierhin nur für sich selbst erreichbar. Cloudflare baut die
Brücke ins Internet, ohne dass am Server ein Port offen sein muss.

1. Im Cloudflare-Dashboard unter **Zero Trust → Networks → Tunnels** einen Tunnel anlegen.
2. Cloudflare zeigt dir einen langen Token. Kopieren.
3. Auf dem Server:

   ```bash
   sudo cloudflared service install DEIN-TOKEN
   ```

4. Zurück im Dashboard beim Tunnel einen **Public Hostname** eintragen:
   - *Subdomain/Domain*: die Adresse, unter der ihr das Programm erreichen wollt
   - *Service*: `HTTP` und `localhost:3000`

Fertig. Die Adresse im Browser öffnen, mit dem Verwaltungs-Zugang anmelden und das
erste Unternehmen anlegen.

---

## 3. Der Alltag: alles im Browser

Als **Verwaltung** anmelden. Ganz unten steht der Bereich **Wartung** — dort
siehst du die installierte Version, wie gross die Datenbank ist und wie viele
Unternehmen, Konten und Schichten drinstecken. Dazu drei Knöpfe:

**Sicherung herunterladen** — legt eine Datei `schichtplan_DATUM.db` in deinen
Download-Ordner. Das Programm läuft dabei ungestört weiter. Mach das, bevor du
etwas Grösseres änderst, und ab und zu einfach so.

**Sicherung einspielen** — Datei auswählen, Rückfrage mit *Ja, einspielen*
bestätigen. Das Programm prüft die Datei erst und legt den bisherigen Stand
automatisch als Kopie ab. Danach gelten sofort die Daten aus der Datei — ohne
Neustart, ohne SSH.

**Jetzt aktualisieren** — holt die neueste Version von GitHub. Der Knopf sichert
vorher die Datenbank. Es dauert ein bis zwei Minuten; zwischendurch startet das
Programm einmal neu, die Seite meldet danach von selbst „fertig". Ging etwas
schief, steht die Meldung in rot da und die alte Version läuft unverändert weiter.

> Die Daten überstehen jedes Update. Sie liegen in `/opt/schichtplan/data/` und
> haben mit dem Programmcode nichts zu tun.

---

## 4. Dasselbe über SSH

Falls die Oberfläche mal nicht erreichbar ist, geht alles auch von Hand:

```bash
ssh ubuntu@DEINE-SERVER-ADRESSE

sudo bash /opt/schichtplan/deploy/update.sh                # aktualisieren
sudo bash /opt/schichtplan/deploy/db-export.sh             # Sicherung schreiben
sudo bash /opt/schichtplan/deploy/db-import.sh datei.db    # Sicherung einspielen
```

Die Sicherung landet in `/opt/schichtplan/backups/`.

Eine dort liegende Sicherung auf den eigenen Rechner holen — dieser Befehl läuft
*nicht* auf dem Server, sondern bei dir zu Hause:

```bash
scp ubuntu@DEINE-SERVER-ADRESSE:/opt/schichtplan/backups/DATEINAME.db .
```

Und umgekehrt eine Datei einspielen:

```bash
scp DATEINAME.db ubuntu@DEINE-SERVER-ADRESSE:/tmp/                 # bei dir zu Hause
sudo bash /opt/schichtplan/deploy/db-import.sh /tmp/DATEINAME.db   # auf dem Server
```

Auch dieses Skript fragt nach, prüft die Datei und legt vorher eine Kopie des
jetzigen Standes ab.

---

## 5. Umziehen auf einen anderen Server

1. Beim alten Server in der Verwaltung auf **Sicherung herunterladen**.
2. Auf dem neuen Server: Schritt 1 und 2 dieser Anleitung.
3. Dort als Verwaltung anmelden, **Sicherung einspielen**, die Datei auswählen.

Alle Firmen, Konten und Schichten sind wieder da. Passwörter funktionieren weiter,
sie liegen mit in der Datenbank.

---

## Wenn etwas nicht stimmt

**Läuft es überhaupt?**

```bash
systemctl status schichtplan
```

Steht dort grün `active (running)`, ist alles in Ordnung.

**Was ist passiert?**

```bash
journalctl -u schichtplan -n 50
```

Die letzten 50 Zeilen. Fehlermeldungen stehen dort im Klartext.

**Neu starten**

```bash
sudo systemctl restart schichtplan
```

**Der Update-Knopf tut nichts.** Dann läuft der Wachdienst nicht, der die
Anforderung aus der Oberfläche abholt:

```bash
systemctl status schichtplan-update.path      # muss "active (waiting)" sein
sudo systemctl enable --now schichtplan-update.path
journalctl -u schichtplan-update -n 50        # was beim letzten Lauf passiert ist
```

**Update ging schief.** Das Skript sagt dir am Ende selbst, wie du auf die
vorherige Version zurückgehst. Die Daten sind in keinem Fall betroffen.

**Verwaltungs-Passwort vergessen**

```bash
sudo grep SB_SUPER /opt/schichtplan/.env
```

Ändern geht in derselben Datei — Zeile anpassen, dann
`sudo systemctl restart schichtplan`.

---

## Was wo liegt

| Ort                              | Inhalt                                        |
| -------------------------------- | --------------------------------------------- |
| `/opt/schichtplan/`              | das Programm                                  |
| `/opt/schichtplan/data/`         | **die Datenbank — das Einzige, was zählt**    |
| `/opt/schichtplan/backups/`      | Sicherungen, die letzten 20 bleiben liegen    |
| `/opt/schichtplan/.env`          | Passwörter und Einstellungen, nur für root lesbar |

Wer `data/` sichert, hat alles gesichert.

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

### Ein Admin greift nicht in ein fremdes Admin-Konto ein

Dieselbe Grenze gilt für alles, was Rechte oder Zugang berührt — Passwort
setzen, Qualifikationen ändern, Rolle ändern, Konto löschen. Ein Admin kann das
für die Belegschaft und für sich selbst, nie für ein anderes Admin-Konto: Sonst
könnte einer die anderen entmachten und die Firma übernehmen. Die mildere
Handlung schwächer zu schützen als die härtere wäre die falsche Reihenfolge.

Daraus folgt:

* **Adminrechte abgeben** kann jede Person nur selbst, unter *Einstellungen*.
  Wer versehentlich befördert wurde, gibt sie dort zurück. Die letzte
  Administration kann es nicht — sonst stünde die Firma ohne da.
* **Ein Admin-Konto löschen** kann nur die Verwaltung, unter *Unternehmen* →
  Firma aufklappen, bestätigt mit dem Verwaltungs-Passwort. Ist es das letzte,
  muss dabei eine Nachfolge aus der Belegschaft bestimmt werden; dieses Konto
  wird im selben Zug zum Admin-Konto. Zuteilungen des gelöschten Kontos werden
  frei und erscheinen unter *Noch offene Plätze*.

Ein neues Konto bekommt sein erstes Passwort gleich beim Anlegen. Ändern kann
es die Person danach selbst — unter *Konto* beziehungsweise *Einstellungen*.
Admins setzen einander bewusst **nicht** zurück (siehe oben).

Namen dürfen sich wiederholen — zwei Menschen heissen manchmal gleich.
Unterschieden werden sie am Passwort, und deshalb weist das Programm ein
Passwort ab, mit dem ein Konto hinter einem gleichnamigen verschwände: Die
Anmeldung landete sonst immer beim ersten der beiden, und das zweite käme
nirgends mehr hinein.

**Qualifikationen vergibt die Administration**, unter *Mitarbeitende*. Im
eigenen *Konto* stehen sie nur zum Nachlesen. Anders wäre „Erste Hilfe“ eine
Selbstauskunft — und die automatische Zuteilung verspricht mehr als das. Ihre
eigenen setzt die Administration unter *Einstellungen*: Sie steht in der
Mitarbeitendenliste nicht drin, käme sonst an keine und könnte damit auch keine
Schicht übernehmen.

**Eine Schicht darf mehrere verlangen.** Im Schichtformular sind die
Qualifikationen antippbare Chips statt einer Auswahlliste; mindestens eine muss
es sein. Verlangt heisst dabei verlangt: Wer die Schicht übernimmt, braucht
*alle* angetippten, nicht irgendeine davon. Eine Schicht mit „Erste Hilfe“ und
„Staplerschein“ bekommt also nur, wer beides mitbringt — und wem etwas fehlt,
dem sagt die Oberfläche, was genau.

## Angemeldet bleiben

Angemeldet wird einmal. Danach bleibt das Gerät angemeldet — über das Schliessen
des Fensters und den Neustart des Rechners hinweg. Enden kann eine Anmeldung
genau auf zwei Wegen:

| Weg | Wirkung |
| --- | ------- |
| **Abmelden** unter *Einstellungen* bzw. *Konto* | nur dieses eine Gerät |
| **Das Passwort wird geändert** | jedes Gerät, auf dem das Konto angemeldet war |

Der zweite Weg ist der wichtigere: Ein neues Passwort wäre nur eine halbe
Sperre, wenn das verlorene Telefon weiterliefe. Das gilt für jede Stelle, an der
ein Passwort gesetzt wird — selbst gewählt, von der Administration
zurückgesetzt, von der Verwaltung für ein ausgesperrtes Admin-Konto.

Eine Ausnahme gibt es: Das Gerät, an dem gerade jemand sitzt und das Passwort
ändert, bleibt angemeldet. Wer es eintippt, ist in diesem Moment nachweislich
er selbst und soll nicht mitten in der Arbeit hinausfliegen. Abgemeldet werden
alle anderen.

Technisch trägt jedes Konto einen Zähler (`accounts.session_epoch`), den jede
Passwortänderung um eins erhöht. Das Sitzungs-Cookie führt den Stand mit, der
beim Anmelden galt; passt er nicht mehr, gilt das Cookie nicht mehr. Es braucht
dafür keine Tabelle offener Sitzungen und kein Aufräumen — die Rechnung steht
in [server/auth.js](server/auth.js).

## Überschneidende Schichten

Grundregel: **Wer eine Schicht übernimmt, kann in derselben Zeit keine zweite
übernehmen.** Gespeichert werden nur die Ausnahmen davon.

Legt die Administration eine Schicht an, die sich zeitlich mit einer
bestehenden überschneidet, erscheint im Formular ein Block *Überschneidungen* —
eine Zeile je betroffener Serie, nicht je Termin. Dort wird einmal entschieden:

| Wahl | Wirkung |
| ---- | ------- |
| **Nein – schliessen einander aus** (Vorgabe) | Wer sich für die eine einschreibt, wird bei der anderen abgewiesen |
| **Ja – beides zusammen möglich** | Beide Schichten lassen sich nebeneinander übernehmen |

Die Regel greift an drei Stellen: beim **Einschreiben**, beim **Übernehmen**
und bei der **Auslosung**. Die ersten beiden weisen mit einer Meldung ab, die
beide Schichten mit Namen und Zeit nennt. Die Auslosung überspringt still, wer
zur selben Zeit schon einer anderen Schicht zugeteilt ist — nötig, weil eine
Freigabe zurückgenommen werden kann, nachdem sich jemand für beide
eingeschrieben hat. Lieber ein offener Platz als eine Person an zwei Orten.

Die Freigabe gilt in beide Richtungen und für alle Termine der beiden Serien,
auch für die, die später nachgefüllt werden.

Eine Schicht, die um 16:00 endet, überschneidet sich **nicht** mit einer, die um
16:00 beginnt. Nachtschichten (Ende früher als Anfang) reichen in den Folgetag
und werden dort korrekt geprüft — die Rechnung steht in
[shared/overlap.js](shared/overlap.js) und wird von Formular und Server
gemeinsam benutzt.

Dasselbe steht beim **Bearbeiten** einer Schicht: Der Block zeigt dort jede
Überschneidung — die schon bestehenden mit ihrem jetzigen Stand, die durch die
Änderung neu entstehenden mit der Marke *neu*. So lässt sich eine Freigabe
nachträglich erteilen oder zurücknehmen, ohne die Schicht neu anzulegen.

Wird an der Schicht selbst nichts geändert und nur eine Freigabe umgestellt,
**wird niemand ausgetragen** — die Rückfrage sagt das auch so. Ausgetragen wird
erst, wenn sich Name, Zeit, Datum, Plätze oder Qualifikationen ändern.
Dieselbe Liste in anderer Reihenfolge ist keine Änderung.

> **Für bestehende Installationen:** Schichten, die sich schon vor dieser
> Änderung überschnitten haben, gelten zunächst als sich ausschliessend — für
> sie wurde nie eine Freigabe eingetragen. Über *Bearbeiten* lässt sich das
> für jede betroffene Schicht nachholen.

## Schichten ändern

Aufgeklappt hat jede Schicht in der Admin-Ansicht einen Knopf *Bearbeiten*.
Änderbar sind Name, Zeiten, Plätze und Qualifikationen, bei einem einzelnen
Termin auch das Datum. Wiederholungsrhythmus und Enddatum bleiben — die ändert
man über *Serie ab hier löschen* und Neuanlegen.

**Jede Änderung trägt alle Ein- und Zugeteilten aus.** Wer sich für eine
Frühschicht mit Kassenschulung eingeschrieben hat, hat nicht der Nachtschicht
mit Staplerschein zugestimmt. Die Schicht gilt danach als frisch
ausgeschrieben.

**Vergangene Schichten bleiben, wie sie waren** — sie lassen sich nicht mehr
bearbeiten, und niemand trägt sich dort noch ein oder aus. Löschen kann die
Administration sie sehr wohl, und genau deshalb steht jedes Löschen im
Logbuch: mit Schicht, Zeit und Person, und zwar dauerhaft — der Eintrag
überlebt die Schicht, die er beschreibt. Dasselbe gilt für das Streichen von
einer Warteliste.

Bei einer Serie fragt das Formular nach dem Umfang:

| Umfang | Wirkung |
| ------ | ------- |
| **Nur diese Schicht** | Ändert den einen Termin. Er löst sich dabei aus der Serie, sonst schleppte die Nachfüllung die Ausnahme in alle künftigen Termine weiter. |
| **Diese und alle späteren** | Ändert jeden Termin der Serie ab dem gewählten Datum. Die Serie bleibt eine Serie, und was später nachgefüllt wird, übernimmt den neuen Stand. |

Vergangene Termine lassen sich nicht ändern: Sie auszutragen hiesse zu löschen,
wer die Schicht tatsächlich geleistet hat.

## Als Programm einrichten

Die Seite lässt sich als eigenständiges Programm ablegen und verhält sich danach
wie eine App: eigenes Symbol, kein Browser drumherum, und der zuletzt gesehene
Plan bleibt lesbar, wenn das Netz fehlt.

Angemeldet steht der Knopf dafür unten unter *Einstellungen* beziehungsweise
*Konto* — dort, wo der Browser ihn hergibt. Von Hand geht es überall:

| Gerät             | Weg                                                   |
| ----------------- | ----------------------------------------------------- |
| Windows, Chrome/Edge | Installationssymbol rechts in der Adresszeile      |
| macOS, Safari     | Teilen → *Zum Dock hinzufügen*                        |
| Android           | Menü des Browsers → *App installieren*                |
| iPhone            | Teilen-Symbol → *Zum Home-Bildschirm*                 |

Ein Store ist nicht im Spiel, und heruntergeladen wird nichts: Es bleibt
dieselbe Adresse und derselbe Code. Ein Update kommt damit von selbst mit —
eine heruntergeladene Datei wäre ab dem nächsten Update veraltet.

**Ein Fenster, das offen bleibt, erfährt vom Update.** Wer die App schliesst und
wieder öffnet, bekommt ohnehin den neuen Stand; ein Fenster, das wochenlang
offen steht, ruft aber nie eine Seite neu auf. Deshalb meldet `/api/health` den
eingespielten Stand, und die Oberfläche vergleicht ihn stündlich sowie beim
Zurückkehren ins Fenster mit dem, der beim Laden galt. Weicht er ab, erscheint
oben ein Streifen mit *Jetzt neu laden* — ein Hinweis, keine Unterbrechung.

**Der Zwischenspeicher räumt sich selbst auf.** Die gebauten Dateien tragen
ihren Inhalt im Namen, eine neue Fassung legt sich also neben die alte. Was die
gespeicherte `index.html` nicht mehr lädt, wird beim nächsten Seitenaufruf aus
dem Cache geworfen — sonst sammelte sich dort mit der Zeit jedes Bundle, das je
ausgeliefert wurde.

**Offline gilt nur fürs Lesen.** Einschreiben, Übernehmen und jede Änderung
gehen an den Server und brauchen eine Verbindung. Der Service Worker in
[public/sw.js](public/sw.js) speichert deshalb nichts, was unter `/api` liegt:
Ein Plan aus dem Zwischenspeicher sähe aus wie der aktuelle Stand, wäre es aber
nicht, und jemand erschiene zur falschen Schicht.

Seitenaufrufe fragen immer zuerst das Netz. Nach einem Update sieht damit jeder
sofort die neue Fassung, statt bis zum Ablauf eines Zwischenspeichers am alten
zu hängen.

**Beim Entwickeln ändert sich nichts.** Der Service Worker wird nur im gebauten
Stand registriert ([src/main.jsx](src/main.jsx)); `npm run dev` läuft wie
bisher, und ein früher registrierter wird dort wieder entfernt.

Die Symbole entstehen aus [scripts/icons.js](scripts/icons.js) — dunkler Grund,
drei versetzte Balken. Das Skript muss nur laufen, wenn sich das Aussehen ändern
soll:

```bash
node scripts/icons.js
```

## Kalenderabo

Wer unten in *Einstellungen* beziehungsweise *Konto* den Kalender einschaltet,
bekommt eine Adresse, die sich in Google, Apple oder Outlook als Kalenderabo
einträgt. Der Kalender holt sie sich von selbst regelmässig ab und zeigt die
eigenen **zugeteilten** Schichten als Termine — eine Einschreibung ist ein
Wunsch, eine Zuteilung eine Verpflichtung, und nur Verpflichtungen gehören in
einen Kalender.

Die Adresse trägt ein zufälliges Zeichen und *ist* damit der Zugang: Ein
Kalenderprogramm kann sich nicht anmelden, deshalb prüft
`GET /api/kalender/:token.ics` kein Cookie. Wer die Adresse hat, sieht die
Schichten — der Knopf *Neue Adresse erzeugen* macht eine weitergegebene
Adresse deshalb ungültig, ohne den Kalender ganz abzuschalten.

Die Zeiten stehen als schwebende Ortszeit im Feed, ohne Zeitzonenangabe: Der
Betrieb findet an einem Standort statt, und ein Kalenderprogramm zeigt eine
schwebende Zeit ohnehin in seiner eigenen Zone an — für diesen Fall genügt
das und bleibt ohne `VTIMEZONE`-Block einfacher. Die Erzeugung des Feeds
steht in [server/ical.js](server/ical.js), bewusst von Hand geschrieben statt
mit einem zusätzlichen Paket.

## Datenschutz

Die Datenschutzerklärung liegt unter **`/datenschutz`** und ist von der Fussleiste
jedes Bildschirms aus erreichbar, auch ohne Anmeldung.

> **Vor dem ersten Einsatz ausfüllen:** Ganz oben in
> [src/features/legal/PrivacyScreen.jsx](src/features/legal/PrivacyScreen.jsx) steht
> ein `BETREIBER`-Block. Nötig sind `name`, `kontakt`, `serverstandort` und
> `stand`; solange dort Platzhalter stehen, ist die Seite nicht
> veröffentlichungsreif. Die Postanschrift (`adresse`) ist **freiwillig** —
> bleibt sie leer, fällt die Zeile weg.

Der Text beschreibt, was das Programm tatsächlich speichert. Ändert sich die
Datenhaltung, gehört er mit angepasst.

**Auskunft** (DSG Art. 25, DSGVO Art. 15) gibt es ohne Umweg über die Datenbank:
Angemeldet steht unter *Konto* beziehungsweise *Einstellungen* der Knopf
*Auskunft herunterladen*; die Administration findet ihn zusätzlich bei jedem
Mitarbeitendenkonto. Heraus kommt eine JSON-Datei mit Konto, Qualifikationen,
Einschreibungen und Hilfegesuchen — zusammengetragen in
[server/personalData.js](server/personalData.js). Wer dort ein Feld ergänzt,
ergänzt es auch in der Auskunft.

## Auf einem Server

> **Zugang auf Anfrage.** Diese Software ist proprietär ([LICENSE](LICENSE)):
> Der Quelltext ist einsehbar, betreiben darf sie nur, wer dafür eine
> schriftliche Erlaubnis hat. Die folgende Anleitung richtet sich an
> Lizenznehmer. Anfragen: cedricstettler62@gmail.com

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
public/         Symbole, Manifest, Service Worker — unverändert in den Build
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

Vier Ebenen: die Zuteilungsregeln einzeln, die API über echte HTTP-Aufrufe, die
Oberfläche einmal komplett durchgeklickt gegen einen laufenden Server, und
Manifest samt Symbolen — ein vertippter Dateiname fiele sonst erst auf, wenn
jemand die Installation probiert.

## Technik

React + Vite · Express · SQLite (better-sqlite3) · bcrypt · Vitest · systemd + cloudflared.
Bewusst wenig Bewegliches — Node und eine Datei genügen zum Betrieb.

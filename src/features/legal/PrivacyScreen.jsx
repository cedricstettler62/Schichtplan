/*
 * Datenschutzerklärung. Der Text beschreibt, was das Programm tatsächlich tut —
 * wird an der Datenhaltung etwas geändert, gehört er mit angepasst.
 *
 * Die Angaben zum Betreiber stehen bewusst an einer Stelle beisammen: Sie sind
 * für jede Installation andere und müssen vor dem ersten Einsatz ausgefüllt
 * werden.
 *
 * Nötig sind `name` und `kontakt` — verlangt ist eine erkennbare Identität und
 * ein Weg, den Betreiber tatsächlich zu erreichen. Die Postanschrift ist
 * freiwillig: Bleibt `adresse` leer, fällt die Zeile weg.
 */
const BETREIBER = {
  name: "[Name des Betreibers]",
  adresse: "", // optional — leer lassen, wenn keine Postanschrift stehen soll
  kontakt: "[Kontaktadresse für Datenschutzanliegen]",
  serverstandort: "[Standort des Servers, z. B. Schweiz]",
  stand: "[Monat Jahr]",
};

export default function PrivacyScreen() {
  return (
    <div className="sb-legal-wrap">
      <div className="sb-login-head">
        <h1 className="sb-app-title">Schichtboard</h1>
        <p className="sb-login-sub">Datenschutzerklärung</p>
      </div>

      <div className="sb-card sb-legal">
        <p className="sb-legal-lead">
          Schichtboard plant Schichten für kleine Teams. Dabei werden Personendaten bearbeitet.
          Diese Erklärung sagt, welche das sind, wozu sie dienen, wie lange sie bleiben und welche
          Rechte daran bestehen. Sie richtet sich nach dem Schweizer Datenschutzgesetz (DSG) und,
          soweit anwendbar, nach der europäischen Datenschutz-Grundverordnung (DSGVO).
        </p>

        <h2 className="sb-legal-h">1. Wer verantwortlich ist</h2>
        <p>
          Verantwortlich für die Daten eines Unternehmens ist dieses Unternehmen selbst — es
          entscheidet, wer ein Konto bekommt und welche Schichten geplant werden. Betrieben und
          technisch betreut wird Schichtboard von:
        </p>
        <p className="sb-legal-adresse">
          {[BETREIBER.name, BETREIBER.adresse, BETREIBER.kontakt]
            .filter((zeile) => zeile && zeile.trim())
            .map((zeile, i) => (
              <span key={zeile}>{i > 0 && <br />}{zeile}</span>
            ))}
        </p>
        <p>
          Der Betreiber bearbeitet die Daten ausschliesslich im Auftrag der Unternehmen
          (Auftragsbearbeitung nach DSG Art. 9 bzw. DSGVO Art. 28) und nicht für eigene Zwecke.
        </p>

        <h2 className="sb-legal-h">2. Welche Daten gespeichert werden</h2>
        <ul className="sb-legal-list">
          <li><strong>Konto:</strong> Name, Rolle (Administration oder Mitarbeitende), Zugehörigkeit zu einem Unternehmen.</li>
          <li><strong>Passwort:</strong> ausschliesslich als bcrypt-Hash. Das Passwort im Klartext ist nirgends gespeichert und lässt sich aus dem Hash nicht zurückrechnen.</li>
          <li><strong>Qualifikationen</strong>, die einem Konto zugeordnet sind.</li>
          <li><strong>Schichten</strong> des Unternehmens sowie <strong>Einschreibungen</strong> und <strong>Zuteilungen</strong> einzelner Konten.</li>
          <li><strong>Hilfegesuche</strong> zu einzelnen Schichten.</li>
        </ul>
        <p>
          Eine E-Mail-Adresse wird <strong>nicht</strong> erhoben. Das Programm verschickt keine
          Nachrichten. Bei Anmeldeversuchen wird die IP-Adresse kurzzeitig im Arbeitsspeicher
          gehalten, um Passwort-Raten zu bremsen; sie wird nicht in die Datenbank geschrieben und
          ist nach einem Neustart weg.
        </p>

        <h2 className="sb-legal-h">3. Wozu</h2>
        <p>
          Ausschliesslich zur Schichtplanung: Konten unterscheiden, Einschreibungen entgegennehmen,
          Schichten an Personen mit der passenden Qualifikation zuteilen und den Zugang absichern.
          Rechtsgrundlage ist das Arbeitsverhältnis zum jeweiligen Unternehmen und dessen
          berechtigtes Interesse an einer funktionierenden Einsatzplanung.
        </p>
        <p>
          Eine <strong>automatisierte Entscheidung mit Rechtsfolge</strong> findet nicht statt: Die
          Zuteilung verteilt Plätze nach Qualifikation und Einschreibung, und die Administration
          kann sie jederzeit von Hand ändern.
        </p>

        <h2 className="sb-legal-h">4. Wie lange</h2>
        <ul className="sb-legal-list">
          <li>Schichten samt Einschreibungen und Hilfegesuchen werden <strong>drei Monate nach ihrem Datum</strong> automatisch und vollständig gelöscht.</li>
          <li>Konten bleiben, bis sie gelöscht werden. Mit einem Konto verschwinden alle daran hängenden Einschreibungen.</li>
          <li>Mit einem gelöschten Unternehmen verschwinden alle seine Konten, Schichten und Qualifikationen.</li>
          <li>Sicherungskopien der Datenbank können ältere Stände enthalten. Es bleiben die letzten 20 liegen, ältere rücken nach.</li>
        </ul>

        <h2 className="sb-legal-h">5. Wer die Daten sieht</h2>
        <ul className="sb-legal-list">
          <li>Die Administration des eigenen Unternehmens.</li>
          <li>Andere Mitarbeitende desselben Unternehmens sehen Namen und Zuteilungen zu Schichten — das ist der Zweck eines gemeinsamen Plans.</li>
          <li>Der Betreiber, soweit für Betrieb, Sicherung und Fehlersuche nötig.</li>
        </ul>
        <p>
          Unternehmen sind serverseitig strikt getrennt: Kein Konto kann Daten eines anderen
          Unternehmens abrufen. Eine Weitergabe an Dritte, eine Auswertung zu Werbezwecken oder ein
          Verkauf finden nicht statt.
        </p>

        <h2 className="sb-legal-h">6. Wo die Daten liegen</h2>
        <p>
          Alle Daten liegen in einer einzigen Datenbankdatei auf einem Server in{" "}
          {BETREIBER.serverstandort}. Die Verbindung dorthin ist durchgehend mit HTTPS
          verschlüsselt.
        </p>

        <h2 className="sb-legal-h">7. Cookies</h2>
        <p>
          Schichtboard setzt genau ein Cookie: <code>sb_session</code>. Es hält die Anmeldung
          aufrecht, ist signiert, für JavaScript im Browser nicht lesbar und läuft nach 30 Tagen ab.
          Ohne dieses Cookie funktioniert die Anmeldung nicht — eine Einwilligung ist dafür nicht
          nötig. Es gibt <strong>keine</strong> Cookies für Statistik, Reichweitenmessung oder
          Werbung, keine eingebetteten Dienste Dritter und keine Weitergabe von Nutzungsdaten.
        </p>

        <h2 className="sb-legal-h">8. Sicherheit</h2>
        <p>
          Passwörter werden mit bcrypt gehasht, das Sitzungs-Cookie ist signiert und nur über HTTPS
          gültig, wiederholte Fehlanmeldungen werden gebremst, und jede Anfrage prüft auf dem Server
          Rolle und Firmenzugehörigkeit — nicht bloss im Browser.
        </p>

        <h2 className="sb-legal-h">9. Rechte</h2>
        <p>Jede betroffene Person hat das Recht auf</p>
        <ul className="sb-legal-list">
          <li><strong>Auskunft</strong> über die zu ihr gespeicherten Daten,</li>
          <li><strong>Berichtigung</strong> unrichtiger Daten,</li>
          <li><strong>Löschung</strong>,</li>
          <li><strong>Herausgabe</strong> in einem gängigen elektronischen Format,</li>
          <li><strong>Widerspruch</strong> gegen eine bestimmte Bearbeitung.</li>
        </ul>
        <p>
          Die Auskunft gibt es direkt im Programm und ohne Umweg: angemeldet unter <em>Konto</em>
          {" "}beziehungsweise <em>Einstellungen</em> steht der Knopf <em>Auskunft herunterladen</em>.
          Die Datei enthält alles, was zu dem Konto gespeichert ist. Für alles Weitere genügt eine
          Nachricht an die Administration des eigenen Unternehmens oder an {BETREIBER.kontakt}.
        </p>
        <p>
          Wer sich in seinen Rechten verletzt sieht, kann sich an den Eidgenössischen Datenschutz-
          und Öffentlichkeitsbeauftragten (EDÖB) wenden, in der EU an die zuständige
          Aufsichtsbehörde.
        </p>

        <h2 className="sb-legal-h">10. Änderungen</h2>
        <p>
          Ändert sich, was das Programm speichert, wird diese Erklärung mit angepasst.
          Stand: {BETREIBER.stand}.
        </p>
      </div>

      <div className="sb-legal-back">
        <a className="sb-btn sb-btn-quiet" href="/">Zurück zum Schichtboard</a>
      </div>
    </div>
  );
}

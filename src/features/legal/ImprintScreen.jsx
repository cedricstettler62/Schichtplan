/*
 * Impressum. Wer dieses Angebot betreibt und wie er zu erreichen ist —
 * verlangt vom schweizerischen UWG (Art. 3 Abs. 1 lit. s) und, soweit
 * anwendbar, vom deutschen Digitale-Dienste-Gesetz (§ 5 DDG).
 *
 * Die Angaben stehen in betreiber.js, gemeinsam mit der
 * Datenschutzerklärung. Freiwillige Zeilen fallen weg, solange sie dort leer
 * bleiben; Name, Anschrift und Kontakt sind Pflicht.
 */
import { BETREIBER, gefuellteZeilen } from "./betreiber.js";

export default function ImprintScreen() {
  return (
    <div className="sb-legal-wrap">
      <div className="sb-login-head">
        <h1 className="sb-app-title">Schichtboard</h1>
        <p className="sb-login-sub">Impressum</p>
      </div>

      <div className="sb-card sb-legal">
        <p className="sb-legal-lead">
          Schichtboard plant Schichten für kleine Teams. Betrieben und technisch betreut wird diese
          Installation von:
        </p>

        <p className="sb-legal-adresse">
          {gefuellteZeilen(BETREIBER.name, BETREIBER.adresse).map((zeile, i) => (
            <span key={zeile}>{i > 0 && <br />}{zeile}</span>
          ))}
        </p>

        <h2 className="sb-legal-h">Kontakt</h2>
        <p className="sb-legal-adresse">
          {gefuellteZeilen(BETREIBER.kontakt, BETREIBER.telefon).map((zeile, i) => (
            <span key={zeile}>{i > 0 && <br />}{zeile}</span>
          ))}
        </p>

        {BETREIBER.vertretung && (
          <>
            <h2 className="sb-legal-h">Vertretungsberechtigt</h2>
            <p>{BETREIBER.vertretung}</p>
          </>
        )}

        {(BETREIBER.register || BETREIBER.mehrwertsteuer) && (
          <>
            <h2 className="sb-legal-h">Eintrag und Steuernummer</h2>
            <p className="sb-legal-adresse">
              {gefuellteZeilen(BETREIBER.register, BETREIBER.mehrwertsteuer).map((zeile, i) => (
                <span key={zeile}>{i > 0 && <br />}{zeile}</span>
              ))}
            </p>
          </>
        )}

        <h2 className="sb-legal-h">Verantwortlich für die Inhalte</h2>
        <p>
          Für die Schichten, Konten und Namen, die in einem Unternehmen erfasst sind, ist dieses
          Unternehmen selbst verantwortlich — es entscheidet, wer ein Konto bekommt und was geplant
          wird. Der Betreiber stellt die Technik bereit und bearbeitet diese Daten ausschliesslich
          im Auftrag der Unternehmen. Was dabei gespeichert wird, steht in der{" "}
          <a href="/datenschutz">Datenschutzerklärung</a>.
        </p>

        <h2 className="sb-legal-h">Urheberrecht</h2>
        <p>
          Die Software Schichtboard ist urheberrechtlich geschützt (© 2026 Cedric Stettler, siehe
          Lizenz). Betreiben darf sie nur, wer dafür eine Lizenz hat; die Daten der Unternehmen
          bleiben davon unberührt und gehören ihnen.
        </p>

        <h2 className="sb-legal-h">Haftung</h2>
        <p>
          Schichtboard wird nach bestem Wissen betrieben. Für Schäden aus einem Ausfall, einer
          fehlerhaften Zuteilung oder aus Inhalten, die Nutzende selbst eingetragen haben, wird
          keine Haftung übernommen, soweit das Gesetz das zulässt. Wer einen Fehler bemerkt, meldet
          ihn an {BETREIBER.kontakt} — das ist der schnellere Weg als jeder Haftungsausschluss.
        </p>

        <p>Stand: {BETREIBER.stand}.</p>
      </div>

      <div className="sb-legal-back">
        <a className="sb-btn sb-btn-quiet" href="/">Zurück zum Schichtboard</a>
        <a className="sb-btn sb-btn-quiet" href="/datenschutz">Datenschutzerklärung</a>
      </div>
    </div>
  );
}

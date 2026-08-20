import { fmtDate } from "#shared/dates.js";

/**
 * Eine Serie, die sich zeitlich mit der gerade bearbeiteten Schicht
 * überschneidet, samt der einen Frage, die dazu zu entscheiden ist.
 *
 * Dieselbe Zeile beim Anlegen wie beim Bearbeiten: Zwei Fassungen davon liefen
 * mit dem nächsten Feinschliff auseinander, und die Entscheidung ist in beiden
 * Fällen wörtlich dieselbe.
 */
export default function OverlapRow({ serie, erlaubt, onChange, neu = false }) {
  return (
    <div className="sb-overlap-row">
      <div className="sb-overlap-info">
        <span className="sb-overlap-name">
          {serie.name}
          {neu && <span className="sb-overlap-neu">neu</span>}
        </span>
        <span className="sb-overlap-meta">
          <span className="sb-mono">{serie.startTime}–{serie.endTime}</span>
          {" · "}
          {serie.termine === 1 ? fmtDate(serie.erster) : `${serie.termine} Termine ab ${fmtDate(serie.erster)}`}
        </span>
      </div>
      <label className="sb-field sb-field-compact">
        <span>Zusammen übernehmbar?</span>
        <select value={erlaubt ? "ja" : "nein"} onChange={(e) => onChange(e.target.value === "ja")}>
          <option value="nein">Nein – schliessen einander aus</option>
          <option value="ja">Ja – beides zusammen möglich</option>
        </select>
      </label>
    </div>
  );
}

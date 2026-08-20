import { useState } from "react";
import LogbookEntryRow from "../features/logbook/LogbookEntryRow.jsx";

/**
 * Das Logbuch einer Firma — nur auf Wunsch geladen, nicht mit der Firmenliste.
 * Bei vielen Unternehmen wäre alles im Voraus zu holen die teuerste Art,
 * fast nichts anzuzeigen.
 */
export default function LogbookLoader({ onLoad, emptyText = "Noch keine Einträge." }) {
  const [entries, setEntries] = useState(null); // null = nicht geladen

  const umschalten = async () => setEntries(entries !== null ? null : await onLoad());

  return (
    <>
      <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={umschalten}>
        {entries !== null ? "Logbuch ausblenden" : "Logbuch laden"}
      </button>
      {entries !== null &&
        (entries.length === 0 ? (
          <p className="sb-empty">{emptyText}</p>
        ) : (
          <div className="sb-log-list">
            {entries.map((e) => <LogbookEntryRow key={e.id} entry={e} />)}
          </div>
        ))}
    </>
  );
}

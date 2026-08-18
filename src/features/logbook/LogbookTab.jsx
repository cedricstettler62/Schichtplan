import { useEffect, useState } from "react";
import LogbookEntryRow from "./LogbookEntryRow.jsx";

export default function LogbookTab({ onLoad }) {
  const [entries, setEntries] = useState(null); // null = wird geladen
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let abgebrochen = false;
    onLoad().then((rows) => { if (!abgebrochen) setEntries(rows); });
    return () => { abgebrochen = true; };
  }, [onLoad]);

  const trimmed = filter.trim().toLowerCase();
  const gefiltert = entries && trimmed
    ? entries.filter((e) => e.shiftLabel.toLowerCase().includes(trimmed) || e.message.toLowerCase().includes(trimmed))
    : entries;

  return (
    <div className="sb-tab">
      <div className="sb-tab-head">
        <div className="sb-tab-head-text">
          <h2 className="sb-tab-head-title">Logbuch</h2>
          <p className="sb-tab-intro">
            Anlegen, Ändern, Zu- und Umteilungen sowie Hilfegesuche — unveränderlich protokolliert.
          </p>
        </div>
      </div>

      <div className="sb-card">
        <label className="sb-field">
          <span>Nach Schicht oder Text filtern</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="z. B. Spätschicht" />
        </label>
      </div>

      <div className="sb-card">
        {entries === null ? (
          <p className="sb-status">Logbuch wird geladen …</p>
        ) : gefiltert.length === 0 ? (
          <p className="sb-empty">{entries.length === 0 ? "Noch keine Einträge." : "Nichts gefunden."}</p>
        ) : (
          <div className="sb-log-list">
            {gefiltert.map((e) => <LogbookEntryRow key={e.id} entry={e} />)}
          </div>
        )}
      </div>
    </div>
  );
}

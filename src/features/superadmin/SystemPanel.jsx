import { useCallback, useEffect, useRef, useState } from "react";

import { api, downloadDatabase, uploadDatabase } from "../../api.js";
import { fmtZeitpunkt } from "#shared/dates.js";
import Karte from "../../components/Karte.jsx";

/*
 * Wartung für die Verwaltung: Sicherung herunterladen, Sicherung einspielen,
 * Programm aktualisieren. Spricht ausnahmsweise selbst mit der API — die
 * Alternative wäre, fünf Handler durch zwei Ebenen zu reichen, die sonst
 * niemand braucht.
 */

function lesbareGroesse(bytes) {
  if (!bytes) return "leer";
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} kB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SystemPanel({ onDataChanged }) {
  const [info, setInfo] = useState(null);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const [beschaeftigt, setBeschaeftigt] = useState("");
  const [nachfrage, setNachfrage] = useState(null); // ausgewählte Datei vor der Rückfrage
  const dateiFeld = useRef(null);

  const ladeInfo = useCallback(async () => {
    try {
      setInfo(await api.get("/admin/info"));
    } catch {
      setInfo(null);
    }
  }, []);

  useEffect(() => { ladeInfo(); }, [ladeInfo]);

  // Während ein Update läuft, wird der Server zwischendurch neu gestartet —
  // deshalb weiter nachfragen, bis er wieder antwortet und fertig meldet.
  const stand = info?.update;
  const angelaufen = stand?.state === "laeuft" || stand?.state === "angefordert";
  const alter = stand?.startedAt ? Date.now() - new Date(stand.startedAt).getTime() : 0;
  // Passiert nichts, holt niemand die Anforderung ab — sonst hinge der Knopf ewig.
  const haengt = angelaufen && alter > 10 * 60 * 1000;
  const laeuft = angelaufen && !haengt;
  useEffect(() => {
    if (!laeuft) return undefined;
    const timer = setInterval(ladeInfo, 3000);
    return () => clearInterval(timer);
  }, [laeuft, ladeInfo]);

  const zuruecksetzen = () => { setMeldung(""); setFehler(""); };

  const exportieren = async () => {
    zuruecksetzen();
    setBeschaeftigt("export");
    try {
      const name = await downloadDatabase();
      setMeldung(`Heruntergeladen: ${name}`);
    } catch (err) {
      setFehler(err.message);
    } finally {
      setBeschaeftigt("");
    }
  };

  const importieren = async (datei) => {
    zuruecksetzen();
    setNachfrage(null);
    setBeschaeftigt("import");
    try {
      const res = await uploadDatabase(datei);
      setMeldung(`Eingespielt: ${res.companies} Unternehmen, ${res.accounts} Konten. Vorheriger Stand gesichert als ${res.sicherung}.`);
      await ladeInfo();
      await onDataChanged?.();
    } catch (err) {
      setFehler(err.message);
    } finally {
      setBeschaeftigt("");
      if (dateiFeld.current) dateiFeld.current.value = "";
    }
  };

  const aktualisieren = async () => {
    zuruecksetzen();
    setBeschaeftigt("update");
    try {
      await api.post("/admin/update");
      setMeldung("Das Update wurde angestossen. Das dauert ein bis zwei Minuten.");
      await ladeInfo();
    } catch (err) {
      setFehler(err.message);
    } finally {
      setBeschaeftigt("");
    }
  };

  if (!info) return null;

  return (
    <Karte titel="Wartung" intro="Sicherung herunterladen, eine Sicherung einspielen und das Programm auf den neuesten Stand bringen.">
      <div className="sb-detail-grid">
        <div><span className="sb-detail-label">Version</span><span className="sb-mono">{info.version.commit}</span></div>
        <div><span className="sb-detail-label">Stand vom</span>{fmtZeitpunkt(info.version.date)}</div>
        <div><span className="sb-detail-label">Datenbank</span>{lesbareGroesse(info.db.groesse)}</div>
        <div><span className="sb-detail-label">Inhalt</span>{info.db.companies} Unternehmen · {info.db.accounts} Konten · {info.db.shifts} Schichten</div>
      </div>

      <div className="sb-manage-actions">
        <button type="button" className="sb-btn sb-btn-ink" onClick={exportieren} disabled={!!beschaeftigt}>
          {beschaeftigt === "export" ? "Wird erstellt …" : "Sicherung herunterladen"}
        </button>

        <label className={`sb-btn sb-btn-petrol ${beschaeftigt ? "sb-btn-disabled" : ""}`}>
          Sicherung einspielen
          <input
            ref={dateiFeld}
            type="file"
            accept=".db"
            style={{ display: "none" }}
            disabled={!!beschaeftigt}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { zuruecksetzen(); setNachfrage(f); } }}
          />
        </label>

        <button type="button" className="sb-btn sb-btn-amber" onClick={aktualisieren} disabled={!!beschaeftigt || laeuft}>
          {laeuft ? "Update läuft …" : "Jetzt aktualisieren"}
        </button>
      </div>

      {nachfrage && (
        <div className="sb-confirm">
          <span>
            <strong>{nachfrage.name}</strong> ersetzt alle jetzigen Daten. Der bisherige Stand wird vorher gesichert.
          </span>
          <button type="button" className="sb-btn sb-btn-rust sb-btn-sm" onClick={() => importieren(nachfrage)}>Ja, einspielen</button>
          <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => { setNachfrage(null); if (dateiFeld.current) dateiFeld.current.value = ""; }}>Abbrechen</button>
        </div>
      )}

      {beschaeftigt === "import" && <p className="sb-status">Wird eingespielt …</p>}

      {haengt && (
        <p className="sb-error">
          Die Update-Anforderung liegt seit {fmtZeitpunkt(stand.startedAt)} unbearbeitet.
          Auf dem Server prüfen: <span className="sb-mono">systemctl status schichtplan-update.path</span>
        </p>
      )}

      {stand && !haengt && !nachfrage && (
        <p className={stand.state === "fehler" ? "sb-error" : "sb-saved-note"}>
          Letztes Update: {stand.message || stand.state} ({fmtZeitpunkt(stand.finishedAt)})
        </p>
      )}

      {meldung && <p className="sb-saved-note">{meldung}</p>}
      {fehler && <p className="sb-error">{fehler}</p>}
    </Karte>
  );
}

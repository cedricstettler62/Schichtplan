import { useMemo, useState } from "react";
import { overlappingSeries } from "#shared/overlap.js";
import { fmtDate } from "#shared/dates.js";

/*
 * Eine bestehende Schicht ändern.
 *
 * Ändert sich an der Schicht selbst etwas, trägt das alle Ein- und Zugeteilten
 * aus — deshalb steht vor dem Speichern eine Rückfrage, die beziffert, wen es
 * trifft. Wer nur eine Freigabe nachträgt, ändert an der Schicht nichts und
 * wirft entsprechend auch niemanden heraus.
 *
 * `seriesShifts` sind alle Termine derselben Serie, `shifts` alle sichtbaren
 * der Firma. Beide dienen nur dazu, Rückfrage und Überschneidungen genau zu
 * machen; verbindlich gerechnet wird auf dem Server.
 */

/** Reihenfolgeunabhängig, sonst fände der Vergleich ein Paar nur halb. */
const paarSchluessel = (a, b) => (a <= b ? `${a}|${b}` : `${b}|${a}`);

export default function EditShiftForm({
  shift, seriesShifts = [], shifts = [], combinableSeries = [], qualifications, onSave, onCancel,
}) {
  const [name, setName] = useState(shift.name);
  const [date, setDate] = useState(shift.date);
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [seats, setSeats] = useState(shift.seats);
  const [qualificationId, setQualificationId] = useState(shift.qualificationId || "");
  const [umfang, setUmfang] = useState("einzeln");
  const [abDatum, setAbDatum] = useState(shift.date);
  const [freigaben, setFreigaben] = useState({});
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const wiederkehrend = shift.repeat !== "once";
  const nurDiese = !wiederkehrend || umfang === "einzeln";

  const betroffen = nurDiese ? [shift] : seriesShifts.filter((s) => s.date >= abDatum);
  const personen = betroffen.reduce((n, s) => n + s.enrolled.length, 0);

  const geaendert =
    betroffen.some(
      (s) =>
        s.name !== name.trim() ||
        s.startTime !== startTime ||
        s.endTime !== endTime ||
        Number(s.seats) !== Number(seats) ||
        (s.qualificationId || "") !== qualificationId
    ) || (nurDiese && date !== shift.date);

  /* Die Termine so, wie sie nach dem Speichern lägen — nur zum Vergleichen.
     Ein paar Dutzend Schichten, das rechnet sich bei jedem Tastendruck neu. */
  const geplant = nurDiese
    ? [{ id: shift.id, date, startTime, endTime }]
    : betroffen.map((s) => ({ id: s.id, date: s.date, startTime, endTime }));

  /* Womit verglichen wird. Beim Herauslösen zählen auch die bisherigen
     Geschwister mit: Der Termin ist danach eine eigene Serie und kann sich
     mit ihnen sehr wohl überschneiden. */
  const eigeneIds = new Set(geplant.map((g) => g.id));
  const andere = shifts.filter(
    (s) => !eigeneIds.has(s.id) && (nurDiese || s.seriesId !== shift.seriesId)
  );

  const ueberschneidungen = overlappingSeries(geplant, andere);

  const bereitsErlaubt = useMemo(
    () => new Set(combinableSeries.map(([a, b]) => paarSchluessel(a, b))),
    [combinableSeries]
  );

  /* Ohne eigene Wahl gilt, was schon eingetragen ist — sonst nähme jede
     Änderung eine früher erteilte Freigabe stillschweigend zurück. */
  const istErlaubt = (seriesId) =>
    freigaben[seriesId] ?? bereitsErlaubt.has(paarSchluessel(shift.seriesId, seriesId));

  const neueFreigabe = (seriesId) =>
    !bereitsErlaubt.has(paarSchluessel(shift.seriesId, seriesId));

  const pruefen = () => {
    if (!name.trim()) { setError("Bitte einen Namen angeben."); return; }
    if (!qualificationId) { setError("Bitte eine Qualifikation wählen."); return; }
    if (Number(seats) < 1) { setError("Mindestens ein Platz."); return; }
    if (nurDiese && !date) { setError("Bitte ein Datum angeben."); return; }
    if (!nurDiese && !abDatum) { setError("Bitte angeben, ab wann die Änderung gilt."); return; }
    setError("");
    setConfirming(true);
  };

  const speichern = async () => {
    setBusy(true);
    const meldung = await onSave(shift.id, {
      name: name.trim(),
      startTime,
      endTime,
      seats: Number(seats),
      qualificationId,
      umfang: nurDiese ? "einzeln" : "ab-datum",
      ...(nurDiese ? { date } : { abDatum }),
      // Vollständiger Stand für alles, was gerade dasteht — auch die Neins.
      combinable: Object.fromEntries(ueberschneidungen.map((u) => [u.seriesId, istErlaubt(u.seriesId)])),
    });
    setBusy(false);
    if (meldung) { setError(meldung); setConfirming(false); return; }
    onCancel();
  };

  const wenTrifftEs =
    personen === 0
      ? ""
      : personen === 1
        ? " Eine eingetragene Person wird ausgetragen."
        : ` ${personen} eingetragene Personen werden ausgetragen.`;

  const frage = !geaendert
    ? "An der Schicht selbst ändert sich nichts – nur die Freigaben werden gespeichert. Niemand wird ausgetragen."
    : nurDiese
      ? `Diese Schicht ändern?${wenTrifftEs}`
      : `${betroffen.length === 1 ? "Eine Schicht" : `${betroffen.length} Schichten`} der Serie ab dem ${abDatum} ändern?${wenTrifftEs}`;

  return (
    <div className="sb-edit-shift">
      <span className="sb-detail-label">Schicht bearbeiten</span>

      <div className="sb-form-grid">
        <label className="sb-field">
          <span>Name der Schicht</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setConfirming(false); }} />
        </label>
        {nurDiese && (
          <label className="sb-field">
            <span>Datum</span>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setConfirming(false); }} />
          </label>
        )}
        <label className="sb-field">
          <span>Startzeit</span>
          <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setConfirming(false); }} />
        </label>
        <label className="sb-field">
          <span>Endzeit</span>
          <input type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); setConfirming(false); }} />
        </label>
        <label className="sb-field">
          <span>Plätze</span>
          <input type="number" min="1" value={seats} onChange={(e) => { setSeats(e.target.value); setConfirming(false); }} />
        </label>
        <label className="sb-field">
          <span>Erforderliche Qualifikation</span>
          <select value={qualificationId} onChange={(e) => { setQualificationId(e.target.value); setConfirming(false); }}>
            <option value="">– bitte wählen –</option>
            {qualifications.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
        </label>
      </div>

      {wiederkehrend && (
        <div className="sb-form-grid">
          <label className="sb-field">
            <span>Gilt für</span>
            <select value={umfang} onChange={(e) => { setUmfang(e.target.value); setConfirming(false); }}>
              <option value="einzeln">Nur diese Schicht</option>
              <option value="ab-datum">Diese und alle späteren der Serie</option>
            </select>
          </label>
          {!nurDiese && (
            <label className="sb-field">
              <span>Änderungen gelten ab</span>
              <input type="date" value={abDatum} onChange={(e) => { setAbDatum(e.target.value); setConfirming(false); }} />
            </label>
          )}
        </div>
      )}

      {wiederkehrend && nurDiese && (
        <p className="sb-status">
          Dieser Termin löst sich damit aus der Serie. Die übrigen laufen unverändert weiter.
        </p>
      )}

      {/* Zeigt bestehende wie neue Überschneidungen. So lässt sich eine Freigabe
          auch nachträglich erteilen, ohne die Schicht neu anlegen zu müssen. */}
      {ueberschneidungen.length > 0 && (
        <div className="sb-overlap">
          <span className="sb-detail-label">Überschneidungen</span>
          <p className="sb-status">
            Ohne Freigabe kann niemand zwei davon gleichzeitig übernehmen.
            Eine Änderung hier trägt für sich allein niemanden aus.
          </p>
          {ueberschneidungen.map((u) => (
            <div key={u.seriesId} className="sb-overlap-row">
              <div className="sb-overlap-info">
                <span className="sb-overlap-name">
                  {u.name}
                  {neueFreigabe(u.seriesId) && geaendert && <span className="sb-overlap-neu">neu</span>}
                </span>
                <span className="sb-overlap-meta">
                  <span className="sb-mono">{u.startTime}–{u.endTime}</span>
                  {" · "}
                  {u.termine === 1 ? fmtDate(u.erster) : `${u.termine} Termine ab ${fmtDate(u.erster)}`}
                </span>
              </div>
              <label className="sb-field sb-field-compact">
                <span>Zusammen übernehmbar?</span>
                <select
                  value={istErlaubt(u.seriesId) ? "ja" : "nein"}
                  onChange={(e) => {
                    setFreigaben((f) => ({ ...f, [u.seriesId]: e.target.value === "ja" }));
                    setConfirming(false);
                  }}
                >
                  <option value="nein">Nein – schliessen einander aus</option>
                  <option value="ja">Ja – beides zusammen möglich</option>
                </select>
              </label>
            </div>
          ))}
        </div>
      )}

      <p className="sb-status">
        Eine geänderte Schicht ist eine andere Schicht: Sobald sich Name, Zeit, Datum, Plätze oder
        Qualifikation ändern, werden alle Ein- und Zugeteilten ausgetragen und die Schicht gilt
        wieder als frisch ausgeschrieben.
      </p>

      {error && <p className="sb-error">{error}</p>}

      <div className="sb-form-actions">
        {confirming ? (
          <span className="sb-confirm">
            <span>{frage}</span>
            <button type="button" className="sb-btn sb-btn-amber sb-btn-sm" onClick={speichern} disabled={busy}>
              {busy ? "Wird gespeichert …" : "Ja, speichern"}
            </button>
            <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setConfirming(false)}>
              Abbrechen
            </button>
          </span>
        ) : (
          <>
            <button type="button" className="sb-btn sb-btn-ink" onClick={pruefen}>Änderungen speichern</button>
            <button type="button" className="sb-btn sb-btn-quiet" onClick={onCancel}>Abbrechen</button>
          </>
        )}
      </div>
    </div>
  );
}

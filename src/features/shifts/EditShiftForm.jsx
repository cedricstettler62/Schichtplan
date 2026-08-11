import { useState } from "react";

/*
 * Eine bestehende Schicht ändern.
 *
 * Jede Änderung trägt alle Ein- und Zugeteilten aus — deshalb steht vor dem
 * Speichern eine Rückfrage, die beziffert, wen es trifft. Ein stiller Klick
 * mit demselben Ergebnis wäre nicht zu verantworten.
 *
 * `seriesShifts` sind alle Termine derselben Serie. Sie dienen nur dazu,
 * die Rückfrage genau zu machen; gerechnet wird auf dem Server.
 */
export default function EditShiftForm({ shift, seriesShifts = [], qualifications, onSave, onCancel }) {
  const [name, setName] = useState(shift.name);
  const [date, setDate] = useState(shift.date);
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [seats, setSeats] = useState(shift.seats);
  const [qualificationId, setQualificationId] = useState(shift.qualificationId || "");
  const [umfang, setUmfang] = useState("einzeln");
  const [abDatum, setAbDatum] = useState(shift.date);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const wiederkehrend = shift.repeat !== "once";
  const nurDiese = !wiederkehrend || umfang === "einzeln";

  const betroffen = nurDiese ? [shift] : seriesShifts.filter((s) => s.date >= abDatum);
  const personen = betroffen.reduce((n, s) => n + s.enrolled.length, 0);

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
    });
    setBusy(false);
    if (meldung) { setError(meldung); setConfirming(false); return; }
    onCancel();
  };

  const frage = nurDiese
    ? `Diese Schicht ändern?${personen > 0 ? ` ${personen === 1 ? "Eine eingetragene Person wird" : `${personen} eingetragene Personen werden`} ausgetragen.` : ""}`
    : `${betroffen.length === 1 ? "Eine Schicht" : `${betroffen.length} Schichten`} der Serie ab dem ${abDatum} ändern?${personen > 0 ? ` ${personen === 1 ? "Eine eingetragene Person wird" : `${personen} eingetragene Personen werden`} ausgetragen.` : ""}`;

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

      <p className="sb-status">
        Eine geänderte Schicht ist eine andere Schicht: Alle Ein- und Zugeteilten werden
        ausgetragen und die Schicht gilt wieder als frisch ausgeschrieben.
      </p>

      {error && <p className="sb-error">{error}</p>}

      <div className="sb-form-actions">
        {confirming ? (
          <span className="sb-confirm">
            <span>{frage}</span>
            <button type="button" className="sb-btn sb-btn-amber sb-btn-sm" onClick={speichern} disabled={busy}>
              {busy ? "Wird gespeichert …" : "Ja, ändern"}
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

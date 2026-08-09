import { useState } from "react";
import { REPEAT_LABELS, REPEAT_KEYS } from "#shared/labels.js";

export default function NewShiftForm({ qualifications, onCreate, onAddQualification }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [repeat, setRepeat] = useState("once");
  const [endDate, setEndDate] = useState("");
  const [seats, setSeats] = useState(1);
  const [qualificationId, setQualificationId] = useState("");
  const [newQualOpen, setNewQualOpen] = useState(false);
  const [newQual, setNewQual] = useState("");
  const [error, setError] = useState("");

  const addQualification = async () => {
    const trimmed = newQual.trim();
    if (!trimmed) return;
    const existing = qualifications.find((q) => q.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setQualificationId(existing.id);
    } else {
      const id = await onAddQualification(trimmed);
      if (id) setQualificationId(id);
    }
    setNewQual("");
    setNewQualOpen(false);
  };

  const submit = async () => {
    if (!name.trim() || !date || !qualificationId || seats < 1) {
      setError("Bitte Name, Datum, Qualifikation und eine gültige Platzzahl angeben.");
      return;
    }
    setError("");
    await onCreate({ name: name.trim(), date, startTime, endTime, repeat, endDate: endDate || null, seats: Number(seats), qualificationId });
    setName(""); setDate(""); setStartTime("08:00"); setEndTime("16:00"); setRepeat("once"); setEndDate(""); setSeats(1); setQualificationId("");
  };

  return (
    <div className="sb-card">
      <div className="sb-form-section">
        <span className="sb-detail-label">Was &amp; wann</span>
        <div className="sb-form-grid">
          <label className="sb-field">
            <span>Name der Schicht</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Spätschicht Verkauf" />
          </label>
          <label className="sb-field">
            <span>Datum</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="sb-field">
            <span>Startzeit</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="sb-field">
            <span>Endzeit</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="sb-form-section">
        <span className="sb-detail-label">Wiederholung</span>
        <div className="sb-form-grid">
          <label className="sb-field">
            <span>Wiederholt sich</span>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              {REPEAT_KEYS.map((key) => <option key={key} value={key}>{REPEAT_LABELS[key]}</option>)}
            </select>
          </label>
          {repeat !== "once" && (
            <label className="sb-field">
              <span>Enddatum (optional)</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          )}
        </div>
      </div>

      <div className="sb-form-section">
        <span className="sb-detail-label">Plätze &amp; Qualifikation</span>
        <div className="sb-form-grid">
          <label className="sb-field">
            <span>Plätze</span>
            <input type="number" min="1" value={seats} onChange={(e) => setSeats(e.target.value)} />
          </label>
          <label className="sb-field">
            <span>Erforderliche Qualifikation</span>
            <select value={qualificationId} onChange={(e) => setQualificationId(e.target.value)}>
              <option value="">– bitte wählen –</option>
              {qualifications.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </label>
          {!newQualOpen && (
            <div className="sb-field sb-field-btn">
              <button type="button" className="sb-btn sb-btn-quiet" onClick={() => setNewQualOpen(true)}>Qualifikation anlegen</button>
            </div>
          )}
        </div>
        {newQualOpen && (
          <div className="sb-inline-add">
            <input
              autoFocus
              value={newQual}
              onChange={(e) => setNewQual(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addQualification()}
              placeholder="Name der neuen Qualifikation"
            />
            <button type="button" className="sb-btn sb-btn-ink" onClick={addQualification}>Hinzufügen</button>
            <button type="button" className="sb-btn sb-btn-quiet" onClick={() => { setNewQualOpen(false); setNewQual(""); }}>Abbrechen</button>
          </div>
        )}
      </div>

      {error && <p className="sb-error">{error}</p>}
      <div className="sb-form-actions">
        <button type="button" className="sb-btn sb-btn-ink" onClick={submit}>Schicht anlegen</button>
      </div>
    </div>
  );
}

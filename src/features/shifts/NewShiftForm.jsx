import { useMemo, useState } from "react";
import OverlapRow from "../../components/OverlapRow.jsx";
import QualificationPicker from "../../components/QualificationPicker.jsx";
import { REPEAT_LABELS, REPEAT_KEYS } from "#shared/labels.js";
import { HORIZON_DAYS, expandShiftDates } from "#shared/assignment.js";
import { overlappingSeries } from "#shared/overlap.js";
import { addDays, startOfToday } from "#shared/dates.js";

export default function NewShiftForm({ qualifications, shifts = [], onCreate, onAddQualification }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [repeat, setRepeat] = useState("once");
  const [endDate, setEndDate] = useState("");
  const [seats, setSeats] = useState(1);
  const [qualificationIds, setQualificationIds] = useState([]);
  const [kombinierbar, setKombinierbar] = useState({});
  const [error, setError] = useState("");

  /* Dieselben Termine, die der Server anlegen würde — nur zum Vergleichen,
     nicht zum Speichern. Angelegt wird erst beim Absenden, und zwar dort. */
  const geplant = useMemo(() => {
    if (!date || !startTime || !endTime) return [];
    const horizon = addDays(startOfToday(), HORIZON_DAYS);
    return expandShiftDates({ date, repeat, endDate: endDate || null }, horizon)
      .map((d) => ({ id: null, seriesId: null, date: d, startTime, endTime }));
  }, [date, repeat, endDate, startTime, endTime]);

  const ueberschneidungen = useMemo(
    () => overlappingSeries(geplant, shifts),
    [geplant, shifts]
  );

  const submit = async () => {
    if (!name.trim() || !date || qualificationIds.length === 0 || seats < 1) {
      setError("Bitte Name, Datum, mindestens eine Qualifikation und eine gültige Platzzahl angeben.");
      return;
    }
    /* Ein Zeitfeld lässt sich leeren. Ohne Zeiten wird aus der Schicht eine über
       volle 24 Stunden, die sich mit allem an dem Tag überschneidet. */
    if (!startTime || !endTime) {
      setError("Bitte Start- und Endzeit angeben.");
      return;
    }
    setError("");
    const meldung = await onCreate({
      name: name.trim(), date, startTime, endTime, repeat, endDate: endDate || null,
      seats: Number(seats), qualificationIds,
      // Nur was jetzt auch wirklich als Überschneidung dasteht.
      combinableWith: ueberschneidungen.filter((u) => kombinierbar[u.seriesId]).map((u) => u.seriesId),
    });
    /* Erst leeren, wenn die Schicht wirklich angelegt wurde — sonst verschwindet
       das ausgefüllte Formular und es gibt nichts, worauf man aufsetzen könnte. */
    if (meldung) { setError(meldung); return; }
    setName(""); setDate(""); setStartTime("08:00"); setEndTime("16:00"); setRepeat("once");
    setEndDate(""); setSeats(1); setQualificationIds([]); setKombinierbar({});
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

      {/* Taucht nur auf, wenn es wirklich etwas zu entscheiden gibt. Wer keine
          Überschneidung baut, soll auch nicht danach gefragt werden. */}
      {ueberschneidungen.length > 0 && (
        <div className="sb-form-section sb-overlap">
          <span className="sb-detail-label">Überschneidungen</span>
          <p className="sb-status">
            {ueberschneidungen.length === 1
              ? "Eine bestehende Schicht liegt in derselben Zeit."
              : `${ueberschneidungen.length} bestehende Schichten liegen in derselben Zeit.`}{" "}
            Ohne ausdrückliche Freigabe kann niemand beide übernehmen.
          </p>
          {ueberschneidungen.map((u) => (
            <OverlapRow
              key={u.seriesId}
              serie={u}
              erlaubt={!!kombinierbar[u.seriesId]}
              onChange={(ja) => setKombinierbar((k) => ({ ...k, [u.seriesId]: ja }))}
            />
          ))}
        </div>
      )}

      <div className="sb-form-section">
        <span className="sb-detail-label">Plätze &amp; Qualifikationen</span>
        <div className="sb-form-grid">
          <label className="sb-field">
            <span>Plätze</span>
            <input type="number" min="1" value={seats} onChange={(e) => setSeats(e.target.value)} />
          </label>
        </div>
        <QualificationPicker
          qualifications={qualifications}
          gewaehlt={qualificationIds}
          onChange={setQualificationIds}
          onAddQualification={onAddQualification}
        />
      </div>

      {error && <p className="sb-error">{error}</p>}
      <div className="sb-form-actions">
        <button type="button" className="sb-btn sb-btn-ink" onClick={submit}>Schicht anlegen</button>
      </div>
    </div>
  );
}

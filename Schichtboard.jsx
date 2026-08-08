import React, { useState, useMemo, useRef } from "react";

/* ---------- Farb- & Schrift-Tokens ---------- */
const COLORS = {
  bg: "#F6F3EC",
  ink: "#1E2A38",
  amber: "#E2A33B",
  petrol: "#3F7C74",
  rust: "#C1543C",
};

let idSeq = 1000;
const uid = (prefix = "id") => `${prefix}${(idSeq += 1)}`;

/* ---------- Datumshilfen ---------- */
function pad(n) { return String(n).padStart(2, "0"); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtDate(iso) {
  const d = fromISO(iso);
  const wd = d.toLocaleDateString("de-DE", { weekday: "short" });
  return `${wd}. ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function shortDay(iso) { const d = fromISO(iso); return pad(d.getDate()); }
function shortMonth(iso) { const d = fromISO(iso); return d.toLocaleDateString("de-DE", { month: "short" }).replace(".", ""); }
function shortWeekday(iso) { const d = fromISO(iso); return d.toLocaleDateString("de-DE", { weekday: "short" }); }
function monthDiff(from, to) { return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()); }
function isFutureOrToday(iso, today) { return iso >= toISO(today); }

const REPEAT_LABELS = {
  once: "Einmalig",
  weekly: "Wöchentlich",
  weekday: "Jeden Arbeitstag",
  weekend: "Am Wochenende",
};

/* ---------- Zufallsauswahl ---------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Zuteilungslogik ---------- */
function hasQualification(accounts, userId, qualId) {
  const acc = accounts.find((a) => a.id === userId);
  return !!acc && !!qualId && acc.qualifications.includes(qualId);
}

function isAssignable(shiftDateISO, today, assignmentDay) {
  const sd = fromISO(shiftDateISO);
  const diff = monthDiff(today, sd);
  if (diff <= 0) return true;
  if (diff === 1 && today.getDate() >= assignmentDay) return true;
  return false;
}

function attemptAssign(shift, accounts, today, assignmentDay, force = false) {
  const assignableNow = force || isAssignable(shift.date, today, assignmentDay);
  if (!assignableNow) return shift;
  if (shift.assigned.length >= shift.seats) {
    return shift.assignmentAttempted ? shift : { ...shift, assignmentAttempted: true };
  }
  const eligible = shuffle(
    shift.enrolled.filter(
      (id) => !shift.assigned.includes(id) && hasQualification(accounts, id, shift.qualificationId)
    )
  );
  const needed = shift.seats - shift.assigned.length;
  const chosen = eligible.slice(0, needed);
  if (chosen.length === 0) {
    return { ...shift, assignmentAttempted: true };
  }
  return {
    ...shift,
    assigned: [...shift.assigned, ...chosen],
    assignmentAttempted: true,
    assignedAt: shift.assignedAt || toISO(today),
  };
}

function runAssignmentPass(shifts, accounts, today, assignmentDay, forceIds = []) {
  return shifts.map((s) => attemptAssign(s, accounts, today, assignmentDay, forceIds.includes(s.id)));
}

/* ---------- Schicht-Expansion (Wiederholung) ---------- */
function expandShift(form, horizonDate) {
  const start = fromISO(form.date);
  const seriesId = uid("serie");
  const limit = form.endDate ? fromISO(form.endDate) : horizonDate;
  const capped = limit < horizonDate ? limit : horizonDate;
  const make = (d) => ({
    id: uid("s"),
    seriesId,
    name: form.name,
    date: toISO(d),
    startTime: form.startTime,
    endTime: form.endTime,
    repeat: form.repeat,
    seats: form.seats,
    qualificationId: form.qualificationId,
    enrolled: [],
    assigned: [],
    helpRequests: [],
    assignmentAttempted: false,
    assignedAt: null,
  });
  const out = [];
  if (form.repeat === "once") {
    if (start <= capped) out.push(make(start));
  } else if (form.repeat === "weekly") {
    let d = new Date(start);
    while (d <= capped) { out.push(make(new Date(d))); d = addDays(d, 7); }
  } else if (form.repeat === "weekday") {
    let d = new Date(start);
    while (d <= capped) { const wd = d.getDay(); if (wd >= 1 && wd <= 5) out.push(make(new Date(d))); d = addDays(d, 1); }
  } else if (form.repeat === "weekend") {
    let d = new Date(start);
    while (d <= capped) { const wd = d.getDay(); if (wd === 0 || wd === 6) out.push(make(new Date(d))); d = addDays(d, 1); }
  }
  return out;
}

/* ---------- Seed-Daten ---------- */
function buildSeed() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const qualifications = [
    { id: "q1", name: "Erste Hilfe" },
    { id: "q2", name: "Kassensystem" },
    { id: "q3", name: "Lagerlogistik" },
    { id: "q4", name: "Nachtschicht" },
  ];
  const accounts = [
    { id: "a1", name: "Mara Vogt", email: "mara@firma.ch", password: "12345", role: "admin", qualifications: ["q1", "q2"] },
    { id: "a3", name: "Lea Brunner", email: "lea@firma.ch", password: "12345", role: "employee", qualifications: ["q1", "q2"] },
  ];

  const shifts = [];

  const assignmentDay = 7;
  const processed = runAssignmentPass(shifts, accounts, today, assignmentDay);

  const companies = [
    { id: uid("c"), code: "111111", name: "Erste Firma AG", qualifications, accounts, shifts: processed, settings: { assignmentDay } },
  ];

  return { today, companies };
}

const SUPER_ADMIN = { code: "000000", name: "Kira X", password: "123456" };

/* ---------- Kleine UI-Bausteine ---------- */
function Badge({ tone = "ink", children }) {
  return <span className={`sb-badge sb-badge-${tone}`}>{children}</span>;
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" className={`sb-chip ${active ? "sb-chip-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function DateStub({ iso }) {
  return (
    <div className="sb-date-stub">
      <div className="sb-date-wd">{shortWeekday(iso)}</div>
      <div className="sb-date-day">{shortDay(iso)}</div>
      <div className="sb-date-mo">{shortMonth(iso)}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="sb-toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className={`sb-toggle ${checked ? "sb-toggle-on" : ""}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span className="sb-toggle-knob" />
      </button>
    </label>
  );
}

function ConfirmDelete({ onConfirm, label = "Löschen" }) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <span className="sb-confirm">
        <span>Sicher?</span>
        <button type="button" className="sb-link-btn sb-link-rust" onClick={() => { onConfirm(); setAsking(false); }}>Ja</button>
        <button type="button" className="sb-link-btn" onClick={() => setAsking(false)}>Nein</button>
      </span>
    );
  }
  return <button type="button" className="sb-icon-btn" title={label} onClick={() => setAsking(true)}>×</button>;
}

/* ---------- Login ---------- */
function CompanyLoginScreen({ companies, superAdmin, onLogin }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!/^\d{6}$/.test(code.trim())) { setError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    if (!name.trim() || !password.trim()) { setError("Bitte Name und Passwort eingeben."); return; }
    const trimmedCode = code.trim();
    const trimmedName = name.trim().toLowerCase();

    if (trimmedCode === superAdmin.code) {
      if (trimmedName === superAdmin.name.trim().toLowerCase() && password === superAdmin.password) {
        setError("");
        onLogin({ type: "super" });
        return;
      }
      setError("Name oder Passwort ist falsch.");
      return;
    }

    const company = companies.find((c) => c.code === trimmedCode);
    if (!company) { setError("Unbekannter Firmencode."); return; }
    const account = company.accounts.find(
      (a) => a.name.trim().toLowerCase() === trimmedName && a.password === password
    );
    if (!account) { setError("Name oder Passwort ist falsch."); return; }
    setError("");
    onLogin({ type: "company", companyId: company.id, userId: account.id });
  };

  const handleKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="sb-login-wrap">
      <div className="sb-login-head">
        <h1 className="sb-app-title">Schichtboard</h1>
        <p className="sb-login-sub">Anmelden, um fortzufahren</p>
      </div>
      <div className="sb-card sb-login-card">
        <div className="sb-form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label className="sb-field">
            <span>Firmencode (6-stellig)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={handleKey}
              placeholder="z. B. 111111"
              inputMode="numeric"
              className="sb-mono"
            />
          </label>
          <label className="sb-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKey} placeholder="Vor- und Nachname" />
          </label>
          <label className="sb-field">
            <span>Passwort</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKey} />
          </label>
        </div>
        {error && <p className="sb-error">{error}</p>}
        <button type="button" className="sb-btn sb-btn-ink sb-login-btn" onClick={submit}>Anmelden</button>
      </div>
    </div>
  );
}

/* ---------- Übersicht ---------- */
function CollapsibleBar({ title, count, tone, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sb-bar">
      <button type="button" className={`sb-bar-head sb-bar-${tone}`} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="sb-bar-count">{count}</span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="sb-bar-body">{count === 0 ? <p className="sb-empty">Nichts zu sehen.</p> : children}</div>}
    </div>
  );
}

function OverviewShiftRow({ shift, qualifications, accounts, currentUser, onTakeOver, requesterIds }) {
  const [open, setOpen] = useState(false);
  const qual = qualifications.find((q) => q.id === shift.qualificationId);
  const canTake =
    currentUser.role === "employee" &&
    hasQualification(accounts, currentUser.id, shift.qualificationId) &&
    !shift.assigned.includes(currentUser.id);

  return (
    <div className="sb-ov-row">
      <button type="button" className="sb-ov-row-head" onClick={() => setOpen((o) => !o)}>
        <DateStub iso={shift.date} />
        <div className="sb-ov-row-main">
          <div className="sb-ov-row-title">{shift.name}</div>
          <div className="sb-ov-row-sub">{shift.startTime}–{shift.endTime} · {qual ? qual.name : "– keine Qualifikation –"} · {shift.assigned.length}/{shift.seats} Plätze</div>
        </div>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-ov-row-detail">
          {requesterIds && requesterIds.length > 0 ? (
            requesterIds.map((rid) => {
              const person = accounts.find((a) => a.id === rid);
              return (
                <div key={rid} className="sb-ov-help-line">
                  <span>Hilfegesuch von <strong>{person ? person.name : "?"}</strong></span>
                  {canTake && (
                    <button type="button" className="sb-btn sb-btn-petrol" onClick={() => onTakeOver(shift.id, currentUser.id, rid)}>
                      Für {person ? person.name.split(" ")[0] : ""} übernehmen
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            canTake ? (
              <button type="button" className="sb-btn sb-btn-petrol" onClick={() => onTakeOver(shift.id, currentUser.id, null)}>
                Schicht übernehmen
              </button>
            ) : (
              <p className="sb-empty">Keine passende, freie Übernahme möglich.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}

function OverviewTab({ shifts, qualifications, accounts, currentUser, today, onTakeOver }) {
  const future = shifts.filter((s) => isFutureOrToday(s.date, today));
  const openShifts = future.filter((s) => s.assigned.length < s.seats);
  const helpRequests = future.filter((s) => s.helpRequests.length > 0);

  return (
    <div className="sb-tab">
      <p className="sb-tab-intro">Ein gemeinsamer Feed für alle: offene Schichten, unbesetzte Zuteilungen und Hilfegesuche.</p>
      <CollapsibleBar title="Unbesetzte Schichten" count={openShifts.length} tone="amber">
        {openShifts.map((s) => (
          <OverviewShiftRow key={s.id} shift={s} qualifications={qualifications} accounts={accounts} currentUser={currentUser} onTakeOver={onTakeOver} />
        ))}
      </CollapsibleBar>
      <CollapsibleBar title="Hilfegesuche" count={helpRequests.length} tone="petrol">
        {helpRequests.map((s) => (
          <OverviewShiftRow key={s.id} shift={s} qualifications={qualifications} accounts={accounts} currentUser={currentUser} onTakeOver={onTakeOver} requesterIds={s.helpRequests} />
        ))}
      </CollapsibleBar>
    </div>
  );
}

/* ---------- Schicht-Formular (Admin) ---------- */
function NewShiftForm({ qualifications, onCreate, onAddQualification }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [repeat, setRepeat] = useState("once");
  const [endDate, setEndDate] = useState("");
  const [seats, setSeats] = useState(1);
  const [qualificationId, setQualificationId] = useState("");
  const [newQual, setNewQual] = useState("");
  const [error, setError] = useState("");

  const handleNewQualKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = newQual.trim();
      if (!trimmed) return;
      const existing = qualifications.find((q) => q.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) { setQualificationId(existing.id); }
      else { const id = onAddQualification(trimmed); setQualificationId(id); }
      setNewQual("");
    }
  };

  const submit = () => {
    if (!name.trim() || !date || !qualificationId || seats < 1) {
      setError("Bitte Name, Datum, Qualifikation und eine gültige Platzzahl angeben.");
      return;
    }
    setError("");
    onCreate({ name: name.trim(), date, startTime, endTime, repeat, endDate: endDate || null, seats: Number(seats), qualificationId });
    setName(""); setDate(""); setStartTime("08:00"); setEndTime("16:00"); setRepeat("once"); setEndDate(""); setSeats(1); setQualificationId("");
  };

  return (
    <div className="sb-card sb-form">
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
        <label className="sb-field">
          <span>Wiederholung</span>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
            <option value="once">Einmalig</option>
            <option value="weekly">Wöchentlich</option>
            <option value="weekday">Jeden Arbeitstag</option>
            <option value="weekend">Am Wochenende</option>
          </select>
        </label>
        {repeat !== "once" && (
          <label className="sb-field">
            <span>Enddatum (optional)</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        )}
        <label className="sb-field">
          <span>Plätze</span>
          <input type="number" min="1" value={seats} onChange={(e) => setSeats(e.target.value)} />
        </label>
        <label className="sb-field">
          <span>Erforderliche Qualifikation</span>
          <select value={qualificationId} onChange={(e) => setQualificationId(e.target.value)}>
            <option value="">– wählen –</option>
            {qualifications.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
        </label>
        <label className="sb-field">
          <span>Oder neue Qualifikation (Enter)</span>
          <input value={newQual} onChange={(e) => setNewQual(e.target.value)} onKeyDown={handleNewQualKey} placeholder="Name eingeben, Enter drücken" />
        </label>
      </div>
      {error && <p className="sb-error">{error}</p>}
      <button type="button" className="sb-btn sb-btn-ink" onClick={submit}>Schicht anlegen</button>
    </div>
  );
}

/* ---------- Admin: Schichten-Tab ---------- */
function AdminShiftsTab({ shifts, qualifications, accounts, today, settings, onCreate, onAddQualification, onForceAssign }) {
  const [formOpen, setFormOpen] = useState(false);
  const [status, setStatus] = useState("all");
  const [qualFilter, setQualFilter] = useState([]);

  const horizon = addDays(today, 92);
  const visible = shifts.filter((s) => isFutureOrToday(s.date, today) && fromISO(s.date) <= horizon);

  const filtered = visible.filter((s) => {
    if (status === "assigned" && s.assigned.length < s.seats) return false;
    if (status === "open" && s.assigned.length >= s.seats) return false;
    if (status === "future" && monthDiff(today, fromISO(s.date)) < 2) return false;
    if (qualFilter.length > 0 && !qualFilter.includes(s.qualificationId)) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const toggleQual = (id) => setQualFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  return (
    <div className="sb-tab">
      <div className="sb-tab-toolbar">
        <button type="button" className="sb-btn sb-btn-amber" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Formular schliessen" : "+ Neue Schicht"}
        </button>
      </div>
      {formOpen && <NewShiftForm qualifications={qualifications} onCreate={(f) => { onCreate(f); setFormOpen(false); }} onAddQualification={onAddQualification} />}

      <div className="sb-filter-row">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="sb-select-inline">
          <option value="all">Alle</option>
          <option value="assigned">Zugeteilt</option>
          <option value="open">Offen</option>
          <option value="future">Zukünftige Schichten</option>
        </select>
        <div className="sb-chip-row">
          {qualifications.map((q) => (
            <Chip key={q.id} active={qualFilter.includes(q.id)} onClick={() => toggleQual(q.id)}>{q.name}</Chip>
          ))}
        </div>
      </div>

      <div className="sb-shift-list">
        {filtered.length === 0 && <p className="sb-empty">Keine Schichten für diese Filter.</p>}
        {filtered.map((s) => {
          const qual = qualifications.find((q) => q.id === s.qualificationId);
          const full = s.assigned.length >= s.seats;
          return (
            <div key={s.id} className="sb-ticket">
              <DateStub iso={s.date} />
              <div className="sb-ticket-body">
                <div className="sb-ticket-top">
                  <span className="sb-ticket-name">{s.name}</span>
                  <Badge tone={full ? "petrol" : "amber"}>{full ? "Zugeteilt" : "Offen"}</Badge>
                </div>
                <div className="sb-ticket-meta">
                  <span className="sb-mono">{s.startTime}–{s.endTime}</span>
                  <span>{qual ? qual.name : "– keine Qualifikation –"}</span>
                  <span>{s.assigned.length}/{s.seats} Plätze</span>
                  <span>{s.enrolled.length} eingeschrieben</span>
                  <span>{REPEAT_LABELS[s.repeat]}</span>
                </div>
              </div>
              {!full && (
                <button type="button" className="sb-btn sb-btn-petrol sb-ticket-action" onClick={() => onForceAssign(s.id)}>
                  Jetzt zuteilen
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Mitarbeiter: Schichten-Tab ---------- */
function EmployeeShiftsTab({ shifts, qualifications, accounts, currentUser, today, onToggleEnroll }) {
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [onlyEnrolled, setOnlyEnrolled] = useState(false);
  const [qualFilter, setQualFilter] = useState([]);
  const [enrollError, setEnrollError] = useState(null); // { shiftId, message }

  const base = shifts.filter((s) => isFutureOrToday(s.date, today) && monthDiff(today, fromISO(s.date)) >= 1);
  const visible = onlyEnrolled
    ? base.filter((s) => s.enrolled.includes(currentUser.id))
    : base.filter((s) => s.assigned.length < s.seats);

  const filtered = visible.filter((s) => {
    if (onlyMatching && !hasQualification(accounts, currentUser.id, s.qualificationId)) return false;
    if (qualFilter.length > 0 && !qualFilter.includes(s.qualificationId)) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const toggleQual = (id) => setQualFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const handleClick = (s, qualified, enrolled, qualName) => {
    if (!qualified && !enrolled) {
      setEnrollError({ shiftId: s.id, message: `Du kannst dich für diese Schicht nicht einschreiben, da du in ${qualName || "der erforderlichen Qualifikation"} nicht ausgebildet bist.` });
      return;
    }
    setEnrollError(null);
    onToggleEnroll(s.id);
  };

  return (
    <div className="sb-tab">
      <p className="sb-tab-intro">Offene Schichten ab dem nächsten Monat. Einschreiben reicht – die Zuteilung erfolgt automatisch.</p>
      <div className="sb-filter-row">
        <label className="sb-checkbox-row">
          <input type="checkbox" checked={onlyMatching} onChange={(e) => setOnlyMatching(e.target.checked)} />
          <span>Nur mit passender Ausbildung</span>
        </label>
        <label className="sb-checkbox-row">
          <input type="checkbox" checked={onlyEnrolled} onChange={(e) => setOnlyEnrolled(e.target.checked)} />
          <span>Nur eigene Einschreibungen</span>
        </label>
        <div className="sb-chip-row">
          {qualifications.map((q) => (
            <Chip key={q.id} active={qualFilter.includes(q.id)} onClick={() => toggleQual(q.id)}>{q.name}</Chip>
          ))}
        </div>
      </div>

      <div className="sb-shift-list">
        {filtered.length === 0 && <p className="sb-empty">Keine offenen Schichten für diese Filter.</p>}
        {filtered.map((s) => {
          const qual = qualifications.find((q) => q.id === s.qualificationId);
          const enrolled = s.enrolled.includes(currentUser.id);
          const qualified = hasQualification(accounts, currentUser.id, s.qualificationId);
          return (
            <div key={s.id}>
              <div className="sb-ticket">
                <DateStub iso={s.date} />
                <div className="sb-ticket-body">
                  <div className="sb-ticket-top">
                    <span className="sb-ticket-name">{s.name}</span>
                    {!qualified && <Badge tone="rust">Ausbildung fehlt</Badge>}
                  </div>
                  <div className="sb-ticket-meta">
                    <span className="sb-mono">{s.startTime}–{s.endTime}</span>
                    <span>{qual ? qual.name : "–"}</span>
                    <span>{s.seats - s.assigned.length} von {s.seats} frei</span>
                    <span>{REPEAT_LABELS[s.repeat]}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`sb-btn sb-ticket-action ${enrolled ? "sb-btn-rust" : "sb-btn-petrol"}`}
                  onClick={() => handleClick(s, qualified, enrolled, qual ? qual.name : null)}
                >
                  {enrolled ? "Abmelden" : "Einschreiben"}
                </button>
              </div>
              {enrollError && enrollError.shiftId === s.id && <p className="sb-error sb-ticket-error">{enrollError.message}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Meine Schichten ---------- */
function MyShiftsTab({ shifts, qualifications, currentUser, today, onAskForHelp }) {
  const mine = shifts
    .filter((s) => s.assigned.includes(currentUser.id) && isFutureOrToday(s.date, today))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="sb-tab">
      <p className="sb-tab-intro">Deine zugeteilten Schichten.</p>
      {mine.length === 0 && <p className="sb-empty">Aktuell bist du keiner Schicht zugeteilt.</p>}
      <div className="sb-myshifts-list">
        {mine.map((s) => <MyShiftRow key={s.id} shift={s} qualifications={qualifications} currentUser={currentUser} onAskForHelp={onAskForHelp} />)}
      </div>
    </div>
  );
}

function MyShiftRow({ shift, qualifications, currentUser, onAskForHelp }) {
  const [open, setOpen] = useState(false);
  const qual = qualifications.find((q) => q.id === shift.qualificationId);
  const askedForHelp = shift.helpRequests.includes(currentUser.id);
  return (
    <div className="sb-myshift">
      <button type="button" className="sb-myshift-row" onClick={() => setOpen((o) => !o)}>
        <span className="sb-myshift-name">{shift.name}</span>
        <span className="sb-mono">{fmtDate(shift.date)}</span>
        <span className="sb-mono">{shift.startTime}–{shift.endTime}</span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-myshift-detail">
          <div className="sb-detail-grid">
            <div><span className="sb-detail-label">Ausbildung</span><br />{qual ? qual.name : "–"}</div>
            <div><span className="sb-detail-label">Wiederholung</span><br />{REPEAT_LABELS[shift.repeat]}</div>
            <div><span className="sb-detail-label">Plätze</span><br />{shift.assigned.length}/{shift.seats}</div>
            <div><span className="sb-detail-label">Zuteilungsdatum</span><br />{shift.assignedAt ? fmtDate(shift.assignedAt) : "–"}</div>
          </div>
          <button
            type="button"
            className={`sb-btn ${askedForHelp ? "sb-btn-rust" : "sb-btn-amber"}`}
            onClick={() => onAskForHelp(shift.id)}
          >
            {askedForHelp ? "Hilfegesuch zurückziehen" : "Um Hilfe bitten"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Passwort ändern (mit Verifizierung) ---------- */
function PasswordChangeForm({ currentUser, onChangePassword }) {
  const [currentPw, setCurrentPw] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verified, setVerified] = useState(false);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);

  const submitVerify = () => {
    if (currentPw !== currentUser.password) { setVerifyError("Das aktuelle Passwort ist falsch."); setVerified(false); return; }
    setVerifyError("");
    setVerified(true);
  };

  const submitPassword = () => {
    if (!pw1.trim() || pw1.length < 4) { setPwError("Das Passwort muss mindestens 4 Zeichen haben."); setPwSaved(false); return; }
    if (pw1 !== pw2) { setPwError("Die Passwörter stimmen nicht überein."); setPwSaved(false); return; }
    setPwError("");
    onChangePassword(pw1);
    setPw1(""); setPw2(""); setCurrentPw(""); setVerified(false);
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2000);
  };

  return (
    <div className="sb-card sb-form">
      <h3 className="sb-subheading">Passwort ändern</h3>
      <div className="sb-form-grid">
        <label className="sb-field">
          <span>Aktuelles Passwort</span>
          <input
            type="password"
            value={currentPw}
            onChange={(e) => { setCurrentPw(e.target.value); setVerified(false); setVerifyError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitVerify()}
          />
        </label>
        {!verified && <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitVerify}>Bestätigen</button></div>}
      </div>
      {verifyError && <p className="sb-error">{verifyError}</p>}

      {verified && (
        <div className="sb-password-expand">
          <div className="sb-form-grid">
            <label className="sb-field"><span>Neues Passwort</span><input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitPassword()} /></label>
            <label className="sb-field"><span>Wiederholen</span><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitPassword()} /></label>
            <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitPassword}>Speichern</button></div>
          </div>
          {pwError && <p className="sb-error">{pwError}</p>}
        </div>
      )}
      {pwSaved && <span className="sb-saved-note">Passwort gespeichert.</span>}
    </div>
  );
}

function AccountTab({ currentUser, qualifications, onToggleQualification, onChangePassword }) {
  return (
    <div className="sb-tab">
      <div className="sb-card">
        <div className="sb-account-head">
          <div className={`sb-avatar sb-avatar-${currentUser.role}`}>
            {currentUser.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="sb-account-name-lg">{currentUser.name}</div>
            <div className="sb-account-email">{currentUser.email}</div>
          </div>
        </div>
        <h3 className="sb-subheading">Meine Ausbildung</h3>
        {qualifications.length === 0 && <p className="sb-empty">Noch keine Qualifikationen im System.</p>}
        {qualifications.map((q) => (
          <Toggle
            key={q.id}
            label={q.name}
            checked={currentUser.qualifications.includes(q.id)}
            onChange={(val) => onToggleQualification(q.id, val)}
          />
        ))}
      </div>

      <PasswordChangeForm currentUser={currentUser} onChangePassword={onChangePassword} />
    </div>
  );
}

/* ---------- Mitarbeitende (Admin) ---------- */
function EmailChangeForm({ verifyingUser, initialEmail, onSave }) {
  const [currentPw, setCurrentPw] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verified, setVerified] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [saved, setSaved] = useState(false);

  const submitVerify = () => {
    if (currentPw !== verifyingUser.password) { setVerifyError("Das Passwort ist falsch."); setVerified(false); return; }
    setVerifyError("");
    setVerified(true);
  };

  const submitEmail = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setSaved(true);
    setCurrentPw(""); setVerified(false);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div>
      <div className="sb-form-grid">
        <label className="sb-field">
          <span>Passwort zur Bestätigung</span>
          <input
            type="password"
            value={currentPw}
            onChange={(e) => { setCurrentPw(e.target.value); setVerified(false); setVerifyError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitVerify()}
          />
        </label>
        {!verified && <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitVerify}>Bestätigen</button></div>}
      </div>
      {verifyError && <p className="sb-error">{verifyError}</p>}

      {verified && (
        <div className="sb-password-expand">
          <div className="sb-form-grid">
            <label className="sb-field">
              <span>E-Mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmail()} />
            </label>
            <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitEmail}>E-Mail speichern</button></div>
          </div>
        </div>
      )}
      {saved && <span className="sb-saved-note">Gespeichert.</span>}
    </div>
  );
}
function EmployeeManageRow({ account, qualifications, adminUser, onUpdateEmail, onSetQualification, onDeleteAccount, onPromote }) {
  const [open, setOpen] = useState(false);
  const [confirmingPromote, setConfirmingPromote] = useState(false);

  return (
    <div className="sb-manage-row">
      <button type="button" className="sb-manage-row-head" onClick={() => setOpen((o) => !o)}>
        <div className={`sb-avatar sb-avatar-${account.role}`} style={{ width: 34, height: 34, fontSize: 12 }}>
          {account.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <span className="sb-manage-name">{account.name}</span>
        <Badge tone="petrol">Mitarbeiter</Badge>
        <span className="sb-manage-email">{account.email}</span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-manage-row-body">
          <h4 className="sb-detail-label" style={{ marginBottom: 4 }}>E-Mail ändern (Bestätigung mit deinem Admin-Passwort)</h4>
          <EmailChangeForm verifyingUser={adminUser} initialEmail={account.email} onSave={(email) => onUpdateEmail(account.id, email)} />

          <h4 className="sb-detail-label" style={{ marginTop: 14, marginBottom: 4 }}>Qualifikationen</h4>
          {qualifications.length === 0 && <p className="sb-empty">Noch keine Qualifikationen im System.</p>}
          {qualifications.map((q) => (
            <Toggle
              key={q.id}
              label={q.name}
              checked={account.qualifications.includes(q.id)}
              onChange={(val) => onSetQualification(account.id, q.id, val)}
            />
          ))}

          <div className="sb-manage-actions">
            {confirmingPromote ? (
              <span className="sb-confirm">
                <span>{account.name} zum Admin befördern?</span>
                <button type="button" className="sb-btn sb-btn-amber" onClick={() => { onPromote(account.id); setConfirmingPromote(false); }}>Ja, befördern</button>
                <button type="button" className="sb-link-btn" onClick={() => setConfirmingPromote(false)}>Abbrechen</button>
              </span>
            ) : (
              <button type="button" className="sb-btn sb-btn-amber" onClick={() => setConfirmingPromote(true)}>Zum Admin befördern</button>
            )}
            <DeleteAccountButton onConfirm={() => onDeleteAccount(account.id)} />
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteAccountButton({ onConfirm }) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <span className="sb-confirm">
        <span>Konto wirklich löschen?</span>
        <button type="button" className="sb-btn sb-btn-rust" onClick={() => { onConfirm(); setAsking(false); }}>Ja, löschen</button>
        <button type="button" className="sb-link-btn" onClick={() => setAsking(false)}>Abbrechen</button>
      </span>
    );
  }
  return <button type="button" className="sb-btn sb-btn-rust" onClick={() => setAsking(true)}>Konto löschen</button>;
}

function EmployeesTab({ accounts, qualifications, currentUser, onAddEmployee, onAddQualification, onDeleteQualification, onUpdateEmail, onSetQualification, onDeleteAccount, onPromote }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newQual, setNewQual] = useState("");
  const [error, setError] = useState("");

  const submitEmployee = () => {
    if (!name.trim() || !email.trim() || !password.trim()) { setError("Bitte alle Felder ausfüllen."); return; }
    setError("");
    onAddEmployee({ name: name.trim(), email: email.trim(), password: password.trim() });
    setName(""); setEmail(""); setPassword("");
  };

  const addQual = () => {
    const trimmed = newQual.trim();
    if (!trimmed) return;
    if (qualifications.some((q) => q.name.toLowerCase() === trimmed.toLowerCase())) { setNewQual(""); return; }
    onAddQualification(trimmed);
    setNewQual("");
  };

  return (
    <div className="sb-tab">
      <div className="sb-card">
        <h3 className="sb-subheading">Qualifikationen verwalten</h3>
        <div className="sb-chip-row">
          {qualifications.map((q) => (
            <span key={q.id} className="sb-qual-manage-chip">
              {q.name}
              <ConfirmDelete onConfirm={() => onDeleteQualification(q.id)} />
            </span>
          ))}
        </div>
        <div className="sb-inline-add">
          <input value={newQual} onChange={(e) => setNewQual(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addQual()} placeholder="Neue Qualifikation" />
          <button type="button" className="sb-btn sb-btn-ink" onClick={addQual}>Hinzufügen</button>
        </div>
      </div>

      <div className="sb-card sb-form">
        <h3 className="sb-subheading">Neue Mitarbeitende anlegen</h3>
        <div className="sb-form-grid">
          <label className="sb-field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} /></label>
          <label className="sb-field"><span>E-Mail</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} /></label>
          <label className="sb-field"><span>Passwort</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmployee()} /></label>
          <div className="sb-field sb-field-btn"><button type="button" className="sb-btn sb-btn-ink" onClick={submitEmployee}>Anlegen</button></div>
        </div>
        {error && <p className="sb-error">{error}</p>}
      </div>

      <div className="sb-card">
        <h3 className="sb-subheading">Mitarbeitende verwalten</h3>
        <div className="sb-manage-list">
          {accounts.filter((a) => a.role === "employee").length === 0 && <p className="sb-empty">Keine Mitarbeitenden vorhanden.</p>}
          {accounts.filter((a) => a.role === "employee").map((a) => (
            <EmployeeManageRow
              key={a.id}
              account={a}
              qualifications={qualifications}
              adminUser={currentUser}
              onUpdateEmail={onUpdateEmail}
              onSetQualification={onSetQualification}
              onDeleteAccount={onDeleteAccount}
              onPromote={onPromote}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Einstellungen (Admin) ---------- */
function SettingsTab({ settings, onChangeAssignmentDay, currentUser, canDeleteSelf, onUpdateOwnEmail, onChangeOwnPassword, onDeleteOwnAccount }) {
  const [value, setValue] = useState(settings.assignmentDay);
  const [saved, setSaved] = useState(false);

  const save = () => {
    const n = Math.min(28, Math.max(1, Number(value) || 1));
    onChangeAssignmentDay(n);
    setValue(n);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="sb-tab">
      <div className="sb-card sb-form">
        <h3 className="sb-subheading">Zuteilungstag</h3>
        <p className="sb-tab-intro">An diesem Tag jedes Monats werden alle Schichten des Folgemonats automatisch zugeteilt, sobald jemand eingeschrieben ist.</p>
        <div className="sb-inline-add">
          <input type="number" min="1" max="28" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} style={{ width: "90px" }} />
          <button type="button" className="sb-btn sb-btn-ink" onClick={save}>Speichern</button>
          {saved && <span className="sb-saved-note">Gespeichert.</span>}
        </div>
      </div>

      <div className="sb-card sb-form">
        <h3 className="sb-subheading">Mein Konto – E-Mail ändern</h3>
        <EmailChangeForm verifyingUser={currentUser} initialEmail={currentUser.email} onSave={onUpdateOwnEmail} />
      </div>

      <PasswordChangeForm currentUser={currentUser} onChangePassword={onChangeOwnPassword} />

      <div className="sb-card">
        <h3 className="sb-subheading">Konto löschen</h3>
        {canDeleteSelf ? (
          <>
            <p className="sb-tab-intro">Dies löscht dein eigenes Admin-Konto unwiderruflich.</p>
            <DeleteAccountButton onConfirm={onDeleteOwnAccount} />
          </>
        ) : (
          <p className="sb-empty">Das letzte Admin-Konto kann nicht gelöscht werden.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Super-Admin: Unternehmensverwaltung ---------- */
function NewCompanyForm({ onCreate }) {
  const [companyName, setCompanyName] = useState("");
  const [code, setCode] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const trimmedCode = code.trim();
    if (!companyName.trim()) { setError("Bitte einen Namen für das Unternehmen angeben."); return; }
    if (!/^\d{6}$/.test(trimmedCode)) { setError("Bitte einen 6-stelligen Firmencode eingeben."); return; }
    if (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) { setError("Bitte alle Admin-Zugangsdaten ausfüllen."); return; }
    setError("");
    onCreate({ name: companyName.trim(), code: trimmedCode, adminName: adminName.trim(), adminEmail: adminEmail.trim(), adminPassword: adminPassword.trim() }, (err) => setError(err));
    setCompanyName(""); setCode(""); setAdminName(""); setAdminEmail(""); setAdminPassword("");
  };

  return (
    <div className="sb-card sb-form">
      <h3 className="sb-subheading">Neues Unternehmen hinzufügen</h3>
      <div className="sb-form-grid">
        <label className="sb-field">
          <span>Name des Unternehmens</span>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="z. B. Muster GmbH" />
        </label>
        <label className="sb-field">
          <span>Firmencode (6-stellig)</span>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="z. B. 222222" className="sb-mono" inputMode="numeric" />
        </label>
        <label className="sb-field"><span>Name (Admin)</span><input value={adminName} onChange={(e) => setAdminName(e.target.value)} /></label>
        <label className="sb-field"><span>E-Mail (Admin)</span><input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></label>
        <label className="sb-field"><span>Passwort (Admin)</span><input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} /></label>
      </div>
      {error && <p className="sb-error">{error}</p>}
      <button type="button" className="sb-btn sb-btn-ink" onClick={submit}>Unternehmen anlegen</button>
    </div>
  );
}

function CompanyRow({ company, onDelete, onUpdateName }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(company.name);
  const [saved, setSaved] = useState(false);
  const admins = company.accounts.filter((a) => a.role === "admin").length;
  const employees = company.accounts.filter((a) => a.role === "employee").length;

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onUpdateName(company.id, trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="sb-manage-row">
      <button type="button" className="sb-manage-row-head" onClick={() => setOpen((o) => !o)}>
        <span className="sb-manage-name">{company.name}</span>
        <span className="sb-manage-email sb-mono">{company.code}</span>
        <span className="sb-manage-email">{admins} Admin{admins === 1 ? "" : "s"} · {employees} Mitarbeitende</span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-manage-row-body">
          <div className="sb-inline-add">
            <label className="sb-field" style={{ flex: 1 }}>
              <span>Name des Unternehmens</span>
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
            </label>
            <button type="button" className="sb-btn sb-btn-ink" onClick={saveName}>Speichern</button>
            {saved && <span className="sb-saved-note">Gespeichert.</span>}
          </div>
          <div className="sb-manage-actions">
            <ConfirmDelete onConfirm={() => onDelete(company.id)} label="Unternehmen löschen" />
          </div>
        </div>
      )}
    </div>
  );
}

function SuperAdminView({ companies, superAdmin, onCreateCompany, onDeleteCompany, onUpdateCompanyName, onLogout }) {
  return (
    <div className="sb-app">
      <div className="sb-header">
        <div className="sb-header-top">
          <h1 className="sb-app-title sb-app-title-sm">Schichtboard – Verwaltung</h1>
          <div className="sb-header-user">
            <span>{superAdmin.name}</span>
            <Badge tone="rust">Verwaltung</Badge>
            <button type="button" className="sb-link-btn" onClick={onLogout}>Abmelden</button>
          </div>
        </div>
      </div>
      <main className="sb-main">
        <div className="sb-tab">
          <p className="sb-tab-intro">Übersicht aller Unternehmen im System, jeweils identifiziert durch ihren Firmencode.</p>
          <div className="sb-card">
            <h3 className="sb-subheading">Unternehmen</h3>
            <div className="sb-manage-list">
              {companies.length === 0 && <p className="sb-empty">Noch keine Unternehmen vorhanden.</p>}
              {companies.map((c) => <CompanyRow key={c.id} company={c} onDelete={onDeleteCompany} onUpdateName={onUpdateCompanyName} />)}
            </div>
          </div>
          <NewCompanyForm onCreate={onCreateCompany} />
        </div>
      </main>
    </div>
  );
}

/* ---------- Layout ---------- */
function Header({ currentUser, activeTab, setActiveTab, onSwitchAccount }) {
  const adminTabs = [
    ["overview", "Übersicht"], ["shifts", "Schichten"], ["employees", "Mitarbeitende"], ["settings", "Einstellungen"],
  ];
  const employeeTabs = [
    ["overview", "Übersicht"], ["shifts", "Schichten"], ["myshifts", "Meine Schichten"], ["account", "Konto"],
  ];
  const tabs = currentUser.role === "admin" ? adminTabs : employeeTabs;

  return (
    <div className="sb-header">
      <div className="sb-header-top">
        <h1 className="sb-app-title sb-app-title-sm">Schichtboard</h1>
        <div className="sb-header-user">
          <span>{currentUser.name}</span>
          <Badge tone={currentUser.role === "admin" ? "amber" : "petrol"}>{currentUser.role === "admin" ? "Admin" : "Mitarbeiter"}</Badge>
          <button type="button" className="sb-link-btn" onClick={onSwitchAccount}>Konto wechseln</button>
        </div>
      </div>
      <nav className="sb-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" className={`sb-tab-btn ${activeTab === key ? "sb-tab-btn-active" : ""}`} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------- App ---------- */
/* ---------- App ---------- */
export default function App() {
  const seedRef = useRef(buildSeed());
  const { today } = seedRef.current;

  const [companies, setCompanies] = useState(seedRef.current.companies);
  const [session, setSession] = useState(null); // null | {type:'super'} | {type:'company', companyId, userId}
  const [activeTab, setActiveTab] = useState("overview");

  const company = session && session.type === "company" ? companies.find((c) => c.id === session.companyId) || null : null;
  const currentUser = company ? company.accounts.find((a) => a.id === session.userId) || null : null;
  const qualifications = company ? company.qualifications : [];
  const shifts = company ? company.shifts : [];
  const settings = company ? company.settings : { assignmentDay: 7 };

  const updateCompany = (companyId, fn) => {
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? fn(c) : c)));
  };

  const recomputeCompany = (c, forceIds = []) => ({
    ...c,
    shifts: runAssignmentPass(c.shifts, c.accounts, today, c.settings.assignmentDay, forceIds),
  });

  /* --- Login / Session --- */
  const handleLogin = (result) => { setSession(result); setActiveTab("overview"); };
  const handleSwitchAccount = () => setSession(null);

  /* --- Handlers (Firma) --- */
  const handleAddQualification = (name) => {
    const id = uid("q");
    if (company) updateCompany(company.id, (c) => ({ ...c, qualifications: [...c.qualifications, { id, name }] }));
    return id;
  };

  const handleDeleteQualification = (qualId) => {
    if (!company) return;
    updateCompany(company.id, (c) => ({
      ...c,
      qualifications: c.qualifications.filter((q) => q.id !== qualId),
      accounts: c.accounts.map((a) => ({ ...a, qualifications: a.qualifications.filter((q) => q !== qualId) })),
      shifts: c.shifts.map((s) => (s.qualificationId === qualId ? { ...s, qualificationId: null } : s)),
    }));
  };

  const handleCreateShift = (form) => {
    if (!company) return;
    const horizon = addDays(today, 92);
    const instances = expandShift(form, horizon);
    updateCompany(company.id, (c) => recomputeCompany({ ...c, shifts: [...c.shifts, ...instances] }));
  };

  const handleForceAssign = (shiftId) => {
    if (!company) return;
    updateCompany(company.id, (c) => recomputeCompany(c, [shiftId]));
  };

  const handleToggleEnroll = (shiftId) => {
    if (!company || !currentUser) return;
    updateCompany(company.id, (c) => {
      const updated = c.shifts.map((s) => {
        if (s.id !== shiftId) return s;
        const alreadyEnrolled = s.enrolled.includes(currentUser.id);
        if (!alreadyEnrolled && !hasQualification(c.accounts, currentUser.id, s.qualificationId)) return s;
        const enrolled = alreadyEnrolled
          ? s.enrolled.filter((id) => id !== currentUser.id)
          : [...s.enrolled, currentUser.id];
        const assigned = s.assigned.filter((id) => enrolled.includes(id));
        return { ...s, enrolled, assigned };
      });
      return recomputeCompany({ ...c, shifts: updated });
    });
  };

  const handleAskForHelp = (shiftId) => {
    if (!company || !currentUser) return;
    updateCompany(company.id, (c) => ({
      ...c,
      shifts: c.shifts.map((s) => {
        if (s.id !== shiftId) return s;
        const helpRequests = s.helpRequests.includes(currentUser.id)
          ? s.helpRequests.filter((id) => id !== currentUser.id)
          : [...s.helpRequests, currentUser.id];
        return { ...s, helpRequests };
      }),
    }));
  };

  const handleTakeOver = (shiftId, helperId, replaceId) => {
    if (!company) return;
    updateCompany(company.id, (c) => ({
      ...c,
      shifts: c.shifts.map((s) => {
        if (s.id !== shiftId) return s;
        const enrolled = s.enrolled.includes(helperId) ? s.enrolled : [...s.enrolled, helperId];
        let assigned = s.assigned;
        let helpRequests = s.helpRequests;
        if (replaceId) {
          assigned = assigned.filter((id) => id !== replaceId).concat(helperId);
          helpRequests = helpRequests.filter((id) => id !== replaceId);
        } else {
          assigned = [...assigned, helperId];
        }
        return { ...s, enrolled, assigned, helpRequests, assignedAt: s.assignedAt || toISO(today) };
      }),
    }));
  };

  const handleAddEmployee = (data) => {
    if (!company) return;
    updateCompany(company.id, (c) => ({
      ...c,
      accounts: [...c.accounts, { id: uid("a"), name: data.name, email: data.email, password: data.password, role: "employee", qualifications: [] }],
    }));
  };

  const handleToggleQualification = (qualId, val) => {
    if (!company || !currentUser) return;
    updateCompany(company.id, (c) => recomputeCompany({
      ...c,
      accounts: c.accounts.map((a) => (a.id === currentUser.id
        ? { ...a, qualifications: val ? [...a.qualifications, qualId] : a.qualifications.filter((q) => q !== qualId) }
        : a)),
    }));
  };

  const handleSetAccountQualification = (accountId, qualId, val) => {
    if (!company) return;
    updateCompany(company.id, (c) => recomputeCompany({
      ...c,
      accounts: c.accounts.map((a) => (a.id === accountId && a.role !== "admin"
        ? { ...a, qualifications: val ? [...a.qualifications, qualId] : a.qualifications.filter((q) => q !== qualId) }
        : a)),
    }));
  };

  const handleUpdateEmail = (accountId, email) => {
    if (!company) return;
    updateCompany(company.id, (c) => ({
      ...c,
      accounts: c.accounts.map((a) => (a.id === accountId && a.role !== "admin" ? { ...a, email } : a)),
    }));
  };

  const handlePromoteToAdmin = (accountId) => {
    if (!company) return;
    updateCompany(company.id, (c) => ({
      ...c,
      accounts: c.accounts.map((a) => (a.id === accountId ? { ...a, role: "admin" } : a)),
    }));
  };

  const handleDeleteAccount = (accountId) => {
    if (!company) return;
    const target = company.accounts.find((a) => a.id === accountId);
    if (!target) return;
    if (target.role === "admin" && company.accounts.filter((a) => a.role === "admin").length <= 1) return;
    updateCompany(company.id, (c) => ({
      ...c,
      accounts: c.accounts.filter((a) => a.id !== accountId),
      shifts: c.shifts.map((s) => ({
        ...s,
        enrolled: s.enrolled.filter((id) => id !== accountId),
        assigned: s.assigned.filter((id) => id !== accountId),
        helpRequests: s.helpRequests.filter((id) => id !== accountId),
      })),
    }));
    if (session && session.type === "company" && session.userId === accountId) setSession(null);
  };

  const handleUpdateOwnEmail = (email) => {
    if (!company || !currentUser) return;
    updateCompany(company.id, (c) => ({
      ...c,
      accounts: c.accounts.map((a) => (a.id === currentUser.id ? { ...a, email } : a)),
    }));
  };

  const handleChangePassword = (newPassword) => {
    if (!company || !currentUser) return;
    updateCompany(company.id, (c) => ({
      ...c,
      accounts: c.accounts.map((a) => (a.id === currentUser.id ? { ...a, password: newPassword } : a)),
    }));
  };

  const handleChangeAssignmentDay = (n) => {
    if (!company) return;
    updateCompany(company.id, (c) => recomputeCompany({ ...c, settings: { ...c.settings, assignmentDay: n } }));
  };

  /* --- Handlers (Super-Admin) --- */
  const handleCreateCompany = (data, setError) => {
    if (data.code === SUPER_ADMIN.code || companies.some((c) => c.code === data.code)) {
      setError("Dieser Firmencode wird bereits verwendet.");
      return;
    }
    const newCompany = {
      id: uid("c"),
      code: data.code,
      name: data.name,
      qualifications: [],
      accounts: [{ id: uid("a"), name: data.adminName, email: data.adminEmail, password: data.adminPassword, role: "admin", qualifications: [] }],
      shifts: [],
      settings: { assignmentDay: 7 },
    };
    setCompanies((prev) => [...prev, newCompany]);
  };

  const handleUpdateCompanyName = (companyId, name) => {
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, name } : c)));
  };

  const handleDeleteCompany = (companyId) => {
    setCompanies((prev) => prev.filter((c) => c.id !== companyId));
    if (session && session.type === "company" && session.companyId === companyId) setSession(null);
  };

  return (
    <div className="sb-root">
      <style>{CSS}</style>
      {!session && <CompanyLoginScreen companies={companies} superAdmin={SUPER_ADMIN} onLogin={handleLogin} />}

      {session && session.type === "super" && (
        <SuperAdminView
          companies={companies}
          superAdmin={SUPER_ADMIN}
          onCreateCompany={handleCreateCompany}
          onDeleteCompany={handleDeleteCompany}
          onUpdateCompanyName={handleUpdateCompanyName}
          onLogout={handleSwitchAccount}
        />
      )}

      {session && session.type === "company" && company && currentUser && (
        <div className="sb-app">
          <Header currentUser={currentUser} activeTab={activeTab} setActiveTab={setActiveTab} onSwitchAccount={handleSwitchAccount} />
          <main className="sb-main">
            {activeTab === "overview" && (
              <OverviewTab shifts={shifts} qualifications={qualifications} accounts={company.accounts} currentUser={currentUser} today={today} onTakeOver={handleTakeOver} />
            )}
            {activeTab === "shifts" && currentUser.role === "admin" && (
              <AdminShiftsTab shifts={shifts} qualifications={qualifications} accounts={company.accounts} today={today} settings={settings}
                onCreate={handleCreateShift} onAddQualification={handleAddQualification} onForceAssign={handleForceAssign} />
            )}
            {activeTab === "shifts" && currentUser.role === "employee" && (
              <EmployeeShiftsTab shifts={shifts} qualifications={qualifications} accounts={company.accounts} currentUser={currentUser} today={today} onToggleEnroll={handleToggleEnroll} />
            )}
            {activeTab === "employees" && currentUser.role === "admin" && (
              <EmployeesTab accounts={company.accounts} qualifications={qualifications} currentUser={currentUser} onAddEmployee={handleAddEmployee}
                onAddQualification={handleAddQualification} onDeleteQualification={handleDeleteQualification}
                onUpdateEmail={handleUpdateEmail} onSetQualification={handleSetAccountQualification} onDeleteAccount={handleDeleteAccount}
                onPromote={handlePromoteToAdmin} />
            )}
            {activeTab === "settings" && currentUser.role === "admin" && (
              <SettingsTab
                settings={settings}
                onChangeAssignmentDay={handleChangeAssignmentDay}
                currentUser={currentUser}
                canDeleteSelf={company.accounts.filter((a) => a.role === "admin").length > 1}
                onUpdateOwnEmail={handleUpdateOwnEmail}
                onChangeOwnPassword={handleChangePassword}
                onDeleteOwnAccount={() => handleDeleteAccount(currentUser.id)}
              />
            )}
            {activeTab === "myshifts" && currentUser.role === "employee" && (
              <MyShiftsTab shifts={shifts} qualifications={qualifications} currentUser={currentUser} today={today} onAskForHelp={handleAskForHelp} />
            )}
            {activeTab === "account" && currentUser.role === "employee" && (
              <AccountTab currentUser={currentUser} qualifications={qualifications} onToggleQualification={handleToggleQualification} onChangePassword={handleChangePassword} />
            )}
          </main>
        </div>
      )}
    </div>
  );
}


/* ---------- CSS ---------- */
const CSS = `
:root {
  --sb-bg: ${COLORS.bg};
  --sb-ink: ${COLORS.ink};
  --sb-amber: ${COLORS.amber};
  --sb-petrol: ${COLORS.petrol};
  --sb-rust: ${COLORS.rust};
  --sb-paper: #FBF9F4;
  --sb-line: rgba(30,42,56,0.14);
  --sb-font-head: Georgia, "Times New Roman", serif;
  --sb-font-mono: "Courier New", Courier, monospace;
  --sb-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.sb-root { background: var(--sb-bg); color: var(--sb-ink); font-family: var(--sb-font-sans); min-height: 100%; padding: 0; }
.sb-root * { box-sizing: border-box; }
.sb-app { max-width: 980px; margin: 0 auto; padding: 0 20px 60px; }
.sb-mono { font-family: var(--sb-font-mono); }

/* Login */
.sb-login-wrap { max-width: 900px; margin: 0 auto; padding: 60px 24px; }
.sb-login-head { text-align: center; margin-bottom: 36px; }
.sb-app-title { font-family: var(--sb-font-head); font-size: 40px; font-weight: 700; letter-spacing: 0.5px; margin: 0; color: var(--sb-ink); }
.sb-app-title-sm { font-size: 22px; }
.sb-login-sub { color: rgba(30,42,56,0.65); margin-top: 8px; font-size: 15px; }
.sb-login-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.sb-login-card { max-width: 380px; margin: 0 auto; }
.sb-login-btn { width: 100%; margin-top: 6px; padding: 11px 16px; }
.sb-account-card { background: var(--sb-paper); border: 1px solid var(--sb-line); border-radius: 8px; padding: 20px 16px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; font-family: var(--sb-font-sans); transition: border-color .15s, transform .1s; }
.sb-account-card:hover { border-color: var(--sb-ink); transform: translateY(-2px); }
.sb-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--sb-font-head); font-weight: 700; font-size: 16px; border: 2px solid; }
.sb-avatar-admin { border-color: var(--sb-amber); color: var(--sb-amber); background: rgba(226,163,59,0.1); }
.sb-avatar-employee { border-color: var(--sb-petrol); color: var(--sb-petrol); background: rgba(63,124,116,0.1); }
.sb-account-name { font-weight: 600; font-size: 15px; }
.sb-account-name-lg { font-family: var(--sb-font-head); font-size: 20px; font-weight: 700; }
.sb-account-email { font-size: 13px; color: rgba(30,42,56,0.6); }

/* Header / Nav */
.sb-header { padding-top: 22px; border-bottom: 1px solid var(--sb-line); margin-bottom: 24px; }
.sb-header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.sb-header-user { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.sb-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.sb-tab-btn { font-family: var(--sb-font-sans); background: none; border: none; border-bottom: 3px solid transparent; padding: 10px 14px; font-size: 14px; cursor: pointer; color: rgba(30,42,56,0.65); }
.sb-tab-btn:hover { color: var(--sb-ink); }
.sb-tab-btn-active { color: var(--sb-ink); border-bottom-color: var(--sb-petrol); font-weight: 600; }

/* Tab content */
.sb-tab { display: flex; flex-direction: column; gap: 16px; }
.sb-tab-intro { color: rgba(30,42,56,0.65); font-size: 14px; margin: 0; }
.sb-tab-toolbar { display: flex; justify-content: flex-end; }
.sb-subheading { font-family: var(--sb-font-head); font-size: 18px; margin: 0 0 12px; }

/* Buttons */
.sb-btn { font-family: var(--sb-font-sans); border: none; border-radius: 5px; padding: 9px 16px; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: opacity .15s; }
.sb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sb-btn:not(:disabled):hover { opacity: 0.88; }
.sb-btn-ink { background: var(--sb-ink); color: var(--sb-bg); }
.sb-btn-amber { background: var(--sb-amber); color: var(--sb-ink); }
.sb-btn-petrol { background: var(--sb-petrol); color: #fff; }
.sb-btn-rust { background: var(--sb-rust); color: #fff; }
.sb-link-btn { background: none; border: none; color: var(--sb-petrol); font-size: 13px; cursor: pointer; text-decoration: underline; padding: 0; }
.sb-link-rust { color: var(--sb-rust); }
.sb-icon-btn { background: none; border: 1px solid var(--sb-line); border-radius: 50%; width: 20px; height: 20px; line-height: 1; cursor: pointer; color: var(--sb-rust); font-size: 14px; }

/* Forms */
.sb-card { background: var(--sb-paper); border: 1px solid var(--sb-line); border-radius: 8px; padding: 18px 20px; }
.sb-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; align-items: end; }
.sb-field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: rgba(30,42,56,0.75); }
.sb-field-btn { justify-content: flex-end; }
.sb-field input, .sb-field select, .sb-inline-add input, .sb-select-inline {
  font-family: var(--sb-font-sans); border: 1px solid var(--sb-line); border-radius: 5px; padding: 8px 10px; font-size: 14px; background: #fff; color: var(--sb-ink);
}
.sb-field input:focus, .sb-field select:focus { outline: 2px solid var(--sb-petrol); outline-offset: 1px; }
.sb-error { color: var(--sb-rust); font-size: 13px; margin: 4px 0 0; }
.sb-password-expand { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--sb-line); animation: sb-expand .18s ease-out; }
@keyframes sb-expand { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.sb-inline-add { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
.sb-saved-note { color: var(--sb-petrol); font-size: 13px; }

/* Filters */
.sb-filter-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
.sb-select-inline { padding: 7px 10px; }
.sb-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.sb-chip { font-family: var(--sb-font-sans); border: 1px solid var(--sb-line); background: #fff; border-radius: 20px; padding: 5px 12px; font-size: 12.5px; cursor: pointer; color: var(--sb-ink); }
.sb-chip-active { background: var(--sb-petrol); border-color: var(--sb-petrol); color: #fff; }
.sb-checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 13.5px; cursor: pointer; }

/* Badges */
.sb-badge { font-family: var(--sb-font-sans); font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; letter-spacing: 0.3px; }
.sb-badge-amber { background: rgba(226,163,59,0.18); color: #7a5410; }
.sb-badge-petrol { background: rgba(63,124,116,0.18); color: #234f49; }
.sb-badge-rust { background: rgba(193,84,60,0.18); color: #7d3325; }
.sb-badge-ink { background: rgba(30,42,56,0.1); color: var(--sb-ink); }

/* Ticket / shift cards */
.sb-shift-list { display: flex; flex-direction: column; gap: 10px; }
.sb-ticket-error { margin: -4px 0 0; padding: 0 4px; }
.sb-ticket { display: flex; align-items: stretch; background: var(--sb-paper); border: 1px solid var(--sb-line); border-radius: 8px; overflow: hidden; }
.sb-ticket-body { flex: 1; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; justify-content: center; }
.sb-ticket-top { display: flex; align-items: center; gap: 10px; }
.sb-ticket-name { font-weight: 600; font-size: 14.5px; }
.sb-ticket-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12.5px; color: rgba(30,42,56,0.7); }
.sb-ticket-action { align-self: center; margin: 10px 14px; white-space: nowrap; }

.sb-date-stub { width: 58px; flex-shrink: 0; background: var(--sb-ink); color: var(--sb-bg); display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: var(--sb-font-mono); border-right: 1px dashed rgba(246,243,236,0.35); padding: 6px 0; }
.sb-date-wd { font-size: 10px; text-transform: uppercase; opacity: 0.75; }
.sb-date-day { font-size: 20px; font-weight: 700; line-height: 1.1; }
.sb-date-mo { font-size: 10px; text-transform: uppercase; opacity: 0.75; }

/* Overview */
.sb-bar { border: 1px solid var(--sb-line); border-radius: 8px; overflow: hidden; background: var(--sb-paper); }
.sb-bar-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 16px; border: none; cursor: pointer; font-family: var(--sb-font-sans); font-size: 14.5px; font-weight: 600; color: var(--sb-ink); background: #fff; }
.sb-bar-amber { border-left: 5px solid var(--sb-amber); }
.sb-bar-rust { border-left: 5px solid var(--sb-rust); }
.sb-bar-petrol { border-left: 5px solid var(--sb-petrol); }
.sb-bar-count { font-family: var(--sb-font-mono); background: rgba(30,42,56,0.08); border-radius: 10px; padding: 1px 9px; font-size: 12.5px; }
.sb-bar-caret { margin-left: auto; }
.sb-bar-body { padding: 10px 14px 14px; display: flex; flex-direction: column; gap: 8px; }
.sb-empty { color: rgba(30,42,56,0.5); font-size: 13px; margin: 6px 2px; }

.sb-ov-row { border: 1px solid var(--sb-line); border-radius: 6px; background: #fff; overflow: hidden; }
.sb-ov-row-head { width: 100%; display: flex; align-items: stretch; border: none; background: none; cursor: pointer; padding: 0; text-align: left; font-family: var(--sb-font-sans); }
.sb-ov-row-main { flex: 1; padding: 8px 12px; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.sb-ov-row-title { font-weight: 600; font-size: 14px; }
.sb-ov-row-sub { font-size: 12px; color: rgba(30,42,56,0.65); }
.sb-ov-row-detail { padding: 10px 14px 14px; border-top: 1px solid var(--sb-line); display: flex; flex-direction: column; gap: 8px; }
.sb-ov-help-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13.5px; flex-wrap: wrap; }

/* My shifts */
.sb-myshifts-list { display: flex; flex-direction: column; gap: 8px; }
.sb-myshift { border: 1px solid var(--sb-line); border-radius: 6px; background: var(--sb-paper); overflow: hidden; }
.sb-myshift-row { width: 100%; display: grid; grid-template-columns: 1fr auto auto auto; gap: 16px; align-items: center; padding: 12px 14px; border: none; background: none; cursor: pointer; text-align: left; font-family: var(--sb-font-sans); font-size: 14px; }
.sb-myshift-name { font-weight: 600; }
.sb-myshift-detail { padding: 4px 14px 16px; border-top: 1px solid var(--sb-line); display: flex; flex-direction: column; gap: 12px; }
.sb-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; font-size: 13.5px; }
.sb-detail-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: rgba(30,42,56,0.55); }

/* Toggle */
.sb-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--sb-line); font-size: 14px; }
.sb-toggle-row:last-child { border-bottom: none; }
.sb-toggle { width: 40px; height: 22px; border-radius: 20px; background: rgba(30,42,56,0.2); border: none; position: relative; cursor: pointer; padding: 0; }
.sb-toggle-on { background: var(--sb-petrol); }
.sb-toggle-knob { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left .15s; }
.sb-toggle-on .sb-toggle-knob { left: 20px; }

/* Qualifications management */
.sb-qual-manage-chip { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--sb-line); border-radius: 20px; padding: 5px 8px 5px 13px; font-size: 12.5px; background: #fff; }
.sb-confirm { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }

/* Matrix */
.sb-matrix-wrap { overflow-x: auto; }
.sb-matrix { border-collapse: collapse; width: 100%; font-size: 13px; }
.sb-matrix th, .sb-matrix td { border-bottom: 1px solid var(--sb-line); padding: 8px 10px; text-align: left; white-space: nowrap; }
.sb-matrix th { font-weight: 700; color: rgba(30,42,56,0.7); font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; }
.sb-matrix-cell { text-align: center; font-family: var(--sb-font-mono); }

/* Mitarbeitende verwalten */
.sb-manage-list { display: flex; flex-direction: column; gap: 8px; }
.sb-manage-row { border: 1px solid var(--sb-line); border-radius: 6px; background: #fff; overflow: hidden; }
.sb-manage-row-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: none; background: none; cursor: pointer; text-align: left; font-family: var(--sb-font-sans); }
.sb-manage-name { font-weight: 600; font-size: 14px; }
.sb-manage-email { margin-left: auto; margin-right: 8px; font-size: 12.5px; color: rgba(30,42,56,0.6); }
.sb-manage-row-body { padding: 12px 14px 16px; border-top: 1px solid var(--sb-line); }
.sb-manage-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--sb-line); }

.sb-account-head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }

@media (max-width: 640px) {
  .sb-myshift-row { grid-template-columns: 1fr auto; row-gap: 4px; }
  .sb-header-top { flex-direction: column; align-items: flex-start; }
}
`;

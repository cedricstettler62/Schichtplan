import { useEffect, useState } from "react";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";

export default function CompanyRow({ company, onDelete, onUpdateName, onLoadAdmins, onResetAdminPassword }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(company.name);
  const [saved, setSaved] = useState(false);

  const [admins, setAdmins] = useState(null); // null = noch nicht geladen
  const [adminId, setAdminId] = useState("");
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [superPw, setSuperPw] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSaved, setResetSaved] = useState(false);

  /* Erst beim Aufklappen laden: Die Übersicht zeigt oft viele Unternehmen,
     und die Namen der Admin-Konten braucht nur, wer eines befreien will. */
  useEffect(() => {
    if (!open || admins !== null) return;
    let abgebrochen = false;
    onLoadAdmins(company.id).then((liste) => {
      if (abgebrochen) return;
      setAdmins(liste);
      if (liste.length === 1) setAdminId(liste[0].id);
    });
    return () => { abgebrochen = true; };
  }, [open, admins, company.id, onLoadAdmins]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onUpdateName(company.id, trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const submitReset = async () => {
    if (!adminId) { setResetError("Bitte ein Admin-Konto auswählen."); return; }
    if (neu.length < 4) { setResetError("Mindestens 4 Zeichen."); return; }
    if (neu !== wiederholung) { setResetError("Die beiden Passwörter stimmen nicht überein."); return; }

    const meldung = await onResetAdminPassword(company.id, adminId, neu, superPw);
    if (meldung) { setResetError(meldung); return; }

    setResetError("");
    setResetSaved(true);
    setNeu(""); setWiederholung(""); setSuperPw("");
    setTimeout(() => setResetSaved(false), 2500);
  };

  return (
    <div className="sb-manage-row">
      <button type="button" className="sb-manage-row-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="sb-manage-name">{company.name}</span>
        <span className="sb-manage-meta sb-mono">{company.code}</span>
        <span className="sb-manage-summary">
          {company.adminCount} Admin{company.adminCount === 1 ? "" : "s"} · {company.employeeCount} Mitarbeitende
        </span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="sb-manage-row-body">
          <div className="sb-manage-section">
            <span className="sb-detail-label">Name des Unternehmens</span>
            <div className="sb-inline-add">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
              <button type="button" className="sb-btn sb-btn-ink" onClick={saveName}>Speichern</button>
              {saved && <span className="sb-saved-note">Gespeichert.</span>}
            </div>
          </div>

          {/* Admins setzen einander das Passwort nicht — sonst könnte einer die
              Firma übernehmen. Für ein ausgesperrtes Admin-Konto bleibt daher
              nur dieser Weg. */}
          <div className="sb-manage-section">
            <span className="sb-detail-label">Admin-Passwort zurücksetzen</span>
            <p className="sb-status">
              Für den Fall, dass sich die Administration dieses Unternehmens ausgesperrt hat.
              Gib das neue Passwort persönlich weiter.
            </p>
            {admins === null ? (
              <p className="sb-status">Admin-Konten werden geladen …</p>
            ) : admins.length === 0 ? (
              <p className="sb-empty">Dieses Unternehmen hat kein Admin-Konto.</p>
            ) : (
              <div className="sb-form-grid">
                <label className="sb-field">
                  <span>Admin-Konto</span>
                  <select value={adminId} onChange={(e) => { setAdminId(e.target.value); setResetError(""); }}>
                    <option value="">Bitte wählen</option>
                    {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="sb-field">
                  <span>Neues Passwort</span>
                  <input type="password" value={neu} onChange={(e) => setNeu(e.target.value)} autoComplete="new-password" />
                </label>
                <label className="sb-field">
                  <span>Wiederholen</span>
                  <input type="password" value={wiederholung} onChange={(e) => setWiederholung(e.target.value)} autoComplete="new-password" />
                </label>
                <label className="sb-field">
                  <span>Dein Verwaltungs-Passwort</span>
                  <input
                    type="password"
                    value={superPw}
                    onChange={(e) => setSuperPw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitReset()}
                    autoComplete="current-password"
                  />
                </label>
                <div className="sb-field sb-field-btn">
                  <button type="button" className="sb-btn sb-btn-ink" onClick={submitReset}>Passwort setzen</button>
                </div>
              </div>
            )}
            {resetError && <p className="sb-error">{resetError}</p>}
            {resetSaved && <p className="sb-saved-note">Neues Passwort gesetzt.</p>}
          </div>

          <div className="sb-manage-actions">
            <ConfirmDelete
              onConfirm={() => onDelete(company.id)}
              label="Unternehmen löschen"
              question={`„${company.name}“ mit allen Konten und Schichten wirklich löschen?`}
              variant="button"
            />
          </div>
        </div>
      )}
    </div>
  );
}

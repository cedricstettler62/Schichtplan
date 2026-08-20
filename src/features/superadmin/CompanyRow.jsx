import { useEffect, useState } from "react";
import ConfirmDelete from "../../components/ConfirmDelete.jsx";
import LogbookLoader from "../../components/LogbookLoader.jsx";
import { useKurzeMeldung } from "../../hooks.js";
import { PASSWORD_HINWEIS, passwortProblem } from "#shared/password.js";

const MENU = [
  ["name", "Name ändern"],
  ["password", "Admin-Passwort zurücksetzen"],
  ["delete-admin", "Admin-Konto löschen"],
  ["logbook", "Logbuch"],
];

/** Auswahl eines Kontos aus einer Liste — dreimal dasselbe Feld: zurücksetzen,
    löschen, Nachfolge bestimmen. */
function KontoAuswahl({ label, wert, onChange, konten }) {
  return (
    <label className="sb-field">
      <span>{label}</span>
      <select value={wert} onChange={(e) => onChange(e.target.value)}>
        <option value="">Bitte wählen</option>
        {konten.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}

/** Beide Admin-Bereiche brauchen dieselbe Vorbedingung: Die Liste muss da und
    darf nicht leer sein. */
function MitAdmins({ admins, children }) {
  if (admins === null) return <p className="sb-status">Admin-Konten werden geladen …</p>;
  if (admins.length === 0) return <p className="sb-empty">Dieses Unternehmen hat kein Admin-Konto.</p>;
  return children;
}

/**
 * Aufklappen zeigt zunächst nur eine kompakte Übersicht mit einer Knopfreihe.
 * Erst ein Klick auf einen dieser Knöpfe blendet den jeweiligen Bereich ein —
 * vorher standen alle fünf Formulare gleichzeitig da, was bei einer langen
 * Firmenliste schnell unübersichtlich wurde.
 */
export default function CompanyRow({
  company, onArchive, onPause, onUnpause, onUpdateName,
  onLoadAdmins, onLoadEmployees, onResetAdminPassword, onDeleteAdmin, onLoadLogbook,
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(null); // null = nur Übersicht + Menü
  const [name, setName] = useState(company.name);
  const [saved, zeigeGespeichert, verbergeGespeichert] = useKurzeMeldung(1500);
  const [nameError, setNameError] = useState("");

  const [admins, setAdmins] = useState(null); // null = noch nicht geladen
  const [employees, setEmployees] = useState([]);
  const [loeschId, setLoeschId] = useState("");
  const [nachfolgerId, setNachfolgerId] = useState("");
  const [loeschPw, setLoeschPw] = useState("");
  const [loeschError, setLoeschError] = useState("");
  const [geloescht, setGeloescht] = useState("");
  const [adminId, setAdminId] = useState("");
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [superPw, setSuperPw] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSaved, zeigeResetGespeichert] = useKurzeMeldung(2500);
  const wähleAbschnitt = (key) => setSection((s) => (s === key ? null : key));

  /* Erst laden, wenn ein Bereich es tatsächlich braucht: Die Übersicht zeigt
     oft viele Unternehmen, und die Admin-Konten braucht nur, wer eines
     zurücksetzen oder löschen will. */
  useEffect(() => {
    if (section !== "password" && section !== "delete-admin") return;
    if (admins !== null) return;
    let abgebrochen = false;
    Promise.all([onLoadAdmins(company.id), onLoadEmployees(company.id)]).then(([adminListe, leute]) => {
      if (abgebrochen) return;
      setAdmins(adminListe);
      setEmployees(leute);
      if (adminListe.length === 1) { setAdminId(adminListe[0].id); setLoeschId(adminListe[0].id); }
    });
    return () => { abgebrochen = true; };
  }, [section, admins, company.id, onLoadAdmins, onLoadEmployees]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const meldung = await onUpdateName(company.id, trimmed);
    if (meldung) { setNameError(meldung); verbergeGespeichert(); return; }
    setNameError("");
    zeigeGespeichert();
  };

  const submitReset = async () => {
    if (!adminId) { setResetError("Bitte ein Admin-Konto auswählen."); return; }
    const passwortFehler = passwortProblem(neu);
    if (passwortFehler) { setResetError(passwortFehler); return; }
    if (neu !== wiederholung) { setResetError("Die beiden Passwörter stimmen nicht überein."); return; }

    const meldung = await onResetAdminPassword(company.id, adminId, neu, superPw);
    if (meldung) { setResetError(meldung); return; }

    setResetError("");
    setNeu(""); setWiederholung(""); setSuperPw("");
    zeigeResetGespeichert();
  };

  /* Beim letzten Admin-Konto muss jemand übernehmen — sonst stünde die Firma
     ohne Administration da und niemand käme mehr an ihre Schichten. */
  const letztes = admins !== null && admins.length <= 1;

  const adminLoeschen = async () => {
    if (!loeschId) { setLoeschError("Bitte ein Admin-Konto auswählen."); return; }
    if (letztes && !nachfolgerId) { setLoeschError("Bitte eine Nachfolge bestimmen."); return; }

    const meldung = await onDeleteAdmin(company.id, loeschId, loeschPw, nachfolgerId || null);
    if (meldung) { setLoeschError(meldung); return; }

    const weg = admins.find((a) => a.id === loeschId);
    setGeloescht(weg ? weg.name : "Das Konto");
    setLoeschError(""); setLoeschPw(""); setNachfolgerId(""); setLoeschId("");
    // Beide Listen sind jetzt veraltet — beim nächsten Öffnen frisch holen.
    setAdmins(null);
    setSection(null);
    setOpen(false);
  };

  const pausiert = !!company.pausedAt;

  return (
    <div className="sb-manage-row">
      <button type="button" className="sb-manage-row-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="sb-manage-name">{company.name}</span>
        <span className="sb-manage-meta sb-mono">{company.code}</span>
        {pausiert && <span className="sb-manage-meta">· pausiert</span>}
        <span className="sb-manage-summary">
          {company.adminCount} Admin{company.adminCount === 1 ? "" : "s"} · {company.employeeCount} Mitarbeitende
        </span>
        <span className="sb-bar-caret">{open ? "▾" : "▸"}</span>
      </button>
      {geloescht && !open && (
        <p className="sb-saved-note sb-manage-note">
          {geloescht} wurde gelöscht.{" "}
          <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={() => setGeloescht("")}>
            Ausblenden
          </button>
        </p>
      )}
      {open && (
        <div className="sb-manage-row-body">
          <div className="sb-manage-menu">
            {MENU.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`sb-btn sb-btn-sm ${section === key ? "sb-btn-ink" : "sb-btn-quiet"}`}
                onClick={() => wähleAbschnitt(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="sb-manage-actions">
            <button
              type="button"
              className="sb-btn sb-btn-sm sb-btn-quiet"
              onClick={() => (pausiert ? onUnpause(company.id) : onPause(company.id))}
            >
              {pausiert ? "Fortsetzen" : "Pausieren"}
            </button>
            <ConfirmDelete
              onConfirm={() => onArchive(company.id)}
              label="Unternehmen löschen"
              question={`„${company.name}“ löschen? Der Zugang wird sofort gesperrt. Logbuch und aufbewahrungspflichtige Daten bleiben unter „Archiviert“ einsehbar.`}
              variant="button"
              small
            />
          </div>

          {section === "name" && (
            <div className="sb-manage-section">
              <span className="sb-detail-label">Name des Unternehmens</span>
              <div className="sb-inline-add">
                <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
                <button type="button" className="sb-btn sb-btn-ink" onClick={saveName}>Speichern</button>
                {saved && <span className="sb-saved-note">Gespeichert.</span>}
              </div>
              {nameError && <p className="sb-error">{nameError}</p>}
            </div>
          )}

          {/* Admins setzen einander das Passwort nicht — sonst könnte einer die
              Firma übernehmen. Für ein ausgesperrtes Admin-Konto bleibt daher
              nur dieser Weg. */}
          {section === "password" && (
            <div className="sb-manage-section">
              <span className="sb-detail-label">Admin-Passwort zurücksetzen</span>
              <p className="sb-status">
                Für den Fall, dass sich die Administration dieses Unternehmens ausgesperrt hat.
                Gib das neue Passwort persönlich weiter.
              </p>
              <MitAdmins admins={admins}>
                <div className="sb-form-grid">
                  <KontoAuswahl
                    label="Admin-Konto"
                    wert={adminId}
                    onChange={(id) => { setAdminId(id); setResetError(""); }}
                    konten={admins || []}
                  />
                  <div className="sb-field-wrap">
                    <label className="sb-field">
                      <span>Neues Passwort</span>
                      <input type="password" value={neu} onChange={(e) => setNeu(e.target.value)} autoComplete="new-password" />
                    </label>
                    <span className="sb-field-hint">{PASSWORD_HINWEIS}</span>
                  </div>
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
              </MitAdmins>
              {resetError && <p className="sb-error">{resetError}</p>}
              {resetSaved && <p className="sb-saved-note">Neues Passwort gesetzt.</p>}
            </div>
          )}

          {section === "delete-admin" && (
            <div className="sb-manage-section">
              <span className="sb-detail-label">Admin-Konto löschen</span>
              <p className="sb-status">
                Innerhalb der Firma kann das niemand: Admins entmachten einander nicht. Ist jemand
                ausgeschieden und das Konto bleibt stehen, entfernt es die Verwaltung.
              </p>
              <MitAdmins admins={admins}>
                <>
                  {letztes && (
                    <p className="sb-status">
                      Das ist die letzte Administration. Bestimme, wer sie übernimmt – das Konto wird
                      dabei zum Admin-Konto.
                    </p>
                  )}
                  <div className="sb-form-grid">
                    <KontoAuswahl
                      label="Zu löschendes Admin-Konto"
                      wert={loeschId}
                      onChange={(id) => { setLoeschId(id); setLoeschError(""); }}
                      konten={admins || []}
                    />
                    {letztes && (
                      <KontoAuswahl
                        label="Nachfolge"
                        wert={nachfolgerId}
                        onChange={(id) => { setNachfolgerId(id); setLoeschError(""); }}
                        konten={employees}
                      />
                    )}
                    <label className="sb-field">
                      <span>Verwaltungs-Passwort zur Bestätigung</span>
                      <input
                        type="password"
                        value={loeschPw}
                        onChange={(e) => setLoeschPw(e.target.value)}
                        autoComplete="current-password"
                      />
                    </label>
                    <div className="sb-field sb-field-btn">
                      <ConfirmDelete
                        onConfirm={adminLoeschen}
                        label="Jetzt löschen"
                        question="Dieses Admin-Konto endgültig löschen? Zuteilungen daraus werden frei."
                        variant="button"
                      />
                    </div>
                  </div>
                  {letztes && employees.length === 0 && (
                    <p className="sb-empty">
                      Es gibt kein Mitarbeitendenkonto, das übernehmen könnte. Ohne Nachfolge bleibt
                      nur, das Unternehmen zu löschen.
                    </p>
                  )}
                </>
              </MitAdmins>
              {loeschError && <p className="sb-error">{loeschError}</p>}
            </div>
          )}

          {section === "logbook" && (
            <div className="sb-manage-section">
              <span className="sb-detail-label">Logbuch</span>
              <p className="sb-status">
                Anlegen, Ändern, Zu-/Umteilungen und Hilfegesuche dieses Unternehmens — nur auf Wunsch geladen.
              </p>
              <LogbookLoader onLoad={() => onLoadLogbook(company.id)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

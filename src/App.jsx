import { useCallback, useEffect, useState } from "react";

import Header, { tabsFor } from "./features/layout/Header.jsx";
import LoginScreen from "./features/login/LoginScreen.jsx";
import PasswordSetupScreen from "./features/login/PasswordSetupScreen.jsx";
import OverviewTab from "./features/overview/OverviewTab.jsx";
import AdminShiftsTab from "./features/shifts/AdminShiftsTab.jsx";
import EmployeeShiftsTab from "./features/shifts/EmployeeShiftsTab.jsx";
import MyShiftsTab from "./features/shifts/MyShiftsTab.jsx";
import EmployeesTab from "./features/employees/EmployeesTab.jsx";
import RegistrationsTab from "./features/registrations/RegistrationsTab.jsx";
import AccountTab from "./features/account/AccountTab.jsx";
import SettingsTab from "./features/settings/SettingsTab.jsx";
import LogbookTab from "./features/logbook/LogbookTab.jsx";
import SuperAdminView from "./features/superadmin/SuperAdminView.jsx";
import ImprintScreen from "./features/legal/ImprintScreen.jsx";
import PrivacyScreen from "./features/legal/PrivacyScreen.jsx";
import Footer from "./components/Footer.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";

import { api, ApiError } from "./api.js";
import { startOfToday } from "#shared/dates.js";

/*
 * Der Zustand lebt in der Datenbank. Diese Komponente hält nur, was gerade auf
 * dem Bildschirm ist: die Antwort von GET /api/state und den aktiven Tab.
 * Jede Änderung geht an den Server und wird danach frisch geladen — so sehen
 * alle dasselbe, auch wenn zwei Personen gleichzeitig arbeiten.
 */
/* Nachlader für Listen, die nicht im Gesamtbündel stecken. Ein Fehlschlag
   ergibt eine leere Liste — die Ansichten zeigen dann schlicht nichts. */
const laden = (pfad) => api.get(pfad).catch(() => []);

/* Die App kommt ohne Router aus; zwei feste Adressen reichen als Weiche. Beide
   Rechtsseiten stehen offen — sie müssen auch ohne Anmeldung erreichbar sein. */
const RECHTSSEITEN = {
  "/datenschutz": PrivacyScreen,
  "/impressum": ImprintScreen,
};

/** Die aufgerufene Rechtsseite — oder null für alles andere. */
function rechtsSeitePfad() {
  if (typeof window === "undefined") return null;
  const pfad = window.location.pathname;
  return RECHTSSEITEN[pfad] ? pfad : null;
}

/** Das Zeichen aus dem Einladungslink (/passwort-einrichten/:token) — oder null. */
function passwortEinrichtenToken() {
  if (typeof window === "undefined") return null;
  const treffer = /^\/passwort-einrichten\/([^/]+)$/.exec(window.location.pathname);
  return treffer ? treffer[1] : null;
}

export default function App() {
  const [state, setState] = useState(null); // null = nicht angemeldet
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [rechtsPfad] = useState(rechtsSeitePfad);
  const [setupToken] = useState(passwortEinrichtenToken);

  const refresh = useCallback(async () => {
    try {
      setState(await api.get("/state"));
    } catch {
      setState(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // Auf den Rechtsseiten und dem Einladungslink gibt es nichts zu laden —
    // beide stehen offen, ganz ohne Anmeldung.
    if (!rechtsPfad && !setupToken) refresh();
  }, [refresh, rechtsPfad, setupToken]);

  // Wird bei jedem Rendern neu bestimmt — ein über Nacht offener Tab rechnet
  // damit mit heute, nicht mit gestern.
  const today = startOfToday();

  /**
   * Aktion ausführen und danach den Serverzustand neu laden.
   *
   * `act` liefert zurück, was der Server geschickt hat (null, wenn es
   * schiefging). `actMitMeldung` liefert stattdessen die Meldung des Servers —
   * null heisst geklappt. Für alles, was in einem Formular steht: Eine
   * Änderung, die stumm scheitert, sieht für die Bedienung genauso aus wie
   * eine, die durchgegangen ist. Die Oberfläche meldete daraufhin Erfolg,
   * obwohl nichts gespeichert war.
   */
  const lauf = (fn, alsMeldung, neuLaden) => async (...args) => {
    try {
      const res = await fn(...args);
      return alsMeldung ? null : res;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      return alsMeldung ? err.message : null;
    } finally {
      if (neuLaden) await refresh();
    }
  };

  const act = (fn) => lauf(fn, false, true);
  const actMitMeldung = (fn, { neuLaden = true } = {}) => lauf(fn, true, neuLaden);

  /* --- Session --- */
  /**
   * Liefert null bei Erfolg, `{ pending: true }` für ein noch unbestätigtes
   * Konto (das Login-Formular zeigt dann die grosse Wartemeldung statt eines
   * Fehlertexts), sonst `{ message }`.
   */
  const handleLogin = async (code, name, password) => {
    try {
      await api.post("/login", { code, name, password });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.data?.pending) return { pending: true };
      return { message: err.message };
    }
    setActiveTab("overview");
    await refresh();
    return null;
  };

  /* Legt ein Konto in Wartestellung an — meldet niemanden an. Die Bestätigung
     kommt aus dem Anmeldungen-Tab der Administration. */
  const handleRegister = async (code, name, password, email) => {
    try {
      await api.post("/register", { code, name, password, email });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      return err.message;
    }
    return null;
  };

  const handleApproveRegistration = act((accountId) => api.post(`/accounts/${accountId}/approve`));

  const handleLogout = async () => {
    await api.post("/logout").catch(() => {});
    setState(null);
  };

  const verifySelf = async (password) => {
    try {
      const res = await api.post("/verify-password", { password });
      return !!res.ok;
    } catch {
      return false;
    }
  };

  /* --- Qualifikationen --- */
  const handleAddQualification = act(async (name) => {
    const res = await api.post("/qualifications", { name });
    return res.id;
  });

  /* Das Löschen kann am Server scheitern (etwa wegen kommender Schichten), und
     ein Klick ohne jede Reaktion wäre nicht erklärbar. */
  const handleDeleteQualification = actMitMeldung((qualId) => api.del(`/qualifications/${qualId}`));

  /* --- Schichten --- */
  const handleCreateShift = actMitMeldung((form) => api.post("/shifts", form));
  const handleForceAssign = act((shiftId) => api.post(`/shifts/${shiftId}/assign`));
  const handleDirectAssign = actMitMeldung((shiftId, accountId) =>
    api.post(`/shifts/${shiftId}/assign-manual`, { accountId })
  );
  /* Eine Überschneidung mit einer anderen Schicht muss die Person erfahren,
     sonst passiert auf Knopfdruck sichtbar nichts. */
  const handleToggleEnroll = actMitMeldung((shiftId) => api.post(`/shifts/${shiftId}/enroll`));
  const handleRemoveEnrollment = act((shiftId, accountId) =>
    api.del(`/shifts/${shiftId}/enrollments/${accountId}`)
  );
  const handleUpdateShift = actMitMeldung((shiftId, form) => api.patch(`/shifts/${shiftId}`, form));

  const handleDeleteShift = act((shiftId) => api.del(`/shifts/${shiftId}`));
  const handleDeleteSeries = act((shiftId) => api.del(`/shifts/${shiftId}/series`));
  const handleAskForHelp = act((shiftId) => api.post(`/shifts/${shiftId}/help`));
  const handleTakeOver = actMitMeldung((shiftId, replaceId) =>
    api.post(`/shifts/${shiftId}/takeover`, { replaceId: replaceId || null })
  );

  /* --- Logbuch --- */
  /* Fest verdrahtet (useCallback), weil diese Funktionen in
     useEffect-Abhängigkeiten stehen: eine bei jedem Rendern neue Funktion
     liesse die jeweilige Liste nach jeder Aktion neu laden. */
  const handleLoadLogbook = useCallback(() => laden("/logbook"), []);
  const handleLoadShiftLogbook = useCallback((shiftId) => laden(`/logbook?shiftId=${shiftId}`), []);
  const handleLoadEligibleShifts = useCallback(() => laden("/logbook/eligible-shifts"), []);
  const handleRequestLogbookAccess = actMitMeldung((shiftId, note) =>
    api.post("/logbook/requests", { shiftId, note })
  );
  const handleApproveLogbookRequest = act((id) => api.post(`/logbook/requests/${id}/approve`));
  const handleDeclineLogbookRequest = act((id) => api.post(`/logbook/requests/${id}/decline`));
  const handleLoadCompanyLogbook = useCallback((companyId) => laden(`/companies/${companyId}/logbook`), []);

  /* --- Konten --- */
  const handleAddEmployee = actMitMeldung((data) => api.post("/employees", data));

  const handleSetAccountQualification = act((accountId, qualificationId, value) =>
    api.patch(`/accounts/${accountId}/qualifications`, { qualificationId, value })
  );

  const handleResetPassword = actMitMeldung((accountId, password, currentPassword) =>
    api.post(`/accounts/${accountId}/password`, { password, currentPassword })
  );

  const handlePromoteToAdmin = act((accountId) => api.post(`/accounts/${accountId}/promote`));
  const handleChangeAssignmentDay = act((assignmentDay) => api.patch("/settings", { assignmentDay }));
  const handleChangeFairnessSettings = act((fairnessWindow, fairnessThresholdShifts) =>
    api.patch("/settings", { fairnessWindow, fairnessThresholdShifts })
  );

  const handleDeleteAccount = async (accountId) => {
    try {
      const res = await api.del(`/accounts/${accountId}`);
      // Wer sich selbst löscht, ist danach abgemeldet.
      if (res?.self) {
        setState(null);
        return;
      }
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
    await refresh();
  };

  /* --- Super-Admin --- */
  /** Liefert { error } oder { id } — die Fehlermeldung gehört ins Formular. */
  const handleCreateCompany = async (data) => {
    let res;
    try {
      res = await api.post("/companies", data);
    } catch (err) {
      return { error: err.message };
    }
    await refresh();
    return res;
  };

  const handleLoadCompanyAdmins = useCallback((companyId) => laden(`/companies/${companyId}/admins`), []);
  const handleLoadCompanyEmployees = useCallback((companyId) => laden(`/companies/${companyId}/employees`), []);

  /* Der einzige Weg an ein Admin-Konto: Innerhalb der Firma darf niemand ein
     fremdes anfassen. Beim letzten muss eine Nachfolge mitkommen. */
  const handleDeleteCompanyAdmin = actMitMeldung(
    (companyId, accountId, currentPassword, nachfolgerId) =>
      api.del(`/companies/${companyId}/admins/${accountId}`, { currentPassword, nachfolgerId })
  );

  /* Ohne Neuladen: Der Zustand der Verwaltung ändert sich durch ein neues
     Passwort nicht, und die Rückmeldung im Formular soll stehen bleiben. */
  const handleResetCompanyAdminPassword = actMitMeldung(
    (companyId, accountId, password, currentPassword) =>
      api.post(`/companies/${companyId}/admins/${accountId}/password`, { password, currentPassword }),
    { neuLaden: false }
  );

  const handleUpdateCompanyName = actMitMeldung((companyId, name) =>
    api.patch(`/companies/${companyId}`, { name })
  );
  const handleArchiveCompany = act((companyId) => api.post(`/companies/${companyId}/archive`));
  const handleRestoreCompany = act((companyId) => api.post(`/companies/${companyId}/restore`));
  const handlePurgeCompany = act((companyId) => api.del(`/companies/${companyId}`));
  const handlePauseCompany = act((companyId) => api.post(`/companies/${companyId}/pause`));
  const handleUnpauseCompany = act((companyId) => api.post(`/companies/${companyId}/unpause`));

  /* Eigener Zugang der Verwaltung — dieselbe Selbstverwaltung wie bei
     Mitarbeitenden und Admins, nur über /api/admin statt /api/accounts, weil
     es dafür keine Konto-Zeile gibt (siehe server/db.js, super_admin). */
  const verifySuperSelf = async (password) => {
    try {
      const res = await api.post("/admin/verify-password", { password });
      return !!res.ok;
    } catch {
      return false;
    }
  };
  const handleChangeSuperCode = actMitMeldung((code) => api.patch("/admin/code", { code }));
  const handleChangeSuperEmail = actMitMeldung((email) => api.patch("/admin/email", { email }));
  const handleChangeSuperPassword = actMitMeldung((password, currentPassword) =>
    api.patch("/admin/password", { password, currentPassword })
  );

  /* --- Rendering --- */
  /* Datenschutzerklärung und Impressum stehen vor allem anderen: Sie müssen
     auch ohne Anmeldung und ohne geladenen Zustand lesbar sein. */
  if (rechtsPfad) {
    const RechtsSeite = RECHTSSEITEN[rechtsPfad];
    return (
      <div className="sb-root">
        <RechtsSeite />
      </div>
    );
  }

  if (setupToken) {
    return (
      <div className="sb-root">
        <PasswordSetupScreen token={setupToken} />
        <Footer />
      </div>
    );
  }

  if (!ready) return <div className="sb-root" />;

  const anmeldung = (
    <div className="sb-root">
      <LoginScreen onLogin={handleLogin} onRegister={handleRegister} />
      <Footer />
    </div>
  );

  if (!state) return anmeldung;

  if (state.type === "super") {
    return (
      <div className="sb-root">
        <UpdateBanner />
        <SuperAdminView
          companies={state.companies}
          archivedCompanies={state.archivedCompanies}
          superAdminName={state.name}
          superAdminCode={state.code}
          superAdminEmail={state.email}
          onCreateCompany={handleCreateCompany}
          onArchiveCompany={handleArchiveCompany}
          onRestoreCompany={handleRestoreCompany}
          onPurgeCompany={handlePurgeCompany}
          onPauseCompany={handlePauseCompany}
          onUnpauseCompany={handleUnpauseCompany}
          onUpdateCompanyName={handleUpdateCompanyName}
          onLoadAdmins={handleLoadCompanyAdmins}
          onLoadEmployees={handleLoadCompanyEmployees}
          onResetAdminPassword={handleResetCompanyAdminPassword}
          onDeleteAdmin={handleDeleteCompanyAdmin}
          onLoadLogbook={handleLoadCompanyLogbook}
          onDataChanged={refresh}
          onVerifySelf={verifySuperSelf}
          onChangeOwnCode={handleChangeSuperCode}
          onChangeOwnEmail={handleChangeSuperEmail}
          onChangeOwnPassword={handleChangeSuperPassword}
          onLogout={handleLogout}
        />
        <Footer />
      </div>
    );
  }

  const { company, userId } = state;
  const currentUser = company.accounts.find((a) => a.id === userId);
  // Das eigene Konto ist aus der Firma verschwunden — dann ist die Sitzung leer
  // und es bleibt nur die Anmeldung.
  if (!currentUser) return anmeldung;

  const { qualifications, shifts, settings, accounts, combinableSeries, logbookAccessRequests, pendingAccounts } = company;
  const isAdmin = currentUser.role === "admin";

  const handleChangePassword = actMitMeldung((password, currentPassword) =>
    api.post(`/accounts/${currentUser.id}/password`, { password, currentPassword })
  );
  const handleChangeEmail = actMitMeldung((email) => api.patch(`/accounts/${currentUser.id}/email`, { email }));
  const handleDemoteSelf = actMitMeldung(() => api.post(`/accounts/${currentUser.id}/demote`));

  /* Wer befördert wird, bleibt eingetragen, wo er eingetragen war. Ohne diesen
     Tab wären die eigenen Zuteilungen danach nirgends mehr zu sehen — samt
     Hilfegesuch, das nur von dort aus geht. */
  const hatEigeneSchichten = shifts.some((s) => s.enrolled.includes(currentUser.id));
  const tabs = tabsFor(currentUser.role, hatEigeneSchichten, isAdmin ? pendingAccounts.length : 0);
  /* Der aktive Tab kann verschwinden — durch eine Beförderung oder weil die
     letzte eigene Einschreibung zurückgezogen wurde. Sonst stünde eine leere
     Seite da. */
  const tab = tabs.some(([key]) => key === activeTab) ? activeTab : "overview";

  return (
    <div className="sb-root">
      <UpdateBanner />
      <div className="sb-app">
        <Header currentUser={currentUser} tabs={tabs} activeTab={tab} setActiveTab={setActiveTab} onLogout={handleLogout} />
        <main>
          {tab === "overview" && (
            <OverviewTab
              shifts={shifts} qualifications={qualifications} accounts={accounts}
              currentUser={currentUser} today={today} onTakeOver={handleTakeOver}
              logbookAccessRequests={logbookAccessRequests}
              onApproveLogbookRequest={handleApproveLogbookRequest}
              onDeclineLogbookRequest={handleDeclineLogbookRequest}
            />
          )}

          {tab === "shifts" && (isAdmin ? (
            <AdminShiftsTab
              shifts={shifts} qualifications={qualifications} accounts={accounts} today={today}
              combinableSeries={combinableSeries}
              onCreate={handleCreateShift} onAddQualification={handleAddQualification}
              onForceAssign={handleForceAssign} onDirectAssign={handleDirectAssign}
              onRemoveEnrollment={handleRemoveEnrollment}
              onUpdateShift={handleUpdateShift}
              onDeleteShift={handleDeleteShift} onDeleteSeries={handleDeleteSeries}
            />
          ) : (
            <EmployeeShiftsTab
              shifts={shifts} qualifications={qualifications} accounts={accounts}
              currentUser={currentUser} today={today} onToggleEnroll={handleToggleEnroll}
            />
          ))}

          {tab === "employees" && isAdmin && (
            <EmployeesTab
              accounts={accounts} qualifications={qualifications} verifyAdmin={verifySelf}
              onAddEmployee={handleAddEmployee} onResetPassword={handleResetPassword}
              onSetQualification={handleSetAccountQualification} onDeleteAccount={handleDeleteAccount}
              onPromote={handlePromoteToAdmin}
            />
          )}

          {tab === "registrations" && isAdmin && (
            <RegistrationsTab
              pendingAccounts={pendingAccounts}
              onApprove={handleApproveRegistration}
              onDecline={handleDeleteAccount}
            />
          )}

          {tab === "logbook" && isAdmin && (
            <LogbookTab onLoad={handleLoadLogbook} />
          )}

          {tab === "settings" && isAdmin && (
            <SettingsTab
              settings={settings} currentUser={currentUser} verifySelf={verifySelf}
              qualifications={qualifications}
              onAddQualification={handleAddQualification}
              onDeleteQualification={handleDeleteQualification}
              onSetOwnQualification={(qualId, value) =>
                handleSetAccountQualification(currentUser.id, qualId, value)}
              istLetzterAdmin={accounts.filter((a) => a.role === "admin").length <= 1}
              onDemoteSelf={handleDemoteSelf}
              onChangeAssignmentDay={handleChangeAssignmentDay}
              onChangeFairnessSettings={handleChangeFairnessSettings}
              onChangeOwnPassword={handleChangePassword}
              onChangeOwnEmail={handleChangeEmail}
              onDeleteOwnAccount={() => handleDeleteAccount(currentUser.id)}
              onLogout={handleLogout}
            />
          )}

          {tab === "myshifts" && (
            <MyShiftsTab
              shifts={shifts} qualifications={qualifications}
              currentUser={currentUser} today={today} assignmentDay={settings.assignmentDay}
              onAskForHelp={handleAskForHelp} onWithdraw={handleToggleEnroll}
            />
          )}

          {tab === "account" && !isAdmin && (
            <AccountTab
              currentUser={currentUser} qualifications={qualifications} verifySelf={verifySelf}
              onChangePassword={handleChangePassword} onChangeEmail={handleChangeEmail} onLogout={handleLogout}
              logbookAccessRequests={logbookAccessRequests}
              onLoadEligibleShifts={handleLoadEligibleShifts}
              onRequestLogbookAccess={handleRequestLogbookAccess}
              onLoadShiftLogbook={handleLoadShiftLogbook}
            />
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}

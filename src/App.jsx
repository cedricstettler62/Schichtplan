import { useCallback, useEffect, useState } from "react";

import Header, { tabsFor } from "./features/layout/Header.jsx";
import LoginScreen from "./features/login/LoginScreen.jsx";
import OverviewTab from "./features/overview/OverviewTab.jsx";
import AdminShiftsTab from "./features/shifts/AdminShiftsTab.jsx";
import EmployeeShiftsTab from "./features/shifts/EmployeeShiftsTab.jsx";
import MyShiftsTab from "./features/shifts/MyShiftsTab.jsx";
import EmployeesTab from "./features/employees/EmployeesTab.jsx";
import AccountTab from "./features/account/AccountTab.jsx";
import SettingsTab from "./features/settings/SettingsTab.jsx";
import LogbookTab from "./features/logbook/LogbookTab.jsx";
import SuperAdminView from "./features/superadmin/SuperAdminView.jsx";
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
/** Die App kommt ohne Router aus; die eine feste Adresse reicht als Weiche. */
function istDatenschutzSeite() {
  return typeof window !== "undefined" && window.location.pathname === "/datenschutz";
}

export default function App() {
  const [state, setState] = useState(null); // null = nicht angemeldet
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [datenschutzSeite] = useState(istDatenschutzSeite);

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
    // Auf der Datenschutzseite gibt es nichts zu laden — sie steht jedem offen.
    if (!datenschutzSeite) refresh();
  }, [refresh, datenschutzSeite]);

  // Wird bei jedem Rendern neu bestimmt — ein über Nacht offener Tab rechnet
  // damit mit heute, nicht mit gestern.
  const today = startOfToday();

  /** Aktion ausführen und danach den Serverzustand neu laden. */
  const act = (fn) => async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      return null;
    } finally {
      await refresh();
    }
  };

  /**
   * Wie `act`, gibt aber die Meldung des Servers zurück — null heisst geklappt.
   *
   * Für alles, was in einem Formular steht: Eine Änderung, die stumm scheitert,
   * sieht für die Bedienung genauso aus wie eine, die durchgegangen ist. Die
   * Oberfläche meldete daraufhin Erfolg, obwohl nichts gespeichert war.
   */
  const actMitMeldung = (fn, { neuLaden = true } = {}) => async (...args) => {
    try {
      await fn(...args);
      return null;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      return err.message;
    } finally {
      if (neuLaden) await refresh();
    }
  };

  /* --- Session --- */
  const handleLogin = async (code, name, password) => {
    try {
      await api.post("/login", { code, name, password });
    } catch (err) {
      return err.message;
    }
    setActiveTab("overview");
    await refresh();
    return null;
  };

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
  const handleLoadLogbook = () => api.get("/logbook").catch(() => []);
  const handleLoadShiftLogbook = (shiftId) => api.get(`/logbook?shiftId=${shiftId}`).catch(() => []);
  const handleLoadEligibleShifts = () => api.get("/logbook/eligible-shifts").catch(() => []);
  const handleRequestLogbookAccess = actMitMeldung((shiftId, note) =>
    api.post("/logbook/requests", { shiftId, note })
  );
  const handleApproveLogbookRequest = act((id) => api.post(`/logbook/requests/${id}/approve`));
  const handleDeclineLogbookRequest = act((id) => api.post(`/logbook/requests/${id}/decline`));
  const handleLoadCompanyLogbook = (companyId) => api.get(`/companies/${companyId}/logbook`).catch(() => []);

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

  const handleLoadCompanyAdmins = (companyId) =>
    api.get(`/companies/${companyId}/admins`).catch(() => []);

  const handleLoadCompanyEmployees = (companyId) =>
    api.get(`/companies/${companyId}/employees`).catch(() => []);

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

  /* --- Rendering --- */
  /* Die Datenschutzerklärung steht vor allem anderen: Sie muss auch ohne
     Anmeldung und ohne geladenen Zustand lesbar sein. */
  if (datenschutzSeite) {
    return (
      <div className="sb-root">
        <PrivacyScreen />
      </div>
    );
  }

  if (!ready) return <div className="sb-root" />;

  if (!state) {
    return (
      <div className="sb-root">
        <LoginScreen onLogin={handleLogin} />
        <Footer />
      </div>
    );
  }

  if (state.type === "super") {
    return (
      <div className="sb-root">
        <UpdateBanner />
        <SuperAdminView
          companies={state.companies}
          archivedCompanies={state.archivedCompanies}
          superAdminName={state.name}
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
          onLogout={handleLogout}
        />
        <Footer />
      </div>
    );
  }

  const { company, userId } = state;
  const currentUser = company.accounts.find((a) => a.id === userId);
  if (!currentUser) {
    return <div className="sb-root"><LoginScreen onLogin={handleLogin} /><Footer /></div>;
  }

  const { qualifications, shifts, settings, accounts, combinableSeries, logbookAccessRequests } = company;
  const isAdmin = currentUser.role === "admin";

  const handleChangePassword = actMitMeldung((password, currentPassword) =>
    api.post(`/accounts/${currentUser.id}/password`, { password, currentPassword })
  );
  const handleDemoteSelf = actMitMeldung(() => api.post(`/accounts/${currentUser.id}/demote`));

  /* Wer befördert wird, bleibt eingetragen, wo er eingetragen war. Ohne diesen
     Tab wären die eigenen Zuteilungen danach nirgends mehr zu sehen — samt
     Hilfegesuch, das nur von dort aus geht. */
  const hatEigeneSchichten = shifts.some((s) => s.enrolled.includes(currentUser.id));
  const tabs = tabsFor(currentUser.role, hatEigeneSchichten);
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
              onForceAssign={handleForceAssign} onRemoveEnrollment={handleRemoveEnrollment}
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
              onChangeOwnPassword={handleChangePassword}
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
              onChangePassword={handleChangePassword} onLogout={handleLogout}
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

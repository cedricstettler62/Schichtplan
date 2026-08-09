import { useCallback, useEffect, useState } from "react";

import Header from "./features/layout/Header.jsx";
import LoginScreen from "./features/login/LoginScreen.jsx";
import OverviewTab from "./features/overview/OverviewTab.jsx";
import AdminShiftsTab from "./features/shifts/AdminShiftsTab.jsx";
import EmployeeShiftsTab from "./features/shifts/EmployeeShiftsTab.jsx";
import MyShiftsTab from "./features/shifts/MyShiftsTab.jsx";
import EmployeesTab from "./features/employees/EmployeesTab.jsx";
import AccountTab from "./features/account/AccountTab.jsx";
import SettingsTab from "./features/settings/SettingsTab.jsx";
import SuperAdminView from "./features/superadmin/SuperAdminView.jsx";

import { api, ApiError } from "./api.js";
import { startOfToday } from "#shared/dates.js";

/*
 * Der Zustand lebt in der Datenbank. Diese Komponente hält nur, was gerade auf
 * dem Bildschirm ist: die Antwort von GET /api/state und den aktiven Tab.
 * Jede Änderung geht an den Server und wird danach frisch geladen — so sehen
 * alle dasselbe, auch wenn zwei Personen gleichzeitig arbeiten.
 */
export default function App() {
  const [state, setState] = useState(null); // null = nicht angemeldet
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

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
    refresh();
  }, [refresh]);

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

  const handleDeleteQualification = act((qualId) => api.del(`/qualifications/${qualId}`));

  /* --- Schichten --- */
  const handleCreateShift = act((form) => api.post("/shifts", form));
  const handleForceAssign = act((shiftId) => api.post(`/shifts/${shiftId}/assign`));
  const handleToggleEnroll = act((shiftId) => api.post(`/shifts/${shiftId}/enroll`));
  const handleAskForHelp = act((shiftId) => api.post(`/shifts/${shiftId}/help`));
  const handleTakeOver = act((shiftId, _helperId, replaceId) =>
    api.post(`/shifts/${shiftId}/takeover`, { replaceId: replaceId || null })
  );

  /* --- Konten --- */
  const handleAddEmployee = act((data) => api.post("/employees", data));

  const handleSetAccountQualification = act((accountId, qualificationId, value) =>
    api.patch(`/accounts/${accountId}/qualifications`, { qualificationId, value })
  );

  const handleUpdateEmail = act((accountId, email) => api.patch(`/accounts/${accountId}/email`, { email }));
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
  const handleCreateCompany = async (data) => {
    try {
      await api.post("/companies", data);
    } catch (err) {
      return err.message;
    }
    await refresh();
    return null;
  };

  const handleUpdateCompanyName = act((companyId, name) => api.patch(`/companies/${companyId}`, { name }));
  const handleDeleteCompany = act((companyId) => api.del(`/companies/${companyId}`));

  /* --- Rendering --- */
  if (!ready) return <div className="sb-root" />;

  if (!state) {
    return <div className="sb-root"><LoginScreen onLogin={handleLogin} /></div>;
  }

  if (state.type === "super") {
    return (
      <div className="sb-root">
        <SuperAdminView
          companies={state.companies}
          superAdminName={state.name}
          onCreateCompany={handleCreateCompany}
          onDeleteCompany={handleDeleteCompany}
          onUpdateCompanyName={handleUpdateCompanyName}
          onDataChanged={refresh}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  const { company, userId } = state;
  const currentUser = company.accounts.find((a) => a.id === userId);
  if (!currentUser) return <div className="sb-root"><LoginScreen onLogin={handleLogin} /></div>;

  const { qualifications, shifts, settings, accounts } = company;
  const isAdmin = currentUser.role === "admin";

  const handleToggleOwnQualification = (qualId, value) =>
    handleSetAccountQualification(currentUser.id, qualId, value);
  const handleUpdateOwnEmail = (email) => handleUpdateEmail(currentUser.id, email);
  const handleChangePassword = act((password, currentPassword) =>
    api.post(`/accounts/${currentUser.id}/password`, { password, currentPassword })
  );

  return (
    <div className="sb-root">
      <div className="sb-app">
        <Header currentUser={currentUser} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
        <main>
          {activeTab === "overview" && (
            <OverviewTab
              shifts={shifts} qualifications={qualifications} accounts={accounts}
              currentUser={currentUser} today={today} onTakeOver={handleTakeOver}
            />
          )}

          {activeTab === "shifts" && (isAdmin ? (
            <AdminShiftsTab
              shifts={shifts} qualifications={qualifications} today={today}
              onCreate={handleCreateShift} onAddQualification={handleAddQualification} onForceAssign={handleForceAssign}
            />
          ) : (
            <EmployeeShiftsTab
              shifts={shifts} qualifications={qualifications} accounts={accounts}
              currentUser={currentUser} today={today} onToggleEnroll={handleToggleEnroll}
            />
          ))}

          {activeTab === "employees" && isAdmin && (
            <EmployeesTab
              accounts={accounts} qualifications={qualifications} verifyAdmin={verifySelf}
              onAddEmployee={handleAddEmployee} onUpdateEmail={handleUpdateEmail}
              onSetQualification={handleSetAccountQualification} onDeleteAccount={handleDeleteAccount}
              onPromote={handlePromoteToAdmin}
            />
          )}

          {activeTab === "settings" && isAdmin && (
            <SettingsTab
              settings={settings} currentUser={currentUser} verifySelf={verifySelf}
              qualifications={qualifications}
              onAddQualification={handleAddQualification}
              onDeleteQualification={handleDeleteQualification}
              canDeleteSelf={accounts.filter((a) => a.role === "admin").length > 1}
              onChangeAssignmentDay={handleChangeAssignmentDay}
              onUpdateOwnEmail={handleUpdateOwnEmail}
              onChangeOwnPassword={handleChangePassword}
              onDeleteOwnAccount={() => handleDeleteAccount(currentUser.id)}
            />
          )}

          {activeTab === "myshifts" && !isAdmin && (
            <MyShiftsTab
              shifts={shifts} qualifications={qualifications}
              currentUser={currentUser} today={today} onAskForHelp={handleAskForHelp}
            />
          )}

          {activeTab === "account" && !isAdmin && (
            <AccountTab
              currentUser={currentUser} qualifications={qualifications} verifySelf={verifySelf}
              onToggleQualification={handleToggleOwnQualification} onChangePassword={handleChangePassword}
            />
          )}
        </main>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";

import Header from "./features/layout/Header.jsx";
import LoginScreen from "./features/login/LoginScreen.jsx";
import ForgotPasswordScreen from "./features/login/ForgotPasswordScreen.jsx";
import NewPasswordScreen from "./features/login/NewPasswordScreen.jsx";
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
/** Token aus dem Link der Passwort-Mail — die App kommt ohne Router aus. */
function resetTokenAusAdresse() {
  if (typeof window === "undefined") return null;
  if (window.location.pathname !== "/passwort-neu") return null;
  return new URLSearchParams(window.location.search).get("token");
}

export default function App() {
  const [state, setState] = useState(null); // null = nicht angemeldet
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [resetToken, setResetToken] = useState(resetTokenAusAdresse);
  const [passwortVergessen, setPasswortVergessen] = useState(false);

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

  /* Gibt die Fehlermeldung zurück statt sie zu schlucken: Das Löschen kann am
     Server scheitern, und ein Klick ohne jede Reaktion wäre nicht erklärbar. */
  const handleDeleteQualification = async (qualId) => {
    try {
      await api.del(`/qualifications/${qualId}`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      return err.message;
    } finally {
      await refresh();
    }
    return null;
  };

  /* --- Schichten --- */
  const handleCreateShift = act((form) => api.post("/shifts", form));
  const handleForceAssign = act((shiftId) => api.post(`/shifts/${shiftId}/assign`));
  const handleToggleEnroll = act((shiftId) => api.post(`/shifts/${shiftId}/enroll`));
  const handleRemoveEnrollment = act((shiftId, accountId) =>
    api.del(`/shifts/${shiftId}/enrollments/${accountId}`)
  );
  const handleDeleteShift = act((shiftId) => api.del(`/shifts/${shiftId}`));
  const handleDeleteSeries = act((shiftId) => api.del(`/shifts/${shiftId}/series`));
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

  /** Gibt die Fehlermeldung zurück – ein Reset, der stumm scheitert, wäre fatal. */
  const handleResetPassword = async (accountId, password, currentPassword) => {
    try {
      await api.post(`/accounts/${accountId}/password`, { password, currentPassword });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      return err.message;
    } finally {
      await refresh();
    }
    return null;
  };

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
  /* Der Link aus der Mail geht allem voraus — wer ihn öffnet, ist ausgesperrt
     und käme über den Anmeldebildschirm nicht weiter. */
  if (resetToken) {
    const zurueckZurAnmeldung = () => {
      window.history.replaceState({}, "", "/");
      setResetToken(null);
    };
    return (
      <div className="sb-root">
        <NewPasswordScreen token={resetToken} onDone={zurueckZurAnmeldung} />
      </div>
    );
  }

  if (!ready) return <div className="sb-root" />;

  if (!state) {
    return (
      <div className="sb-root">
        {passwortVergessen ? (
          <ForgotPasswordScreen onBack={() => setPasswortVergessen(false)} />
        ) : (
          <LoginScreen onLogin={handleLogin} onForgotPassword={() => setPasswortVergessen(true)} />
        )}
      </div>
    );
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
  if (!currentUser) {
    return <div className="sb-root"><LoginScreen onLogin={handleLogin} onForgotPassword={() => setPasswortVergessen(true)} /></div>;
  }

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
              shifts={shifts} qualifications={qualifications} accounts={accounts} today={today}
              onCreate={handleCreateShift} onAddQualification={handleAddQualification}
              onForceAssign={handleForceAssign} onRemoveEnrollment={handleRemoveEnrollment}
              onDeleteShift={handleDeleteShift} onDeleteSeries={handleDeleteSeries}
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
              onResetPassword={handleResetPassword}
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
              currentUser={currentUser} today={today} assignmentDay={settings.assignmentDay}
              onAskForHelp={handleAskForHelp} onWithdraw={handleToggleEnroll}
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

import Badge from "../../components/Badge.jsx";

const ADMIN_TABS = [
  ["overview", "Übersicht"], ["shifts", "Schichten"], ["employees", "Mitarbeitende"], ["settings", "Einstellungen"],
];
const EMPLOYEE_TABS = [
  ["overview", "Übersicht"], ["shifts", "Schichten"], ["myshifts", "Meine Schichten"], ["account", "Konto"],
];

export default function Header({ currentUser, activeTab, setActiveTab, onLogout }) {
  const isAdmin = currentUser.role === "admin";
  const tabs = isAdmin ? ADMIN_TABS : EMPLOYEE_TABS;

  return (
    <div className="sb-header">
      <div className="sb-header-top">
        <h1 className="sb-app-title sb-app-title-sm">Schichtboard</h1>
        <div className="sb-header-user">
          <span>{currentUser.name}</span>
          <Badge tone={isAdmin ? "amber" : "petrol"}>{isAdmin ? "Admin" : "Mitarbeiter"}</Badge>
          <button type="button" className="sb-link-btn" onClick={onLogout}>Abmelden</button>
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

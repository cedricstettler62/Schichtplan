import Badge from "../../components/Badge.jsx";

const ADMIN_TABS = [
  ["overview", "Übersicht"], ["shifts", "Schichten"], ["employees", "Mitarbeitende"], ["settings", "Einstellungen"],
];
const EMPLOYEE_TABS = [
  ["overview", "Übersicht"], ["shifts", "Schichten"], ["myshifts", "Meine Schichten"], ["account", "Konto"],
];

/**
 * Welche Tabs jemand sieht. Admins bekommen „Meine Schichten“ dazu, sobald sie
 * selbst irgendwo eingetragen sind — eine Beförderung nimmt sonst niemandem die
 * Schichten weg, aber die Sicht darauf.
 */
export function tabsFor(role, hatEigeneSchichten = false) {
  if (role !== "admin") return EMPLOYEE_TABS;
  if (!hatEigeneSchichten) return ADMIN_TABS;
  const [uebersicht, ...rest] = ADMIN_TABS;
  return [uebersicht, ["myshifts", "Meine Schichten"], ...rest];
}

export default function Header({ currentUser, tabs, activeTab, setActiveTab, onLogout }) {
  const isAdmin = currentUser.role === "admin";

  return (
    <header className="sb-header">
      <div className="sb-header-top">
        <h1 className="sb-app-title sb-app-title-sm">Schichtboard</h1>
        <div className="sb-header-user">
          <span className="sb-header-name">{currentUser.name}</span>
          <Badge tone={isAdmin ? "amber" : "petrol"}>{isAdmin ? "Admin" : "Mitarbeitende"}</Badge>
          <button type="button" className="sb-btn sb-btn-quiet sb-btn-sm" onClick={onLogout}>Abmelden</button>
        </div>
      </div>
      <nav className="sb-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" className={`sb-tab-btn ${activeTab === key ? "sb-tab-btn-active" : ""}`} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}

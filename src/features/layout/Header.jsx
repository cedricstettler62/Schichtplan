import Badge from "../../components/Badge.jsx";

const ADMIN_TABS = [
  ["overview", "Übersicht"], ["shifts", "Schichten"], ["employees", "Mitarbeitende"],
  ["registrations", "Anmeldungen"], ["logbook", "Logbuch"], ["settings", "Einstellungen"],
];
const EMPLOYEE_TABS = [
  ["overview", "Übersicht"], ["shifts", "Schichten"], ["myshifts", "Meine Schichten"], ["account", "Konto"],
];

/**
 * Welche Tabs jemand sieht. Admins bekommen „Meine Schichten“ dazu, sobald sie
 * selbst irgendwo eingetragen sind — eine Beförderung nimmt sonst niemandem die
 * Schichten weg, aber die Sicht darauf.
 *
 * `pendingCount` hängt an „Anmeldungen“ die Zahl offener Selbstregistrierungen
 * an — sonst müsste eine Administration den Tab öffnen, nur um zu sehen, ob
 * überhaupt etwas wartet.
 */
export function tabsFor(role, hatEigeneSchichten = false, pendingCount = 0) {
  const mitZaehler = (tabs) =>
    pendingCount > 0
      ? tabs.map(([key, label]) => (key === "registrations" ? [key, `${label} (${pendingCount})`] : [key, label]))
      : tabs;

  if (role !== "admin") return EMPLOYEE_TABS;
  if (!hatEigeneSchichten) return mitZaehler(ADMIN_TABS);
  const [uebersicht, ...rest] = ADMIN_TABS;
  return mitZaehler([uebersicht, ["myshifts", "Meine Schichten"], ...rest]);
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

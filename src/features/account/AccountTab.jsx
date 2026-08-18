import Avatar from "../../components/Avatar.jsx";
import PasswordForm from "../../components/PasswordForm.jsx";
import DataExportButton from "../../components/DataExportButton.jsx";
import CalendarSubscriptionCard from "../../components/CalendarSubscriptionCard.jsx";
import AppInstallCard from "../../components/AppInstallCard.jsx";
import SessionCard from "../../components/SessionCard.jsx";

export default function AccountTab({ currentUser, qualifications, verifySelf, onChangePassword, onLogout }) {
  const meine = qualifications.filter((q) => currentUser.qualifications.includes(q.id));
  return (
    <div className="sb-tab">
      <div className="sb-card">
        <div className="sb-account-head">
          <Avatar name={currentUser.name} role={currentUser.role} />
          <div className="sb-account-name-lg">{currentUser.name}</div>
        </div>
        <h3 className="sb-subheading">Meine Qualifikationen</h3>
        {/* Nur zum Nachlesen: Vergeben werden sie von der Administration —
            sonst wäre eine Qualifikation eine Selbstauskunft, während sie an
            jeder anderen Stelle als geprüfte Voraussetzung auftritt. */}
        <p className="sb-tab-intro">
          Bestimmt, für welche Schichten du dich einschreiben kannst. Vergeben werden Qualifikationen
          von der Administration – wenn etwas fehlt, wende dich an sie.
        </p>
        {meine.length === 0 ? (
          <p className="sb-empty">Dir ist noch keine Qualifikation zugeordnet.</p>
        ) : (
          <div className="sb-chip-row">
            {meine.map((q) => <span key={q.id} className="sb-qual-chip">{q.name}</span>)}
          </div>
        )}
      </div>

      <PasswordForm verify={verifySelf} onSubmit={onChangePassword} />

      <div className="sb-card">
        <h3 className="sb-subheading">Meine Daten</h3>
        <DataExportButton accountId={currentUser.id} />
      </div>

      <CalendarSubscriptionCard accountId={currentUser.id} />
      <AppInstallCard />
      <SessionCard onLogout={onLogout} />
    </div>
  );
}

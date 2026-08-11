import Avatar from "../../components/Avatar.jsx";
import Toggle from "../../components/Toggle.jsx";
import PasswordChangeForm from "../../components/PasswordChangeForm.jsx";

export default function AccountTab({ currentUser, qualifications, verifySelf, onToggleQualification, onChangePassword }) {
  return (
    <div className="sb-tab">
      <div className="sb-card">
        <div className="sb-account-head">
          <Avatar name={currentUser.name} role={currentUser.role} />
          <div className="sb-account-name-lg">{currentUser.name}</div>
        </div>
        <h3 className="sb-subheading">Meine Qualifikationen</h3>
        <p className="sb-tab-intro">Bestimmt, für welche Schichten du dich einschreiben kannst.</p>
        {qualifications.length === 0 ? (
          <p className="sb-empty">Für dieses Unternehmen sind noch keine Qualifikationen angelegt.</p>
        ) : (
          <div className="sb-toggle-list">
            {qualifications.map((q) => (
              <Toggle
                key={q.id}
                label={q.name}
                checked={currentUser.qualifications.includes(q.id)}
                onChange={(val) => onToggleQualification(q.id, val)}
              />
            ))}
          </div>
        )}
      </div>

      <PasswordChangeForm verify={verifySelf} onChangePassword={onChangePassword} />
    </div>
  );
}

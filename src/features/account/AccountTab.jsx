import Avatar from "../../components/Avatar.jsx";
import Toggle from "../../components/Toggle.jsx";
import PasswordChangeForm from "../../components/PasswordChangeForm.jsx";

export default function AccountTab({ currentUser, qualifications, verifySelf, onToggleQualification, onChangePassword }) {
  return (
    <div className="sb-tab">
      <div className="sb-card">
        <div className="sb-account-head">
          <Avatar name={currentUser.name} role={currentUser.role} />
          <div>
            <div className="sb-account-name-lg">{currentUser.name}</div>
            <div className="sb-account-email">{currentUser.email}</div>
          </div>
        </div>
        <h3 className="sb-subheading">Meine Ausbildung</h3>
        {qualifications.length === 0 && <p className="sb-empty">Noch keine Qualifikationen im System.</p>}
        {qualifications.map((q) => (
          <Toggle
            key={q.id}
            label={q.name}
            checked={currentUser.qualifications.includes(q.id)}
            onChange={(val) => onToggleQualification(q.id, val)}
          />
        ))}
      </div>

      <PasswordChangeForm verify={verifySelf} onChangePassword={onChangePassword} />
    </div>
  );
}

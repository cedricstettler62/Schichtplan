import { useState } from "react";
import PasswordForm from "../../components/PasswordForm.jsx";
import TabHead from "../../components/TabHead.jsx";
import Karte from "../../components/Karte.jsx";
import { useKurzeMeldung } from "../../hooks.js";
import { emailProblem } from "#shared/email.js";

/**
 * Eigener Zugang der Verwaltung: der Code, mit dem sie sich statt eines
 * Firmencodes anmeldet, eine optionale Kontaktadresse und das eigene
 * Passwort — dieselbe Selbstverwaltung wie bei Mitarbeitenden und Admins,
 * nur ohne Konten-Liste, denn es gibt nur diesen einen Zugang.
 */

/**
 * Ein einzelnes Feld mit Speichern-Knopf.
 *
 * `pruefen` liefert die Beanstandung an der Eingabe oder nichts, `onSpeichern`
 * die Meldung des Servers oder null. Gespeichert wird der getrimmte Wert; die
 * Bestätigung verschwindet nach ein paar Sekunden von selbst.
 */
function FeldKarte({ titel, intro, wert, setWert, pruefen, onSpeichern, ...inputProps }) {
  const [error, setError] = useState("");
  const [gespeichert, zeigen, verbergen] = useKurzeMeldung();

  const submit = async () => {
    const problem = pruefen(wert);
    if (problem) { setError(problem); verbergen(); return; }
    const meldung = await onSpeichern(wert.trim());
    if (meldung) { setError(meldung); verbergen(); return; }
    setError("");
    zeigen();
  };

  return (
    <Karte titel={titel} intro={intro}>
      <div className="sb-inline-add">
        <input
          value={wert}
          onChange={(e) => setWert(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          {...inputProps}
        />
        <button type="button" className="sb-btn sb-btn-ink" onClick={submit}>Speichern</button>
      </div>
      {gespeichert && <p className="sb-saved-note">Gespeichert.</p>}
      {error && <p className="sb-error">{error}</p>}
    </Karte>
  );
}

export default function SuperAdminSettingsTab({ code, email, verifySelf, onChangeCode, onChangeEmail, onChangePassword }) {
  const [codeValue, setCodeValue] = useState(code || "");
  const [emailValue, setEmailValue] = useState(email || "");

  return (
    <div className="sb-tab">
      <TabHead titel="Einstellungen" intro="Zugang und Kontaktangabe der Verwaltung." />

      <FeldKarte
        titel="Firmencode"
        intro="Der Code, mit dem du dich statt eines Firmencodes anmeldest. Muss sich von jedem vergebenen Firmencode unterscheiden."
        wert={codeValue}
        setWert={(v) => setCodeValue(v.replace(/\D/g, "").slice(0, 6))}
        pruefen={(v) => (/^\d{6}$/.test(v.trim()) ? "" : "Bitte einen 6-stelligen Firmencode eingeben.")}
        onSpeichern={onChangeCode}
        placeholder="6 Ziffern"
        inputMode="numeric"
        className="sb-mono"
        aria-label="Firmencode der Verwaltung"
      />

      <FeldKarte
        titel="E-Mail-Adresse"
        intro="Rein optional, als Kontaktangabe — die Verwaltung bekommt selbst keine Schicht zugeteilt."
        wert={emailValue}
        setWert={setEmailValue}
        pruefen={(v) => emailProblem(v)}
        onSpeichern={onChangeEmail}
        type="email"
        placeholder="name@beispiel.ch"
        aria-label="E-Mail-Adresse der Verwaltung"
      />

      <PasswordForm verify={verifySelf} onSubmit={onChangePassword} />
    </div>
  );
}

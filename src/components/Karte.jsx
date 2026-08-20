/** Karte mit Überschrift und — wo nötig — einer Einleitung darunter. Der
    Baustein, aus dem Konto, Einstellungen und Verwaltung bestehen. */
export default function Karte({ titel, intro, children }) {
  return (
    <div className="sb-card">
      <h3 className="sb-subheading">{titel}</h3>
      {intro && <p className="sb-tab-intro">{intro}</p>}
      {children}
    </div>
  );
}

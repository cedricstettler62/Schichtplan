/* Für Mitarbeitende und Admins ist die E-Mail-Adresse Pflicht — nur so kommt
   die Benachrichtigung bei einer Zuteilung wirklich an. Für die Verwaltung
   (ein einzelnes Konto, keine Mitarbeitenden, die zugeteilt werden) bleibt sie
   eine reine Kontaktangabe und damit optional. Eine Funktion für beide Fälle,
   `required` unterscheidet sie. */

/** Erster Grund, warum eine E-Mail-Adresse nicht taugt — oder null, wenn gültig. */
export function emailProblem(email, { required = false } = {}) {
  const e = String(email ?? "").trim();
  if (!e) return required ? "Eine E-Mail-Adresse ist nötig." : null;
  // Bewusst einfach: reicht, um Tippfehler abzufangen, ohne RFC 5322 nachzubauen.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Das sieht nicht nach einer gültigen E-Mail-Adresse aus.";
  return null;
}

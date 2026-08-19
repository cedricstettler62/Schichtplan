/* Passwort-Politik: eine einzige Stelle für Formular und Server, damit beide
   dieselbe Regel prüfen und kein Weg am anderen vorbei zu einem schwachen
   Passwort führt. */

export const PASSWORD_HINWEIS =
  "Mindestens 8 Zeichen, mit Buchstaben und mindestens einer Zahl oder einem Sonderzeichen.";

/** Erster Grund, warum ein Passwort nicht taugt — oder null, wenn es passt. */
export function passwortProblem(password) {
  const pw = String(password ?? "");
  if (pw.length < 8) return "Das Passwort braucht mindestens 8 Zeichen.";
  // \p{L} deckt auch ä/ö/ü und andere Schriften ab, nicht nur a–z.
  if (!/\p{L}/u.test(pw)) return "Das Passwort braucht mindestens einen Buchstaben.";
  const hatZahl = /[0-9]/.test(pw);
  const hatSonderzeichen = /[^\p{L}0-9]/u.test(pw);
  if (!hatZahl && !hatSonderzeichen) {
    return "Das Passwort braucht mindestens eine Zahl oder ein Sonderzeichen.";
  }
  return null;
}

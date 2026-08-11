/* Alle Einstellungen kommen aus Umgebungsvariablen (.env).
   Die Standardwerte sind bewusst nur für den lokalen Betrieb gedacht;
   install.sh schreibt für den Server echte, zufällige Werte. */

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    dbPath: env.SB_DB || "data/schichtplan.db",
    sessionSecret: env.SB_SESSION_SECRET || "lokaler-entwicklungsschluessel",
    superAdmin: {
      code: env.SB_SUPER_CODE || "000000",
      name: env.SB_SUPER_NAME || "Kira X",
      password: env.SB_SUPER_PASSWORD || "123456",
    },
    // Demo-Firma (111111 / Mara Vogt / 12345) nur lokal anlegen.
    seedDemo: env.SB_SEED_DEMO === "1",
    // Hinter cloudflared läuft alles über HTTPS.
    secureCookie: env.SB_SECURE_COOKIE === "1",
  };
}

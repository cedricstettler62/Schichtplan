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
    // Adresse, unter der die App von aussen erreichbar ist — der Link in der
    // Passwort-Mail muss beim Empfänger funktionieren, nicht nur auf dem Server.
    publicUrl: (env.SB_PUBLIC_URL || "http://localhost:3000").replace(/\/+$/, ""),
    /* Ohne SB_SMTP_HOST wird nicht verschickt; der Link landet dann im
       Server-Protokoll. Fürs lokale Ausprobieren reicht das. */
    smtp: env.SB_SMTP_HOST
      ? {
          host: env.SB_SMTP_HOST,
          port: Number(env.SB_SMTP_PORT || 465),
          secure: env.SB_SMTP_INSECURE !== "1",
          user: env.SB_SMTP_USER || "",
          pass: env.SB_SMTP_PASS || "",
          from: env.SB_SMTP_FROM || env.SB_SMTP_USER || "",
        }
      : null,
  };
}

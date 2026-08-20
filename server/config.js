/* Alle Einstellungen kommen aus Umgebungsvariablen (.env).
   Die Standardwerte sind bewusst nur für den lokalen Betrieb gedacht;
   install.sh schreibt für den Server echte, zufällige Werte. */

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    /* Nur auf localhost lauschen: cloudflared erreicht den Server ohnehin nur
       über http://localhost:PORT (siehe deploy/install.sh), braucht die Bindung
       an alle Netzwerkschnittstellen also gar nicht. Ohne das wäre der Port im
       lokalen Netz direkt ansprechbar — und "trust proxy" in app.js würde dann
       einer selbst gesetzten X-Forwarded-For-Kopfzeile jeder Verbindung glauben,
       was die IP-Bremse gegen Passwort-Raten (createLoginLimiter) wirkungslos
       machte: eine neue Kopfzeile, ein neues Kontingent. */
    host: env.SB_HOST || "127.0.0.1",
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
    /* Ohne SB_SMTP_HOST bleibt mail.host leer — server/mail.js verschickt dann
       nichts, sondern schreibt nur eine Log-Zeile. Benachrichtigungen sind ein
       Zusatz, kein Betriebsvoraussetzung. */
    mail: {
      host: env.SB_SMTP_HOST || "",
      port: Number(env.SB_SMTP_PORT || 587),
      secure: env.SB_SMTP_SECURE === "1",
      user: env.SB_SMTP_USER || "",
      password: env.SB_SMTP_PASSWORD || "",
      from: env.SB_MAIL_FROM || env.SB_SMTP_USER || "",
    },
  };
}

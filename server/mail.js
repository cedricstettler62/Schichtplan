/* Verschickt E-Mails über SMTP.
   Ohne konfigurierten Server (kein SB_SMTP_HOST) tut sendMail nichts ausser
   einer Log-Zeile — lokale Entwicklung und die Tests laufen so ohne echten
   Mailserver, und ein Betrieb ohne SMTP-Zugang verliert nur die
   Benachrichtigungen, nicht die Funktion selbst. */

import nodemailer from "nodemailer";

let transporter = null;
let transporterSchluessel = null; // für welche Konfiguration der Transporter gilt

function transporterFor(mail) {
  if (!mail?.host) return null;
  const schluessel = `${mail.host}:${mail.port}:${mail.user}`;
  if (transporter && transporterSchluessel === schluessel) return transporter;

  transporter = nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
  });
  transporterSchluessel = schluessel;
  return transporter;
}

/**
 * Verschickt eine Mail — oder, unkonfiguriert, gar keine ausser einer
 * Log-Zeile. Absichtlich ohne Rückgabewert und ohne zu werfen: Ein
 * fehlgeschlagener Mailversand darf die eigentliche Aktion (Registrierung,
 * Zuteilung) nie zu Fall bringen, die längst in der Datenbank steht.
 */
export async function sendMail(config, { to, subject, text, attachments }) {
  if (!to) return;
  const t = transporterFor(config?.mail);
  if (!t) {
    console.warn(`[mail] SB_SMTP_HOST nicht gesetzt — Mail an ${to} ("${subject}") wird nicht verschickt.`);
    return;
  }
  try {
    await t.sendMail({ from: config.mail.from || config.mail.user, to, subject, text, attachments });
  } catch (err) {
    console.error(`[mail] Versand an ${to} fehlgeschlagen:`, err.message);
  }
}

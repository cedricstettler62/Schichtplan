/* E-Mail-Versand über SMTP — ohne Fremdpaket, weil nur eine einzige, kurze
   Nachricht verschickt wird und jede Abhängigkeit mitgepflegt werden will.

   Ist kein SMTP eingerichtet, schreibt der Versand die Nachricht ins
   Server-Protokoll statt sie zu verwerfen. Das hält den Ablauf lokal
   benutzbar und macht eine fehlende Konfiguration sichtbar, statt sie
   stillschweigend zu verschlucken. */

import net from "node:net";
import tls from "node:tls";

function antwortLesen(socket) {
  return new Promise((resolve, reject) => {
    let puffer = "";
    const onData = (chunk) => {
      puffer += chunk.toString("utf8");
      // Letzte Zeile einer SMTP-Antwort hat ein Leerzeichen nach dem Code.
      const zeilen = puffer.split("\r\n").filter(Boolean);
      const letzte = zeilen[zeilen.length - 1];
      if (letzte && /^\d{3} /.test(letzte)) {
        socket.off("data", onData);
        socket.off("error", onError);
        const code = Number(letzte.slice(0, 3));
        if (code >= 400) reject(new Error(`SMTP ${letzte}`));
        else resolve(puffer);
      }
    };
    const onError = (err) => {
      socket.off("data", onData);
      reject(err);
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

async function befehl(socket, text) {
  socket.write(text + "\r\n");
  return antwortLesen(socket);
}

/** Kopfzeilen dürfen keine Zeilenumbrüche enthalten – sonst liessen sich weitere einschleusen. */
function kopfzeile(wert) {
  return String(wert).replace(/[\r\n]+/g, " ").trim();
}

function kodiereBetreff(betreff) {
  // Umlaute gehören nicht roh in einen Kopfzeilenwert.
  return /^[\x20-\x7E]*$/.test(betreff)
    ? betreff
    : `=?UTF-8?B?${Buffer.from(betreff, "utf8").toString("base64")}?=`;
}

async function sendeUeberSmtp(smtp, { an, betreff, text }) {
  const socket = smtp.secure
    ? tls.connect({ host: smtp.host, port: smtp.port, servername: smtp.host })
    : net.connect({ host: smtp.host, port: smtp.port });

  socket.setTimeout(15000, () => socket.destroy(new Error("Zeitüberschreitung beim Mailversand.")));

  try {
    await new Promise((resolve, reject) => {
      socket.once(smtp.secure ? "secureConnect" : "connect", resolve);
      socket.once("error", reject);
    });
    await antwortLesen(socket);
    await befehl(socket, `EHLO ${smtp.host}`);

    if (smtp.user) {
      await befehl(socket, "AUTH LOGIN");
      await befehl(socket, Buffer.from(smtp.user, "utf8").toString("base64"));
      await befehl(socket, Buffer.from(smtp.pass, "utf8").toString("base64"));
    }

    await befehl(socket, `MAIL FROM:<${kopfzeile(smtp.from)}>`);
    await befehl(socket, `RCPT TO:<${kopfzeile(an)}>`);
    await befehl(socket, "DATA");

    const koerper = [
      `From: ${kopfzeile(smtp.from)}`,
      `To: ${kopfzeile(an)}`,
      `Subject: ${kodiereBetreff(kopfzeile(betreff))}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(text, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
      ".",
    ].join("\r\n");

    await befehl(socket, koerper);
    await befehl(socket, "QUIT").catch(() => {});
  } finally {
    socket.destroy();
  }
}

/**
 * Verschickt eine Nachricht. Wirft nur, wenn SMTP eingerichtet ist und der
 * Versand scheitert — ohne Konfiguration landet die Nachricht im Protokoll.
 */
export async function sendeMail(config, nachricht) {
  const smtp = config.smtp;
  if (!smtp?.host) {
    console.warn(
      `[Mail] Kein SMTP eingerichtet. Nachricht an ${nachricht.an} nicht verschickt:\n${nachricht.text}\n`
    );
    return { verschickt: false };
  }
  await sendeUeberSmtp(smtp, nachricht);
  return { verschickt: true };
}

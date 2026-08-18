/* Dünner Wrapper um fetch. Fehler vom Server kommen als lesbarer Text zurück,
   damit die Formulare sie direkt anzeigen können. */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Keine Verbindung zum Server.", 0);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || "Es ist ein Fehler aufgetreten.", res.status);
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body = {}) => request("POST", path, body),
  patch: (path, body = {}) => request("PATCH", path, body),
  del: (path, body) => request("DELETE", path, body),
};

/* Die Datei-Übertragungen gehen am JSON-Wrapper vorbei — mal kommt eine Datei
   zurück, mal geht eine hin. */

/** Legt die Antwort im Download-Ordner ab und gibt den Dateinamen zurück. */
async function alsDateiSpeichern(res, ersatzName) {
  const zuordnung = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
  const name = zuordnung ? zuordnung[1] : ersatzName;

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return name;
}

/** Lädt die Datenbank als Datei herunter und gibt den Dateinamen zurück. */
export async function downloadDatabase() {
  const res = await fetch("/api/admin/db/export", { credentials: "same-origin" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || "Der Export ist fehlgeschlagen.", res.status);
  }
  return alsDateiSpeichern(res, "schichtplan.db");
}

/** Kalenderabo (iCal): aktueller Stand — aus, oder die Adresse zum Kopieren. */
export function calendarStatus(accountId) {
  return api.get(`/accounts/${accountId}/calendar-token`);
}

/** Schaltet das eigene Kalenderabo ein oder erzeugt eine neue Adresse. */
export function renewCalendarToken(accountId) {
  return api.post(`/accounts/${accountId}/calendar-token`);
}

/** Auskunft über ein Konto als Datei — alles, was zu der Person gespeichert ist. */
export async function downloadPersonalData(accountId) {
  const res = await fetch(`/api/accounts/${accountId}/data`, { credentials: "same-origin" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || "Die Auskunft ist fehlgeschlagen.", res.status);
  }
  return alsDateiSpeichern(res, "auskunft.json");
}

/** Schickt eine Sicherungsdatei an den Server, der sie einspielt. */
export async function uploadDatabase(file) {
  const res = await fetch("/api/admin/db/import", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || "Der Import ist fehlgeschlagen.", res.status);
  return data;
}

/* Die API, so wie der Browser sie benutzt — inklusive der Regeln, die im
   Browser bisher nur durch ausgegraute Knöpfe galten. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { toISO, startOfToday } from "#shared/dates.js";
import { createCompany, openDb, readCompany } from "../server/db.js";
import { ADMIN, EMPLOYEE, SUPER, createClient, startTestServer } from "./helpers/server.js";

let server;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

const client = () => createClient(server.url);
const heute = () => toISO(startOfToday());

async function asAdmin() {
  const c = client();
  await c.login(ADMIN);
  return c;
}

describe("Anmeldung", () => {
  test("ohne Cookie gibt es keine Daten", async () => {
    expect((await client().get("/api/state")).status).toBe(401);
  });

  test("unbekannter Firmencode", async () => {
    const res = await client().login({ code: "999999", name: "Wer Auch Immer", password: "egal" });
    expect(res.status).toBe(401);
    expect(res.data.error).toBe("Unbekannter Firmencode.");
  });

  test("falsches Passwort", async () => {
    const res = await client().login({ ...ADMIN, password: "falsch" });
    expect(res.status).toBe(401);
    expect(res.data.error).toBe("Name oder Passwort ist falsch.");
  });

  test("nach dem Login kommt der eigene Firmenzustand — ohne Passwörter", async () => {
    const c = await asAdmin();
    const { data } = await c.get("/api/state");

    expect(data.type).toBe("company");
    expect(data.company.name).toBe("Erste Firma AG");
    expect(data.company.accounts.map((a) => a.name)).toContain("Lea Brunner");
    const felder = Object.keys(data.company.accounts[0]);
    expect(felder).not.toContain("password");
    expect(felder).not.toContain("password_hash");
    expect(JSON.stringify(data)).not.toContain("$2");  // kein bcrypt-Hash irgendwo
  });

  test("Abmelden beendet die Sitzung", async () => {
    const c = await asAdmin();
    await c.post("/api/logout");
    expect((await c.get("/api/state")).status).toBe(401);
  });
});

describe("Schichten", () => {
  test("eine angelegte Schicht sehen auch die anderen", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const qualId = state.company.qualifications[0].id;

    const created = await admin.post("/api/shifts", {
      name: "Spätschicht Verkauf",
      date: heute(),
      startTime: "08:00",
      endTime: "16:00",
      repeat: "once",
      seats: 1,
      qualificationId: qualId,
    });
    expect(created.status).toBe(200);

    const lea = client();
    await lea.login(EMPLOYEE);
    const { data } = await lea.get("/api/state");
    expect(data.company.shifts.map((s) => s.name)).toEqual(["Spätschicht Verkauf"]);
  });

  test("Mitarbeitende dürfen keine Schichten anlegen", async () => {
    const lea = client();
    await lea.login(EMPLOYEE);
    const res = await lea.post("/api/shifts", {
      name: "Heimlich", date: heute(), startTime: "08:00", endTime: "16:00",
      repeat: "once", seats: 1, qualificationId: "q1",
    });
    expect(res.status).toBe(403);
  });

  test("Einschreiben teilt automatisch zu, sobald der Tag zuteilbar ist", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const qualId = state.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationId: qualId,
    });

    const lea = client();
    await lea.login(EMPLOYEE);
    const shiftId = (await lea.get("/api/state")).data.company.shifts[0].id;
    await lea.post(`/api/shifts/${shiftId}/enroll`);

    const shift = (await lea.get("/api/state")).data.company.shifts[0];
    expect(shift.enrolled).toHaveLength(1);
    expect(shift.assigned).toEqual(shift.enrolled);
  });

  test("eine volle Schicht lässt sich nicht übernehmen", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const qualId = state.company.qualifications[0].id;

    // Zweite Mitarbeiterin mit derselben Qualifikation.
    const { data: neu } = await admin.post("/api/employees", {
      name: "Tom Klein", email: "tom@firma.ch", password: "12345",
    });
    await admin.patch(`/api/accounts/${neu.id}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Nachtdienst", date: heute(), startTime: "22:00", endTime: "06:00",
      repeat: "once", seats: 1, qualificationId: qualId,
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    expect((await lea.get("/api/state")).data.company.shifts[0].assigned).toHaveLength(1);

    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "12345" });
    const res = await tom.post(`/api/shifts/${shiftId}/takeover`, { replaceId: null });

    expect(res.status).toBe(409);
    expect((await admin.get("/api/state")).data.company.shifts[0].assigned).toHaveLength(1);
  });

  test("ohne passende Qualifikation kein Einschreiben", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    // Die dritte Qualifikation hat im Seed niemand.
    const fremd = state.company.qualifications[2].id;
    await admin.post("/api/shifts", {
      name: "Lager", date: heute(), startTime: "08:00", endTime: "16:00",
      repeat: "once", seats: 1, qualificationId: fremd,
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/shifts/${shiftId}/enroll`)).status).toBe(403);
  });
});

describe("Konten", () => {
  test("das letzte Admin-Konto bleibt bestehen", async () => {
    const admin = await asAdmin();
    const { data } = await admin.get("/api/state");
    const mara = data.company.accounts.find((a) => a.role === "admin");

    const res = await admin.del(`/api/accounts/${mara.id}`);
    expect(res.status).toBe(409);
  });

  test("Mitarbeitende ändern fremde Konten nicht", async () => {
    const admin = await asAdmin();
    const mara = (await admin.get("/api/state")).data.company.accounts.find((a) => a.role === "admin");

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.patch(`/api/accounts/${mara.id}/email`, { email: "hacker@x.ch" })).status).toBe(403);
    expect((await lea.post(`/api/accounts/${mara.id}/promote`)).status).toBe(403);
  });

  test("Konten einer fremden Firma sind unsichtbar", async () => {
    const fremdeId = createCompany(server.db, {
      code: "222222", name: "Zweite Firma AG",
      adminName: "Andere Chefin", adminEmail: "chefin@zweite.ch", adminPassword: "12345",
    });
    const fremdesKonto = readCompany(server.db, fremdeId).accounts[0].id;

    const admin = await asAdmin();
    expect((await admin.patch(`/api/accounts/${fremdesKonto}/email`, { email: "x@y.ch" })).status).toBe(404);
  });

  test("Passwort ändern verlangt das alte Passwort", async () => {
    const lea = client();
    await lea.login(EMPLOYEE);
    const meineId = (await lea.get("/api/state")).data.userId;

    expect((await lea.post(`/api/accounts/${meineId}/password`, {
      password: "neuesGeheim", currentPassword: "falsch",
    })).status).toBe(403);

    expect((await lea.post(`/api/accounts/${meineId}/password`, {
      password: "neuesGeheim", currentPassword: "12345",
    })).status).toBe(200);

    const nochmal = client();
    expect((await nochmal.login({ ...EMPLOYEE, password: "neuesGeheim" })).status).toBe(200);
  });
});

describe("Verwaltung", () => {
  test("legt Unternehmen an, aber keinen doppelten Firmencode", async () => {
    const su = client();
    await su.login(SUPER);

    const daten = {
      name: "Zweite Firma AG", code: "222222",
      adminName: "Neue Chefin", adminEmail: "chefin@zweite.ch", adminPassword: "12345",
    };
    expect((await su.post("/api/companies", daten)).status).toBe(200);

    const doppelt = await su.post("/api/companies", { ...daten, code: "111111" });
    expect(doppelt.status).toBe(409);
    expect(doppelt.data.error).toBe("Dieser Firmencode wird bereits verwendet.");

    const neueAdmin = client();
    expect((await neueAdmin.login({ code: "222222", name: "Neue Chefin", password: "12345" })).status).toBe(200);
  });

  test("Firmen-Admins kommen nicht an die Verwaltung", async () => {
    const admin = await asAdmin();
    expect((await admin.post("/api/companies", { name: "X", code: "333333" })).status).toBe(403);
  });
});

describe("Wartung", () => {
  const alsSuper = async () => {
    const c = createClient(server.url);
    await c.login(SUPER);
    return c;
  };

  test("nur die Verwaltung kommt an den Wartungsbereich", async () => {
    expect((await client().get("/api/admin/info")).status).toBe(403);

    const admin = await asAdmin();
    expect((await admin.get("/api/admin/info")).status).toBe(403);
    expect((await admin.raw("GET", "/api/admin/db/export")).status).toBe(403);
  });

  test("der Export ist eine gültige Datenbank", async () => {
    const su = await alsSuper();
    const res = await su.raw("GET", "/api/admin/db/export");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/schichtplan_.*\.db/);

    const datei = path.join(server.dir, "export.db");
    fs.writeFileSync(datei, Buffer.from(await res.arrayBuffer()));
    expect(readCompany(openDb(datei), server.db.prepare("SELECT id FROM companies").get().id).code).toBe("111111");
  });

  test("eine Fremddatei wird abgewiesen", async () => {
    const su = await alsSuper();
    const res = await su.raw("POST", "/api/admin/db/import", {
      body: Buffer.from("das ist keine Datenbank"),
      contentType: "application/octet-stream",
    });

    expect(res.status).toBe(400);
    // Der alte Stand steht unverändert da.
    expect((await su.get("/api/admin/info")).data.db.companies).toBe(1);
  });

  test("eine Sicherung ersetzt den jetzigen Stand — mit Sicherheitskopie", async () => {
    const su = await alsSuper();
    const sicherung = Buffer.from(await (await su.raw("GET", "/api/admin/db/export")).arrayBuffer());

    await su.post("/api/companies", {
      name: "Kommt Wieder Weg AG", code: "555555",
      adminName: "Chefin", adminEmail: "c@x.ch", adminPassword: "12345",
    });
    expect((await su.get("/api/admin/info")).data.db.companies).toBe(2);

    const res = await su.raw("POST", "/api/admin/db/import", {
      body: sicherung,
      contentType: "application/octet-stream",
    });
    expect(res.status).toBe(200);

    // Der eingespielte Stand gilt sofort, ohne Neustart.
    expect((await su.get("/api/admin/info")).data.db.companies).toBe(1);
    expect(fs.readdirSync(path.join(server.dir, "backups")).some((f) => f.startsWith("vor-import_"))).toBe(true);

    // Und die alte Anmeldung funktioniert weiter.
    const lea = client();
    expect((await lea.login(EMPLOYEE)).status).toBe(200);
  });

  test("das Update wird nur angefordert, nicht selbst ausgeführt", async () => {
    const su = await alsSuper();
    expect((await su.post("/api/admin/update")).status).toBe(200);

    // Der Webdienst legt nur diese Marker-Datei an — den Rest macht systemd.
    expect(fs.existsSync(path.join(server.dir, "data", "update-requested"))).toBe(true);
    expect((await su.get("/api/admin/info")).data.update.state).toBe("angefordert");
  });
});

describe("Neustart", () => {
  test("die Daten liegen in der Datei und überleben", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schichtboard-"));
    const file = path.join(dir, "test.db");

    const erst = openDb(file);
    const companyId = createCompany(erst, {
      code: "444444", name: "Bleibt Bestehen AG",
      adminName: "Chefin", adminEmail: "c@x.ch", adminPassword: "12345",
    });
    erst.close();

    const zweit = openDb(file);
    expect(readCompany(zweit, companyId).name).toBe("Bleibt Bestehen AG");
    zweit.close();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

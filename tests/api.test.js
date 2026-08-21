/* Die API, so wie der Browser sie benutzt — inklusive der Regeln, die im
   Browser bisher nur durch ausgegraute Knöpfe galten. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addDays, addMonths, toISO, startOfToday } from "#shared/dates.js";
import { REPEAT_KEYS } from "#shared/labels.js";
import { extendSeries, purgeOldShifts } from "../server/assignment.js";
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

/** Eine im Test brauchbare Adresse, deterministisch aus dem Namen. */
const testMail = (name) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@beispiel.ch`;

/** Löst den Einladungslink eines frisch angelegten Kontos direkt aus der
 *  Datenbank ein — im echten Betrieb kommt er per Mail, hier ist das Zeichen
 *  in password_resets derselbe Link, nur ohne den Umweg über den Posteingang. */
async function loeseEinladungEin(accountId, password) {
  const { token } = server.db.prepare("SELECT token FROM password_resets WHERE account_id = ?").get(accountId);
  return client().post(`/api/password-setup/${token}`, { password });
}

/** Legt ein Mitarbeitendenkonto an und richtet gleich das gewünschte Passwort ein. */
async function legeMitarbeitendeAn(admin, { name, password, email }) {
  const { data } = await admin.post("/api/employees", { name, email: email || testMail(name) });
  if (password) await loeseEinladungEin(data.id, password);
  return data.id;
}

describe("Anmeldung", () => {
  test("ohne Cookie gibt es keine Daten", async () => {
    expect((await client().get("/api/state")).status).toBe(401);
  });

  test("unbekannter Firmencode", async () => {
    const res = await client().login({ code: "999999", name: "Wer Auch Immer", password: "egal" });
    expect(res.status).toBe(401);
    // Dieselbe Meldung wie bei falschem Namen/Passwort — sie verrät nicht,
    // welcher der drei Werte falsch war.
    expect(res.data.error).toBe("Firmencode, Name oder Passwort ist falsch.");
  });

  test("falsches Passwort", async () => {
    const res = await client().login({ ...ADMIN, password: "falsch" });
    expect(res.status).toBe(401);
    expect(res.data.error).toBe("Firmencode, Name oder Passwort ist falsch.");
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

describe("Eingespielter Stand", () => {
  test("/api/health nennt die Fassung — daran erkennt ein offenes Fenster ein Update", async () => {
    const { status, data } = await client().get("/api/health");

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(typeof data.version).toBe("string");
    expect(data.version.length).toBeGreaterThan(0);
  });
});

describe("Angemeldet bleiben", () => {
  /* Einmal anmelden, danach nie wieder — bis das Passwort wechselt oder sich
     jemand abmeldet. Beides muss jede Anmeldung treffen, die mit dem alten
     Passwort zustande kam, sonst liefe ein verlorenes Telefon weiter. */

  /** Dieselbe Person auf einem zweiten Gerät. */
  const zweitesGeraet = async (who) => {
    const c = client();
    await c.login(who);
    return c;
  };

  const eigeneId = async (c) => (await c.get("/api/state")).data.userId;

  test("das Cookie gilt weit über ein Jahr", async () => {
    const c = client();
    const res = await c.raw("POST", "/api/login", {
      body: JSON.stringify(ADMIN),
      contentType: "application/json",
    });

    const cookie = (res.headers.getSetCookie?.() ?? []).find((z) => z.startsWith("sb_session="));
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)[1]);
    expect(maxAge).toBeGreaterThan(365 * 24 * 60 * 60);
  });

  test("jeder Abruf des Zustands verlängert die Anmeldung", async () => {
    const c = await asAdmin();
    const res = await c.raw("GET", "/api/state");

    expect((res.headers.getSetCookie?.() ?? []).some((z) => z.startsWith("sb_session="))).toBe(true);
  });

  test("eine Passwortänderung meldet die anderen Geräte ab", async () => {
    const hier = await zweitesGeraet(EMPLOYEE);
    const dort = await zweitesGeraet(EMPLOYEE);
    const id = await eigeneId(hier);

    const res = await hier.post(`/api/accounts/${id}/password`, {
      password: "neuesPasswort1", currentPassword: EMPLOYEE.password,
    });
    expect(res.status).toBe(200);

    // Das Gerät, an dem gerade jemand sitzt, bleibt drin.
    expect((await hier.get("/api/state")).status).toBe(200);
    expect((await dort.get("/api/state")).status).toBe(401);
  });

  test("setzt die Administration ein Passwort zurück, ist das alte Gerät draussen", async () => {
    const admin = await asAdmin();
    const lea = await zweitesGeraet(EMPLOYEE);
    const leaId = await eigeneId(lea);

    await admin.post(`/api/accounts/${leaId}/password`, {
      password: "vonAdminGesetzt1", currentPassword: ADMIN.password,
    });

    expect((await lea.get("/api/state")).status).toBe(401);
    expect((await admin.get("/api/state")).status).toBe(200);
  });

  test("befreit die Verwaltung ein Admin-Konto, endet dessen alte Anmeldung", async () => {
    const admin = await asAdmin();
    const su = client();
    await su.login(SUPER);

    const firmaId = server.db.prepare("SELECT id FROM companies WHERE code = '111111'").get().id;
    const maraId = server.db.prepare("SELECT id FROM accounts WHERE name = 'Mara Vogt'").get().id;

    await su.post(`/api/companies/${firmaId}/admins/${maraId}/password`, {
      password: "wiederDrin1", currentPassword: SUPER.password,
    });

    expect((await admin.get("/api/state")).status).toBe(401);
  });

  test("Abmelden betrifft nur das eigene Gerät", async () => {
    const hier = await zweitesGeraet(EMPLOYEE);
    const dort = await zweitesGeraet(EMPLOYEE);

    await hier.post("/api/logout");

    expect((await hier.get("/api/state")).status).toBe(401);
    expect((await dort.get("/api/state")).status).toBe(200);
  });

  test("ein Cookie aus der Zeit vor der Passwortänderung wird nicht wieder gültig", async () => {
    const alt = await zweitesGeraet(EMPLOYEE);
    const id = await eigeneId(alt);
    const neu = await zweitesGeraet(EMPLOYEE);

    await neu.post(`/api/accounts/${id}/password`, {
      password: "einsZweiDrei1", currentPassword: EMPLOYEE.password,
    });
    expect((await alt.get("/api/state")).status).toBe(401);

    // Auch nach einer weiteren Änderung bleibt das erste Gerät draussen.
    await neu.post(`/api/accounts/${id}/password`, {
      password: "vierFuenfSechs1", currentPassword: "einsZweiDrei1",
    });
    expect((await alt.get("/api/state")).status).toBe(401);
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
      qualificationIds: [qualId],
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
      repeat: "once", seats: 1, qualificationIds: ["q1"],
    });
    expect(res.status).toBe(403);
  });

  test("Einschreiben teilt automatisch zu, sobald der Tag zuteilbar ist", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const qualId = state.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
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
    const tomId = await legeMitarbeitendeAn(admin, {
      name: "Tom Klein", password: "geheim123",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Nachtdienst", date: heute(), startTime: "22:00", endTime: "06:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    expect((await lea.get("/api/state")).data.company.shifts[0].assigned).toHaveLength(1);

    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "geheim123" });
    const res = await tom.post(`/api/shifts/${shiftId}/takeover`, { replaceId: null });

    expect(res.status).toBe(409);
    expect((await admin.get("/api/state")).data.company.shifts[0].assigned).toHaveLength(1);
  });

  test("aus einer festen Zuteilung trägt sich niemand selbst aus", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const zugeteilt = (await lea.get("/api/state")).data.company.shifts[0];
    expect(zugeteilt.assigned).toHaveLength(1);

    // Zweiter Aufruf wäre bisher ein stilles Austragen gewesen.
    const res = await lea.post(`/api/shifts/${shiftId}/enroll`);
    expect(res.status).toBe(403);
    expect((await lea.get("/api/state")).data.company.shifts[0].assigned).toHaveLength(1);
  });

  test("die Administration trägt eine zugeteilte Person aus", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const leaId = (await lea.get("/api/state")).data.userId;
    await lea.post(`/api/shifts/${shiftId}/help`);

    const res = await admin.del(`/api/shifts/${shiftId}/enrollments/${leaId}`);
    expect(res.status).toBe(200);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.assigned).toEqual([]);
    expect(shift.enrolled).toEqual([]);
    expect(shift.helpRequests).toEqual([]); // das Hilfegesuch darf nicht verwaisen
    // Gilt als versuchte, offen gebliebene Zuteilung – sonst taucht die
    // Schicht in der Übersicht nicht unter "Noch offene Plätze" auf.
    expect(shift.assignmentAttempted).toBe(true);
    // Ohne Zugeteilte darf kein Zuteilungsdatum stehen bleiben.
    expect(shift.assignedAt).toBeNull();
  });

  test("ein frei gemachter Platz wird nicht automatisch nachbesetzt", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;

    const tomId = await legeMitarbeitendeAn(admin, {
      name: "Tom Klein", password: "geheim123",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    // Beide schreiben sich ein, einer bekommt den einen Platz.
    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "geheim123" });
    await tom.post(`/api/shifts/${shiftId}/enroll`);

    const vorher = (await admin.get("/api/state")).data.company.shifts[0];
    expect(vorher.assigned).toHaveLength(1);
    expect(vorher.enrolled).toHaveLength(2);

    await admin.del(`/api/shifts/${shiftId}/enrollments/${vorher.assigned[0]}`);

    const nachher = (await admin.get("/api/state")).data.company.shifts[0];
    expect(nachher.assigned).toEqual([]); // die wartende Person rückt nicht nach
    expect(nachher.enrolled).toHaveLength(1);
    expect(nachher.assignmentAttempted).toBe(true);

    // Auch ein späterer Zuteilungslauf lässt den Platz frei.
    await lea.post(`/api/shifts/${shiftId}/help`).catch(() => {});
    expect((await admin.get("/api/state")).data.company.shifts[0].assigned).toEqual([]);
  });

  test("die Administration kann den frei gemachten Platz bewusst zuteilen", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;

    const tomId = await legeMitarbeitendeAn(admin, {
      name: "Tom Klein", password: "geheim123",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "geheim123" });
    await tom.post(`/api/shifts/${shiftId}/enroll`);

    const vorher = (await admin.get("/api/state")).data.company.shifts[0];
    await admin.del(`/api/shifts/${shiftId}/enrollments/${vorher.assigned[0]}`);
    await admin.post(`/api/shifts/${shiftId}/assign`);

    expect((await admin.get("/api/state")).data.company.shifts[0].assigned).toHaveLength(1);
  });

  test("Mitarbeitende tragen niemanden aus", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const leaId = (await lea.get("/api/state")).data.userId;

    expect((await lea.del(`/api/shifts/${shiftId}/enrollments/${leaId}`)).status).toBe(403);
    expect((await admin.get("/api/state")).data.company.shifts[0].assigned).toHaveLength(1);
  });

  test("vor dem Zuteilungstag wird nur eingeschrieben, nicht zugeteilt", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    // Zuteilungstag auf morgen, damit er heute sicher noch nicht erreicht ist.
    const morgen = Math.min(28, startOfToday().getDate() + 1);
    await admin.patch("/api/settings", { assignmentDay: morgen });

    // Schicht im nächsten Monat: der Zuteilungstermin liegt noch vor uns.
    const naechsterMonat = new Date();
    naechsterMonat.setMonth(naechsterMonat.getMonth() + 1, 15);
    await admin.post("/api/shifts", {
      name: "Spätdienst", date: toISO(naechsterMonat), startTime: "14:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.enrolled).toHaveLength(1);
    expect(shift.assigned).toEqual([]);
    expect(shift.assignmentAttempted).toBe(false);
  });

  test("nach der Auslosung teilt das Einschreiben sofort zu", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    // Schicht von heute: der Zuteilungstermin ist längst vorbei, die Auslosung
    // läuft beim Anlegen und findet niemanden.
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const offen = (await admin.get("/api/state")).data.company.shifts[0];
    expect(offen.assignmentAttempted).toBe(true);
    expect(offen.assigned).toEqual([]);

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${offen.id}/enroll`);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.assigned).toHaveLength(1);
    expect(shift.assignedAt).toBe(heute());
  });

  test("ist die Schicht voll, schreibt sich die nächste Person nur ein", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const tomId = await legeMitarbeitendeAn(admin, {
      name: "Tom Klein", password: "geheim123",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "geheim123" });
    await tom.post(`/api/shifts/${shiftId}/enroll`);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.assigned).toHaveLength(1); // die Platzzahl bleibt gewahrt
    expect(shift.enrolled).toHaveLength(2);
  });

  test("die Auslosung räumt die Warteliste ab", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const tomId = await legeMitarbeitendeAn(admin, {
      name: "Tom Klein", password: "geheim123",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    // Zuteilungstag auf morgen: die Auslosung läuft erst auf Anordnung.
    const morgen = Math.min(28, startOfToday().getDate() + 1);
    await admin.patch("/api/settings", { assignmentDay: morgen });
    const naechsterMonat = new Date();
    naechsterMonat.setMonth(naechsterMonat.getMonth() + 1, 15);
    await admin.post("/api/shifts", {
      name: "Spätdienst", date: toISO(naechsterMonat), startTime: "14:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "geheim123" });
    await tom.post(`/api/shifts/${shiftId}/enroll`);

    // Vor der Auslosung stehen beide auf der Liste.
    expect((await admin.get("/api/state")).data.company.shifts[0].enrolled).toHaveLength(2);

    await admin.post(`/api/shifts/${shiftId}/assign`);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.assigned).toHaveLength(1);
    // Wer leer ausgeht, verschwindet aus der Schicht — und damit aus "Meine Schichten".
    expect(shift.enrolled).toEqual(shift.assigned);
  });

  test("ohne Zusage verschwindet die Schicht aus der eigenen Liste", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const tomId = await legeMitarbeitendeAn(admin, {
      name: "Tom Klein", password: "geheim123",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    const morgen = Math.min(28, startOfToday().getDate() + 1);
    await admin.patch("/api/settings", { assignmentDay: morgen });
    const naechsterMonat = new Date();
    naechsterMonat.setMonth(naechsterMonat.getMonth() + 1, 15);
    await admin.post("/api/shifts", {
      name: "Spätdienst", date: toISO(naechsterMonat), startTime: "14:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const leaId = (await lea.get("/api/state")).data.userId;
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "geheim123" });
    await tom.post(`/api/shifts/${shiftId}/enroll`);

    await admin.post(`/api/shifts/${shiftId}/assign`);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    const leerAusgegangen = shift.assigned.includes(leaId) ? tomId : leaId;
    expect(shift.enrolled).not.toContain(leerAusgegangen);
  });

  test("vor der Auslosung bleibt die Warteliste erhalten", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const morgen = Math.min(28, startOfToday().getDate() + 1);
    await admin.patch("/api/settings", { assignmentDay: morgen });

    const naechsterMonat = new Date();
    naechsterMonat.setMonth(naechsterMonat.getMonth() + 1, 15);
    await admin.post("/api/shifts", {
      name: "Spätdienst", date: toISO(naechsterMonat), startTime: "14:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);

    // Eine fremde Aktion darf die Warteliste nicht vorzeitig abräumen.
    await admin.patch("/api/settings", { assignmentDay: morgen });
    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.enrolled).toHaveLength(1);
    expect(shift.assigned).toEqual([]);
  });

  test("die Administration löscht eine einzelne Schicht", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);

    expect((await admin.del(`/api/shifts/${shiftId}`)).status).toBe(200);
    expect((await admin.get("/api/state")).data.company.shifts).toEqual([]);
  });

  test("Mitarbeitende löschen keine Schichten", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.del(`/api/shifts/${shiftId}`)).status).toBe(403);
    expect((await admin.get("/api/state")).data.company.shifts).toHaveLength(1);
  });

  test("eine gelöschte Serie wird nicht wieder nachgefüllt", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Tagesdienst", date: heute(), startTime: "08:00", endTime: "16:00",
      repeat: "daily", seats: 1, qualificationIds: [qualId],
    });
    const vorher = (await admin.get("/api/state")).data.company.shifts;
    expect(vorher.length).toBeGreaterThan(50);

    expect((await admin.del(`/api/shifts/${vorher[0].id}/series`)).status).toBe(200);
    expect((await admin.get("/api/state")).data.company.shifts).toEqual([]);

    // Der Nachfüll-Lauf darf die Serie nicht wiederbeleben.
    extendSeries(server.db);
    expect((await admin.get("/api/state")).data.company.shifts).toEqual([]);
  });

  test("das Löschen eines Kontos macht seine Schichten sichtbar offen", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;

    const tomId = await legeMitarbeitendeAn(admin, {
      name: "Tom Klein", password: "geheim123",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    // Beide eingeschrieben, eine Person bekommt den Platz.
    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "geheim123" });
    await tom.post(`/api/shifts/${shiftId}/enroll`);

    const belegt = (await admin.get("/api/state")).data.company.shifts[0];
    expect(belegt.assigned).toHaveLength(1);

    await admin.del(`/api/accounts/${belegt.assigned[0]}`);

    const offen = (await admin.get("/api/state")).data.company.shifts[0];
    expect(offen.assigned).toEqual([]); // die andere Person rückt nicht still nach
    expect(offen.assignmentAttempted).toBe(true); // erscheint unter "Noch offene Plätze"
    expect(offen.assignedAt).toBeNull();
  });

  test("eine Qualifikation, die kommende Schichten verlangen, bleibt bestehen", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });

    const res = await admin.del(`/api/qualifications/${qualId}`);
    expect(res.status).toBe(409);

    // Sonst stünde die Schicht ohne Qualifikation da und wäre unbesetzbar.
    const state = (await admin.get("/api/state")).data.company;
    expect(state.qualifications.some((q) => q.id === qualId)).toBe(true);
    expect(state.shifts[0].qualificationIds).toEqual([qualId]);

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/shifts/${state.shifts[0].id}/enroll`)).status).toBe(200);
  });

  test("eine ungenutzte Qualifikation lässt sich löschen", async () => {
    const admin = await asAdmin();
    const { data: neu } = await admin.post("/api/qualifications", { name: "Gabelstapler" });

    expect((await admin.del(`/api/qualifications/${neu.id}`)).status).toBe(200);
    const quals = (await admin.get("/api/state")).data.company.qualifications;
    expect(quals.some((q) => q.id === neu.id)).toBe(false);
  });

  test("ohne passende Qualifikation kein Einschreiben", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    // Die dritte Qualifikation hat im Seed niemand.
    const fremd = state.company.qualifications[2].id;
    await admin.post("/api/shifts", {
      name: "Lager", date: heute(), startTime: "08:00", endTime: "16:00",
      repeat: "once", seats: 1, qualificationIds: [fremd],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/shifts/${shiftId}/enroll`)).status).toBe(403);
  });
});

describe("Direkte Zuweisung durch die Administration", () => {
  test("weist eine qualifizierte Person zu, ohne dass sie sich eingeschrieben hat", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 2, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    const leaId = (await admin.get("/api/state")).data.company.accounts.find((a) => a.name === "Lea Brunner").id;

    const res = await admin.post(`/api/shifts/${shiftId}/assign-manual`, { accountId: leaId });
    expect(res.status).toBe(200);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.assigned).toEqual([leaId]);
    expect(shift.assignmentTypes[leaId]).toBe("manual");

    // Sichtbar für die betroffene Person selbst.
    const lea = client();
    await lea.login(EMPLOYEE);
    const ihreSicht = (await lea.get("/api/state")).data.company.shifts[0];
    expect(ihreSicht.assignmentTypes[leaId]).toBe("manual");
  });

  test("ohne passende Qualifikation keine Zuweisung", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const fremd = state.company.qualifications[2].id; // hat im Seed niemand
    await admin.post("/api/shifts", {
      name: "Lager", date: heute(), startTime: "08:00", endTime: "16:00",
      repeat: "once", seats: 1, qualificationIds: [fremd],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    const leaId = state.company.accounts.find((a) => a.name === "Lea Brunner").id;

    const res = await admin.post(`/api/shifts/${shiftId}/assign-manual`, { accountId: leaId });
    expect(res.status).toBe(403);
  });

  test("überschreitet die Platzzahl nicht", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const qualId = state.company.qualifications[0].id;
    const tomId = await legeMitarbeitendeAn(admin, { name: "Tom Klein", password: "geheim123" });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    const leaId = state.company.accounts.find((a) => a.name === "Lea Brunner").id;

    expect((await admin.post(`/api/shifts/${shiftId}/assign-manual`, { accountId: leaId })).status).toBe(200);
    const res = await admin.post(`/api/shifts/${shiftId}/assign-manual`, { accountId: tomId });
    expect(res.status).toBe(409);
  });

  test("dieselbe Person lässt sich nicht doppelt zuweisen", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const qualId = state.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 2, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    const leaId = state.company.accounts.find((a) => a.name === "Lea Brunner").id;

    await admin.post(`/api/shifts/${shiftId}/assign-manual`, { accountId: leaId });
    const res = await admin.post(`/api/shifts/${shiftId}/assign-manual`, { accountId: leaId });
    expect(res.status).toBe(409);
  });

  test("überschneidende Schichten blockieren die Zuweisung genauso wie das Einschreiben", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const qualId = state.company.qualifications[0].id;
    const leaId = state.company.accounts.find((a) => a.name === "Lea Brunner").id;

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    await admin.post("/api/shifts", {
      name: "Tagdienst", date: heute(), startTime: "08:00", endTime: "16:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shifts = (await admin.get("/api/state")).data.company.shifts;
    const frueh = shifts.find((s) => s.name === "Frühdienst");
    const tag = shifts.find((s) => s.name === "Tagdienst");

    expect((await admin.post(`/api/shifts/${frueh.id}/assign-manual`, { accountId: leaId })).status).toBe(200);
    const res = await admin.post(`/api/shifts/${tag.id}/assign-manual`, { accountId: leaId });
    expect(res.status).toBe(409);
  });

  test("Mitarbeitende dürfen niemanden direkt zuweisen", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    const leaId = (await admin.get("/api/state")).data.company.accounts.find((a) => a.name === "Lea Brunner").id;

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/shifts/${shiftId}/assign-manual`, { accountId: leaId })).status).toBe(403);
  });

  test("die bestehende Austragen-Funktion macht eine manuelle Zuweisung rückgängig", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const qualId = state.company.qualifications[0].id;
    const leaId = state.company.accounts.find((a) => a.name === "Lea Brunner").id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    await admin.post(`/api/shifts/${shiftId}/assign-manual`, { accountId: leaId });
    const res = await admin.del(`/api/shifts/${shiftId}/enrollments/${leaId}`);
    expect(res.status).toBe(200);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.assigned).toEqual([]);
  });
});

describe("Zuteilungstag", () => {
  test("der letzte Tag des Monats wird als 31 gespeichert", async () => {
    const admin = await asAdmin();
    expect((await admin.patch("/api/settings", { assignmentDay: 31 })).status).toBe(200);
    expect((await admin.get("/api/state")).data.company.settings.assignmentDay).toBe(31);
  });

  test("ein Tag, den es nicht in jedem Monat gibt, wird abgelehnt", async () => {
    const admin = await asAdmin();
    expect((await admin.patch("/api/settings", { assignmentDay: 29 })).status).toBe(400);
    expect((await admin.patch("/api/settings", { assignmentDay: 0 })).status).toBe(400);
    expect((await admin.patch("/api/settings", { assignmentDay: 32 })).status).toBe(400);
  });
});

describe("Fairness-Einstellungen", () => {
  test("lassen sich unabhängig vom Zuteilungstag speichern und werden zurückgegeben", async () => {
    const admin = await asAdmin();
    const res = await admin.patch("/api/settings", { fairnessWindow: "4weeks", fairnessThresholdShifts: 5 });
    expect(res.status).toBe(200);

    const { settings } = (await admin.get("/api/state")).data.company;
    expect(settings.fairnessWindow).toBe("4weeks");
    expect(settings.fairnessThresholdShifts).toBe(5);
    // Der Zuteilungstag bleibt beim ungenannten Default unangetastet.
    expect(settings.assignmentDay).toBe(7);
  });

  test("eine unbekannte Fensterangabe wird abgelehnt", async () => {
    const admin = await asAdmin();
    const res = await admin.patch("/api/settings", { fairnessWindow: "letztes-jahr" });
    expect(res.status).toBe(400);
  });

  test("eine Schwelle ausserhalb von 0–50 wird abgelehnt", async () => {
    const admin = await asAdmin();
    expect((await admin.patch("/api/settings", { fairnessThresholdShifts: -1 })).status).toBe(400);
    expect((await admin.patch("/api/settings", { fairnessThresholdShifts: 51 })).status).toBe(400);
  });
});

describe("Vergangene Schichten", () => {
  /* Anlegen und Bearbeiten weisen die Vergangenheit ab; Einschreiben,
     Hilfegesuch und Übernehmen taten das nicht. Über die API liess sich eine
     Schicht von 2020 noch belegen — und die Auslosung teilte sie prompt zu. */
  const gestern = () => toISO(addDays(startOfToday(), -1));

  /** Legt eine Schicht für heute an und datiert sie danach zurück. */
  async function vergangeneSchicht(admin, { seats = 1 } = {}) {
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats, qualificationIds: [qualId],
    });
    const id = (await admin.get("/api/state")).data.company.shifts[0].id;
    server.db.prepare("UPDATE shifts SET date = ? WHERE id = ?").run(gestern(), id);
    return id;
  }

  test("in eine vergangene Schicht schreibt sich niemand mehr ein", async () => {
    const admin = await asAdmin();
    const shiftId = await vergangeneSchicht(admin);

    const lea = client();
    await lea.login(EMPLOYEE);
    const res = await lea.post(`/api/shifts/${shiftId}/enroll`);
    expect(res.status).toBe(409);
    expect(res.data.error).toMatch(/vorbei/);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.enrolled).toHaveLength(0);
    expect(shift.assigned).toHaveLength(0);
  });

  test("eine vergangene Schicht übernimmt niemand mehr", async () => {
    const admin = await asAdmin();
    const shiftId = await vergangeneSchicht(admin);

    const lea = client();
    await lea.login(EMPLOYEE);
    const res = await lea.post(`/api/shifts/${shiftId}/takeover`, {});
    expect(res.status).toBe(409);
    expect((await admin.get("/api/state")).data.company.shifts[0].assigned).toHaveLength(0);
  });

  test("für eine vergangene Schicht gibt es kein Hilfegesuch mehr", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    // Erst zuteilen lassen, solange die Schicht noch heute ist ...
    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    expect((await lea.get("/api/state")).data.company.shifts[0].assigned).toHaveLength(1);

    // ... dann liegt sie hinter uns.
    server.db.prepare("UPDATE shifts SET date = ? WHERE id = ?").run(gestern(), shiftId);
    const res = await lea.post(`/api/shifts/${shiftId}/help`);
    expect(res.status).toBe(409);
    expect((await lea.get("/api/state")).data.company.shifts[0].helpRequests).toHaveLength(0);
  });

  test("die Schicht von heute Morgen zählt noch als heute", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/shifts/${shiftId}/enroll`)).status).toBe(200);
    expect((await lea.post(`/api/shifts/${shiftId}/help`)).status).toBe(200);
  });
});

describe("Angaben beim Anlegen", () => {
  const grunddaten = (qualId) => ({
    name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
    repeat: "once", seats: 1, qualificationIds: [qualId],
  });

  const qualVon = async (admin) => (await admin.get("/api/state")).data.company.qualifications[0].id;

  test("ohne Uhrzeiten entsteht keine Schicht", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);

    /* Leere Zeiten wurden als "" gespeichert. Die Überschneidungsrechnung las
       daraus 0:00 bis 0:00 und machte eine Schicht über volle 24 Stunden
       daraus — die kollidierte dann mit allem an diesem Tag. */
    for (const zeiten of [{ startTime: "", endTime: "" }, { startTime: "6:00", endTime: "12:00" }, { endTime: "kaputt" }]) {
      const res = await admin.post("/api/shifts", { ...grunddaten(qualId), ...zeiten });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/HH:MM/);
    }

    expect((await admin.get("/api/state")).data.company.shifts).toHaveLength(0);
  });

  test("rückwirkend lässt sich nichts anlegen", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);

    const res = await admin.post("/api/shifts", {
      ...grunddaten(qualId), date: toISO(addDays(startOfToday(), -1)),
    });
    expect(res.status).toBe(400);
    expect((await admin.get("/api/state")).data.company.shifts).toHaveLength(0);
  });

  test("die Wiederholungen sind genau die aus der Auswahlliste", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);

    for (const repeat of REPEAT_KEYS) {
      expect((await admin.post("/api/shifts", { ...grunddaten(qualId), repeat })).status).toBe(200);
    }
    expect((await admin.post("/api/shifts", { ...grunddaten(qualId), repeat: "monatlich" })).status).toBe(400);
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

  test("ein zweites Konto mit gleichem Namen und Passwort wäre unerreichbar", async () => {
    const admin = await asAdmin();
    const ersteId = (await admin.post("/api/employees", { name: "Anna Meier", email: "anna1@beispiel.ch" })).data.id;
    const zweiteId = (await admin.post("/api/employees", { name: "Anna Meier", email: "anna2@beispiel.ch" })).data.id;
    await loeseEinladungEin(ersteId, "start123");

    /* Die Anmeldung nimmt das erste Konto, dessen Passwort passt. Stimmen beide
       Angaben überein, käme das zweite nie an die Reihe — die Person käme nicht
       hinein und könnte ihr Passwort deshalb auch nicht ändern. */
    const doppelt = await loeseEinladungEin(zweiteId, "start123");
    expect(doppelt.status).toBe(409);
    expect(doppelt.data.error).toMatch(/nicht erreichbar/);

    // Gleicher Name mit anderem Passwort bleibt erlaubt: Menschen heissen manchmal gleich.
    const zweite = await loeseEinladungEin(zweiteId, "andersPw1");
    expect(zweite.status).toBe(200);

    const eine = client();
    await eine.login({ code: "111111", name: "Anna Meier", password: "start123" });
    const andere = client();
    await andere.login({ code: "111111", name: "Anna Meier", password: "andersPw1" });
    expect((await eine.get("/api/state")).data.userId).not.toBe((await andere.get("/api/state")).data.userId);
    expect((await andere.get("/api/state")).data.userId).toBe(zweiteId);
  });

  test("auch ein neues Passwort darf ein Konto nicht verstecken", async () => {
    const admin = await asAdmin();
    const ersteId = (await admin.post("/api/employees", { name: "Anna Meier", email: "anna1@beispiel.ch" })).data.id;
    const zweiteId = (await admin.post("/api/employees", { name: "Anna Meier", email: "anna2@beispiel.ch" })).data.id;
    await loeseEinladungEin(ersteId, "start123");
    await loeseEinladungEin(zweiteId, "andersPw1");

    const res = await admin.post(`/api/accounts/${zweiteId}/password`, {
      password: "start123", currentPassword: "12345",
    });
    expect(res.status).toBe(409);

    // Das alte Passwort gilt weiter.
    expect((await client().login({ code: "111111", name: "Anna Meier", password: "andersPw1" })).status).toBe(200);
  });

  test("Qualifikationen vergibt nur die Administration", async () => {
    const admin = await asAdmin();
    const state = (await admin.get("/api/state")).data;
    const qualId = state.company.qualifications.find(
      (q) => !state.company.accounts.find((a) => a.name === "Lea Brunner").qualifications.includes(q.id)
    ).id;
    const leaId = state.company.accounts.find((a) => a.name === "Lea Brunner").id;

    /* Sonst wäre „Erste Hilfe“ eine Selbstauskunft — während die automatische
       Zuteilung sie als geprüfte Voraussetzung behandelt. */
    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.patch(`/api/accounts/${leaId}/qualifications`, { qualificationId: qualId, value: true })).status).toBe(403);

    const nachher = (await lea.get("/api/state")).data.company.accounts.find((a) => a.id === leaId);
    expect(nachher.qualifications).not.toContain(qualId);

    expect((await admin.patch(`/api/accounts/${leaId}/qualifications`, { qualificationId: qualId, value: true })).status).toBe(200);
  });

  test("Mitarbeitende ändern fremde Konten nicht", async () => {
    const admin = await asAdmin();
    const mara = (await admin.get("/api/state")).data.company.accounts.find((a) => a.role === "admin");

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/accounts/${mara.id}/promote`)).status).toBe(403);
    expect((await lea.post(`/api/accounts/${mara.id}/password`, {
      password: "geklaut", currentPassword: "12345",
    })).status).toBe(403);
  });

  test("Konten einer fremden Firma sind unsichtbar", async () => {
    const fremdeId = createCompany(server.db, {
      code: "222222", name: "Zweite Firma AG",
      adminName: "Andere Chefin", adminPassword: "12345",
    });
    const fremdesKonto = readCompany(server.db, fremdeId).accounts[0].id;

    const admin = await asAdmin();
    expect((await admin.post(`/api/accounts/${fremdesKonto}/qualifications`, {
      qualificationId: "egal", value: true,
    })).status).toBe(404);
  });

  test("Passwort ändern verlangt das alte Passwort", async () => {
    const lea = client();
    await lea.login(EMPLOYEE);
    const meineId = (await lea.get("/api/state")).data.userId;

    expect((await lea.post(`/api/accounts/${meineId}/password`, {
      password: "neuesGeheim1", currentPassword: "falsch",
    })).status).toBe(403);

    expect((await lea.post(`/api/accounts/${meineId}/password`, {
      password: "neuesGeheim1", currentPassword: "12345",
    })).status).toBe(200);

    const nochmal = client();
    expect((await nochmal.login({ ...EMPLOYEE, password: "neuesGeheim1" })).status).toBe(200);
  });

  test("die Administration setzt ein vergessenes Passwort neu", async () => {
    const admin = await asAdmin();
    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;

    // Bestätigt wird mit dem eigenen Admin-Passwort, nicht mit dem fremden.
    expect((await admin.post(`/api/accounts/${leaId}/password`, {
      password: "neuStart1", currentPassword: "falsch",
    })).status).toBe(403);

    expect((await admin.post(`/api/accounts/${leaId}/password`, {
      password: "neuStart1", currentPassword: "12345",
    })).status).toBe(200);

    expect((await client().login({ ...EMPLOYEE, password: "neuStart1" })).status).toBe(200);
  });

  test("die Administration setzt ein neues Konto von Hand ein, statt auf den Link zu warten", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", { name: "Tom Klein", email: "tom@beispiel.ch" });
    const token = server.db.prepare("SELECT token FROM password_resets WHERE account_id = ?").get(data.id).token;

    expect((await admin.post(`/api/accounts/${data.id}/password`, {
      password: "vomAdmin1", currentPassword: "12345",
    })).status).toBe(200);

    expect((await client().login({ code: "111111", name: "Tom Klein", password: "vomAdmin1" })).status).toBe(200);
    // Der Einladungslink ist damit überholt — er lässt sich nicht mehr einlösen.
    expect((await client().post(`/api/password-setup/${token}`, { password: "andersPw1" })).status).toBe(404);
  });

  test("ein fremdes Admin-Konto rührt niemand aus der Firma an", async () => {
    const admin = await asAdmin();
    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;
    await admin.post(`/api/accounts/${leaId}/promote`);
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;

    /* Dieselbe Grenze für alles, was in ein Konto eingreift: Wer einen anderen
       Admin entmachten könnte, könnte die Firma übernehmen. */
    expect((await admin.del(`/api/accounts/${leaId}`)).status).toBe(403);
    expect((await admin.post(`/api/accounts/${leaId}/password`, {
      password: "uebernahme", currentPassword: "12345",
    })).status).toBe(403);
    expect((await admin.patch(`/api/accounts/${leaId}/qualifications`, {
      qualificationId: qualId, value: false,
    })).status).toBe(403);
    expect((await admin.post(`/api/accounts/${leaId}/demote`)).status).toBe(403);

    // Das Konto steht unverändert da.
    const lea = (await admin.get("/api/state")).data.company.accounts.find((a) => a.id === leaId);
    expect(lea.role).toBe("admin");
  });

  test("Adminrechte gibt jede Person nur selbst ab", async () => {
    const admin = await asAdmin();
    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;
    await admin.post(`/api/accounts/${leaId}/promote`);

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/accounts/${leaId}/demote`)).status).toBe(200);

    const nachher = (await lea.get("/api/state")).data.company.accounts.find((a) => a.id === leaId);
    expect(nachher.role).toBe("employee");
    // Und die Admin-Wege sind für sie zu.
    expect((await lea.post("/api/employees", { name: "Neu", email: "neu@beispiel.ch" })).status).toBe(403);
  });

  test("die letzte Administration behält ihre Rechte", async () => {
    const admin = await asAdmin();
    const maraId = (await admin.get("/api/state")).data.userId;

    const res = await admin.post(`/api/accounts/${maraId}/demote`);
    expect(res.status).toBe(409);
    expect(res.data.error).toMatch(/letzte Administration/);
  });

  test("Admins setzen einander das Passwort nicht", async () => {
    const admin = await asAdmin();
    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;
    await admin.post(`/api/accounts/${leaId}/promote`);

    // Sonst könnte ein Admin die anderen aussperren und die Firma übernehmen.
    expect((await admin.post(`/api/accounts/${leaId}/password`, {
      password: "uebernahme", currentPassword: "12345",
    })).status).toBe(403);
  });

  test("Mitarbeitende setzen fremde Passwörter nicht", async () => {
    const admin = await asAdmin();
    const adminId = (await admin.get("/api/state")).data.userId;

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/accounts/${adminId}/password`, {
      password: "geklaut", currentPassword: "12345",
    })).status).toBe(403);
  });
});

describe("Konto einrichten", () => {
  /* Ein Admin vergibt beim Anlegen kein Passwort mehr — die Person setzt ihr
     eigenes über den Link, den sie per Mail bekommt (server/passwordSetup.js).
     Verschickt wird in den Tests nichts (kein SB_SMTP_HOST), das Zeichen liegt
     aber in password_resets und lässt sich von dort direkt einlösen. */
  test("ein neues Konto hat noch kein nutzbares Passwort, bis der Link eingelöst ist", async () => {
    const admin = await asAdmin();
    const { status, data } = await admin.post("/api/employees", { name: "Tom Klein", email: "tom@beispiel.ch" });

    expect(status).toBe(200);
    expect(data.id).toBeTruthy();
    expect((await admin.get("/api/state")).data.company.accounts.map((a) => a.name)).toContain("Tom Klein");

    const token = server.db.prepare("SELECT token FROM password_resets WHERE account_id = ?").get(data.id).token;
    const info = await client().get(`/api/password-setup/${token}`);
    expect(info.status).toBe(200);
    expect(info.data).toEqual({ name: "Tom Klein", companyName: "Erste Firma AG" });

    expect((await client().post(`/api/password-setup/${token}`, { password: "startPw1" })).status).toBe(200);
    expect((await client().login({ code: "111111", name: "Tom Klein", password: "startPw1" })).status).toBe(200);
  });

  test("ohne Namen oder ohne Adresse entsteht kein Konto", async () => {
    const admin = await asAdmin();

    expect((await admin.post("/api/employees", { email: "tom@beispiel.ch" })).status).toBe(400);
    expect((await admin.post("/api/employees", { name: "Tom Klein" })).status).toBe(400);

    expect((await admin.get("/api/state")).data.company.accounts.map((a) => a.name)).not.toContain("Tom Klein");
  });

  test("ein zu schwaches Passwort löst den Link nicht ein", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", { name: "Tom Klein", email: "tom@beispiel.ch" });
    const token = server.db.prepare("SELECT token FROM password_resets WHERE account_id = ?").get(data.id).token;

    const zuKurz = await client().post(`/api/password-setup/${token}`, { password: "abc123" });
    expect(zuKurz.status).toBe(400);
    expect(zuKurz.data.error).toMatch(/8 Zeichen/);

    const nurBuchstaben = await client().post(`/api/password-setup/${token}`, { password: "nurBuchstaben" });
    expect(nurBuchstaben.status).toBe(400);
    expect(nurBuchstaben.data.error).toMatch(/Zahl oder ein Sonderzeichen/);

    const nurZiffern = await client().post(`/api/password-setup/${token}`, { password: "12345678" });
    expect(nurZiffern.status).toBe(400);
    expect(nurZiffern.data.error).toMatch(/Buchstaben/);

    // Der Link bleibt bis zu einem gültigen Passwort weiter einlösbar.
    expect((await client().post(`/api/password-setup/${token}`, { password: "endlichGut1" })).status).toBe(200);
  });

  test("ein unbekannter oder schon eingelöster Link ist ungültig", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", { name: "Tom Klein", email: "tom@beispiel.ch" });
    const token = server.db.prepare("SELECT token FROM password_resets WHERE account_id = ?").get(data.id).token;

    expect((await client().get("/api/password-setup/unbekannt")).status).toBe(404);
    expect((await client().post("/api/password-setup/unbekannt", { password: "startPw1" })).status).toBe(404);

    expect((await client().post(`/api/password-setup/${token}`, { password: "startPw1" })).status).toBe(200);
    // Ein zweites Mal lässt sich derselbe Link nicht mehr einlösen.
    expect((await client().post(`/api/password-setup/${token}`, { password: "andersPw1" })).status).toBe(404);
  });

  test("ein neues Unternehmen braucht ein Admin-Passwort", async () => {
    const su = client();
    await su.login(SUPER);
    const res = await su.post("/api/companies", {
      name: "Zweite Firma AG", code: "222222", adminName: "Neue Chefin", adminPassword: "abc",
    });
    expect(res.status).toBe(400);
    expect((await su.get("/api/state")).data.companies.map((c) => c.code)).not.toContain("222222");
  });

  test("das erste Admin-Konto meldet sich mit dem vergebenen Passwort an", async () => {
    const su = client();
    await su.login(SUPER);
    await su.post("/api/companies", {
      name: "Zweite Firma AG", code: "222222", adminName: "Neue Chefin",
      adminPassword: "chefinPw1", adminEmail: "chefin@beispiel.ch",
    });

    expect((await client().login({ code: "222222", name: "Neue Chefin", password: "chefinPw1" })).status).toBe(200);
  });
});

describe("Selbstregistrierung", () => {
  const registrieren = (c, form = {}) =>
    c.post("/api/register", {
      code: "111111", name: "Neu Hier", password: "startPw1", email: "neu@beispiel.ch", ...form,
    });

  test("ein registriertes Konto kann sich noch nicht anmelden", async () => {
    expect((await registrieren(client())).status).toBe(200);

    const versuch = await client().login({ code: "111111", name: "Neu Hier", password: "startPw1" });
    expect(versuch.status).toBe(403);
    expect(versuch.data.pending).toBe(true);
  });

  test("taucht für die Administration unter den Anmeldungen auf, nicht bei den Mitarbeitenden", async () => {
    await registrieren(client());

    const admin = await asAdmin();
    const { data } = await admin.get("/api/state");
    expect(data.company.pendingAccounts.map((a) => a.name)).toContain("Neu Hier");
    expect(data.company.accounts.map((a) => a.name)).not.toContain("Neu Hier");
  });

  test("Mitarbeitende sehen keine Anmeldungen", async () => {
    await registrieren(client());

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.get("/api/state")).data.company.pendingAccounts).toEqual([]);
  });

  test("nach der Bestätigung kann sich die Person anmelden", async () => {
    await registrieren(client());
    const admin = await asAdmin();
    const pendingId = (await admin.get("/api/state")).data.company.pendingAccounts[0].id;

    expect((await admin.post(`/api/accounts/${pendingId}/approve`)).status).toBe(200);
    expect((await client().login({ code: "111111", name: "Neu Hier", password: "startPw1" })).status).toBe(200);

    const danach = (await admin.get("/api/state")).data.company;
    expect(danach.accounts.map((a) => a.name)).toContain("Neu Hier");
    expect(danach.pendingAccounts).toEqual([]);
  });

  test("nur die Administration bestätigt eine Anmeldung", async () => {
    await registrieren(client());
    const admin = await asAdmin();
    const pendingId = (await admin.get("/api/state")).data.company.pendingAccounts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/accounts/${pendingId}/approve`)).status).toBe(403);
  });

  test("Ablehnen löscht das Konto — die schon bestehende Löschroute reicht dafür", async () => {
    await registrieren(client());
    const admin = await asAdmin();
    const pendingId = (await admin.get("/api/state")).data.company.pendingAccounts[0].id;

    expect((await admin.del(`/api/accounts/${pendingId}`)).status).toBe(200);
    expect((await client().login({ code: "111111", name: "Neu Hier", password: "startPw1" })).status).toBe(401);
  });

  test("ein zu schwaches Passwort registriert kein Konto", async () => {
    const res = await registrieren(client(), { password: "abc" });
    expect(res.status).toBe(400);
  });

  test("ein unbekannter Firmencode registriert kein Konto", async () => {
    const res = await registrieren(client(), { code: "999999" });
    expect(res.status).toBe(400);
  });

  test("ohne E-Mail-Adresse registriert kein Konto", async () => {
    const res = await registrieren(client(), { email: "" });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/E-Mail-Adresse ist nötig/);
  });

  test("ein zweites Konto mit gleichem Namen und Passwort wäre unerreichbar", async () => {
    expect((await registrieren(client())).status).toBe(200);
    expect((await registrieren(client())).status).toBe(409);
  });

  test("kein Admin-Konto entsteht auf diesem Weg", async () => {
    await registrieren(client());
    const admin = await asAdmin();
    const { data } = await admin.get("/api/state");
    expect(data.company.pendingAccounts.find((a) => a.name === "Neu Hier").role).toBe("employee");
  });

  test("eine unbestätigte Person zählt nicht als Nachfolge für ein Admin-Konto", async () => {
    await registrieren(client());
    const su = client();
    await su.login(SUPER);
    const firmaId = server.db.prepare("SELECT id FROM companies WHERE code = '111111'").get().id;

    // Sie taucht schon in der Auswahlliste nicht auf ...
    const leute = (await su.get(`/api/companies/${firmaId}/employees`)).data;
    expect(leute.map((l) => l.name)).not.toContain("Neu Hier");

    // ... und auch ein gezielt mitgeschickter Wert zählt nicht.
    const pendingId = server.db.prepare("SELECT id FROM accounts WHERE name = 'Neu Hier'").get().id;
    const maraId = server.db.prepare("SELECT id FROM accounts WHERE name = 'Mara Vogt'").get().id;
    const res = await su.del(`/api/companies/${firmaId}/admins/${maraId}`, {
      currentPassword: SUPER.password, nachfolgerId: pendingId,
    });
    expect(res.status).toBe(409);
  });
});

describe("E-Mail und Benachrichtigungen", () => {
  /* Ohne SB_SMTP_HOST (der Testserver setzt es nicht, siehe helpers/server.js)
     verschickt server/mail.js nichts, sondern schreibt nur eine Log-Zeile.
     Diese Tests prüfen deshalb nicht den Versand selbst, sondern dass die
     Adresse korrekt gespeichert/gelesen wird, für Mitarbeitende und Admins
     Pflicht ist, und dass die Benachrichtigungs-Hooks die eigentliche Aktion
     nie zu Fall bringen. Für die Verwaltung (server/routes/admin.js) bleibt
     sie dagegen optional — eigene Tests dafür im Block "Verwaltung: eigener
     Zugang". */

  test("ohne Adresse entsteht kein Mitarbeitendenkonto", async () => {
    const admin = await asAdmin();
    const res = await admin.post("/api/employees", { name: "Ohne Mail" });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/E-Mail-Adresse ist nötig/);
  });

  test("beim Anlegen eines Mitarbeitendenkontos ist die Adresse Pflicht, aber selbst abrufbar", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", {
      name: "Tom Klein", email: "tom@beispiel.ch",
    });
    await loeseEinladungEin(data.id, "startPw1");

    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "startPw1" });
    expect((await tom.get(`/api/accounts/${data.id}/email`)).data.email).toBe("tom@beispiel.ch");
  });

  test("ein ungültiges Format weist Konto-Anlage, Registrierung und Firmengründung ab", async () => {
    const admin = await asAdmin();
    expect((await admin.post("/api/employees", {
      name: "Tom Klein", email: "keine-adresse",
    })).status).toBe(400);

    expect((await client().post("/api/register", {
      code: "111111", name: "Neu Hier", password: "startPw1", email: "keine-adresse",
    })).status).toBe(400);

    const su = client();
    await su.login(SUPER);
    expect((await su.post("/api/companies", {
      name: "Zweite Firma AG", code: "222222", adminName: "Neue Chefin",
      adminPassword: "chefinPw1", adminEmail: "keine-adresse",
    })).status).toBe(400);
  });

  test("die eigene Adresse lässt sich abrufen und ändern, eine fremde nicht — leeren geht nicht mehr", async () => {
    const lea = client();
    await lea.login(EMPLOYEE);
    const meineId = (await lea.get("/api/state")).data.userId;

    expect((await lea.get(`/api/accounts/${meineId}/email`)).data.email).toBeNull();
    expect((await lea.patch(`/api/accounts/${meineId}/email`, { email: "lea@beispiel.ch" })).status).toBe(200);
    expect((await lea.get(`/api/accounts/${meineId}/email`)).data.email).toBe("lea@beispiel.ch");

    // Pflicht heisst auch: eine bereits gesetzte Adresse lässt sich nicht mehr auf leer zurücksetzen.
    const geleert = await lea.patch(`/api/accounts/${meineId}/email`, { email: "" });
    expect(geleert.status).toBe(400);
    expect((await lea.get(`/api/accounts/${meineId}/email`)).data.email).toBe("lea@beispiel.ch");

    const admin = await asAdmin();
    const adminId = (await admin.get("/api/state")).data.userId;
    expect((await lea.get(`/api/accounts/${adminId}/email`)).status).toBe(403);
    expect((await lea.patch(`/api/accounts/${adminId}/email`, { email: "uebernahme@beispiel.ch" })).status).toBe(403);
  });

  test("die Adresse steht nirgends im allgemeinen Firmenstand — nur selbst abrufbar", async () => {
    const admin = await asAdmin();
    const adminId = (await admin.get("/api/state")).data.userId;
    await admin.patch(`/api/accounts/${adminId}/email`, { email: "mara@beispiel.ch" });

    const lea = client();
    await lea.login(EMPLOYEE);
    const { data } = await lea.get("/api/state");
    expect(JSON.stringify(data)).not.toContain("mara@beispiel.ch");
  });

  test("eine Zuteilung mit hinterlegter Adresse schlägt nicht fehl, obwohl kein SMTP konfiguriert ist", async () => {
    const admin = await asAdmin();
    const leaId = (await admin.get("/api/state")).data.company.accounts.find((a) => a.name === "Lea Brunner").id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.patch(`/api/accounts/${leaId}/email`, { email: "lea@beispiel.ch" });

    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    // Sofortige Zuteilung beim Einschreiben — derselbe Pfad, der die Mail
    // ausserhalb von recompute() auslöst.
    const res = await lea.post(`/api/shifts/${shiftId}/enroll`);
    expect(res.status).toBe(200);
    expect((await lea.get("/api/state")).data.company.shifts[0].assigned).toContain(leaId);
  });

  test("eine neue Registrierung mit hinterlegter Admin-Adresse schlägt nicht fehl", async () => {
    const admin = await asAdmin();
    const adminId = (await admin.get("/api/state")).data.userId;
    await admin.patch(`/api/accounts/${adminId}/email`, { email: "mara@beispiel.ch" });

    const res = await client().post("/api/register", {
      code: "111111", name: "Neu Hier", password: "startPw1", email: "neu@beispiel.ch",
    });
    expect(res.status).toBe(200);
  });
});

describe("Verwaltung: eigener Zugang", () => {
  /* Firmencode, Passwort und E-Mail der Verwaltung entstehen beim ersten
     Start aus SB_SUPER_CODE/-PASSWORD (siehe ensureSuperAdmin in
     server/db.js) und leben danach in der super_admin-Tabelle — genau wie ein
     Firmen-Admin sein erstes Passwort einmalig bekommt und es danach selbst
     ändert. */

  const alsSuper = async () => { const c = client(); await c.login(SUPER); return c; };

  test("die E-Mail-Adresse der Verwaltung ist optional und steht im eigenen Zustand", async () => {
    const su = await alsSuper();
    expect((await su.get("/api/state")).data.email).toBeNull();

    expect((await su.patch("/api/admin/email", { email: "kira@beispiel.ch" })).status).toBe(200);
    expect((await su.get("/api/state")).data.email).toBe("kira@beispiel.ch");

    // Anders als bei Mitarbeitenden und Admins bleibt sie leerbar.
    expect((await su.patch("/api/admin/email", { email: "" })).status).toBe(200);
    expect((await su.get("/api/state")).data.email).toBeNull();

    expect((await su.patch("/api/admin/email", { email: "keine-adresse" })).status).toBe(400);
  });

  test("der eigene Firmencode lässt sich ändern und gilt sofort für den Login", async () => {
    const su = await alsSuper();
    expect((await su.get("/api/state")).data.code).toBe(SUPER.code);

    expect((await su.patch("/api/admin/code", { code: "555555" })).status).toBe(200);
    expect((await client().login({ ...SUPER, code: "555555" })).status).toBe(200);
    // Der alte Code führt danach nirgends mehr hin.
    expect((await client().login(SUPER)).status).toBe(401);
  });

  test("der neue Code darf keinen bestehenden Firmencode doppeln", async () => {
    const su = await alsSuper();
    const res = await su.patch("/api/admin/code", { code: "111111" });
    expect(res.status).toBe(409);
  });

  test("ein ungültiges Format weist die Codeänderung ab", async () => {
    const su = await alsSuper();
    expect((await su.patch("/api/admin/code", { code: "abc" })).status).toBe(400);
  });

  test("das eigene Passwort ändert sich wie bei Mitarbeitenden und Admins", async () => {
    const su = await alsSuper();

    expect((await su.post("/api/admin/verify-password", { password: "falsch" })).data.ok).toBe(false);
    expect((await su.post("/api/admin/verify-password", { password: SUPER.password })).data.ok).toBe(true);

    const falsch = await su.patch("/api/admin/password", { password: "neuesPw1", currentPassword: "falsch" });
    expect(falsch.status).toBe(403);

    const res = await su.patch("/api/admin/password", { password: "neuesPw1", currentPassword: SUPER.password });
    expect(res.status).toBe(200);

    expect((await client().login({ ...SUPER, password: "neuesPw1" })).status).toBe(200);
    expect((await client().login(SUPER)).status).toBe(401);
  });

  test("ein zu schwaches neues Passwort wird abgewiesen", async () => {
    const su = await alsSuper();
    const res = await su.patch("/api/admin/password", { password: "abc", currentPassword: SUPER.password });
    expect(res.status).toBe(400);
  });

  test("nur die Verwaltung selbst kommt an diese Wege", async () => {
    const admin = await asAdmin();
    expect((await admin.patch("/api/admin/email", { email: "x@beispiel.ch" })).status).toBe(403);
    expect((await admin.patch("/api/admin/code", { code: "444444" })).status).toBe(403);
    expect((await admin.patch("/api/admin/password", { password: "neuesPw1", currentPassword: "x" })).status).toBe(403);
  });
});

describe("Überschneidende Schichten", () => {
  /* Wer eine Schicht übernimmt, kann in derselben Zeit keine zweite übernehmen.
     Ausnahmen trägt die Administration beim Anlegen ausdrücklich ein. */
  const qualVon = async (admin) => (await admin.get("/api/state")).data.company.qualifications[0].id;

  const anlegen = async (admin, qualId, form) =>
    admin.post("/api/shifts", { repeat: "once", seats: 1, qualificationIds: [qualId], ...form });

  const schichtNamens = async (c, name) =>
    (await c.get("/api/state")).data.company.shifts.find((s) => s.name === name);

  test("zwei Schichten zur selben Zeit schliessen einander aus", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    await anlegen(admin, qualId, { name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00" });

    const lea = client();
    await lea.login(EMPLOYEE);
    const frueh = await schichtNamens(lea, "Frühdienst");
    const tag = await schichtNamens(lea, "Tagdienst");

    expect((await lea.post(`/api/shifts/${frueh.id}/enroll`)).status).toBe(200);

    const res = await lea.post(`/api/shifts/${tag.id}/enroll`);
    expect(res.status).toBe(409);
    // Die Meldung muss beide Schichten benennen — sonst rätselt man, welche gemeint ist.
    expect(res.data.error).toContain("Frühdienst");
    expect(res.data.error).toContain("Tagdienst");

    expect((await schichtNamens(lea, "Tagdienst")).enrolled).toEqual([]);
  });

  test("als zusammen übernehmbar eingetragen, geht beides", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    const frueh = await schichtNamens(admin, "Frühdienst");

    await anlegen(admin, qualId, {
      name: "Telefondienst", date: heute(), startTime: "14:00", endTime: "22:00",
      combinableWith: [frueh.seriesId],
    });

    const lea = client();
    await lea.login(EMPLOYEE);
    const telefon = await schichtNamens(lea, "Telefondienst");

    expect((await lea.post(`/api/shifts/${frueh.id}/enroll`)).status).toBe(200);
    expect((await lea.post(`/api/shifts/${telefon.id}/enroll`)).status).toBe(200);
    expect((await schichtNamens(lea, "Telefondienst")).enrolled).toHaveLength(1);
  });

  test("die Freigabe gilt in beide Richtungen", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    const frueh = await schichtNamens(admin, "Frühdienst");
    await anlegen(admin, qualId, {
      name: "Telefondienst", date: heute(), startTime: "14:00", endTime: "22:00",
      combinableWith: [frueh.seriesId],
    });

    const lea = client();
    await lea.login(EMPLOYEE);
    const telefon = await schichtNamens(lea, "Telefondienst");

    // Erst die neuere, dann die ältere — die Reihenfolge darf nichts ausmachen.
    expect((await lea.post(`/api/shifts/${telefon.id}/enroll`)).status).toBe(200);
    expect((await lea.post(`/api/shifts/${frueh.id}/enroll`)).status).toBe(200);
  });

  test("Schichten, die sich nur berühren, gehen beide", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    await anlegen(admin, qualId, { name: "Spätdienst", date: heute(), startTime: "16:00", endTime: "22:00" });

    const lea = client();
    await lea.login(EMPLOYEE);
    const frueh = await schichtNamens(lea, "Frühdienst");
    const spaet = await schichtNamens(lea, "Spätdienst");

    expect((await lea.post(`/api/shifts/${frueh.id}/enroll`)).status).toBe(200);
    expect((await lea.post(`/api/shifts/${spaet.id}/enroll`)).status).toBe(200);
  });

  test("eine Nachtschicht blockiert den Folgetag", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    const morgen = toISO(addDays(startOfToday(), 1));
    await anlegen(admin, qualId, { name: "Nachtdienst", date: heute(), startTime: "22:00", endTime: "06:00" });
    await anlegen(admin, qualId, { name: "Morgendienst", date: morgen, startTime: "05:00", endTime: "13:00" });

    const lea = client();
    await lea.login(EMPLOYEE);
    const nacht = await schichtNamens(lea, "Nachtdienst");
    const morgens = await schichtNamens(lea, "Morgendienst");

    expect((await lea.post(`/api/shifts/${nacht.id}/enroll`)).status).toBe(200);
    expect((await lea.post(`/api/shifts/${morgens.id}/enroll`)).status).toBe(409);
  });

  test("auch das Übernehmen führt nicht daran vorbei", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    await anlegen(admin, qualId, { name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00" });

    const lea = client();
    await lea.login(EMPLOYEE);
    const frueh = await schichtNamens(lea, "Frühdienst");
    const tag = await schichtNamens(lea, "Tagdienst");
    await lea.post(`/api/shifts/${frueh.id}/enroll`);

    const res = await lea.post(`/api/shifts/${tag.id}/takeover`, { replaceId: null });
    expect(res.status).toBe(409);
    expect(res.data.error).toContain("Frühdienst");
  });

  test("eine Freigabe für eine fremde Serie zählt nicht", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });

    // Erfundene Serie: darf die Überschneidung mit dem Frühdienst nicht freigeben.
    await anlegen(admin, qualId, {
      name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00",
      combinableWith: ["serie_gibtsnicht"],
    });

    const lea = client();
    await lea.login(EMPLOYEE);
    const frueh = await schichtNamens(lea, "Frühdienst");
    const tag = await schichtNamens(lea, "Tagdienst");

    await lea.post(`/api/shifts/${frueh.id}/enroll`);
    expect((await lea.post(`/api/shifts/${tag.id}/enroll`)).status).toBe(409);
  });

  test("das Austragen bleibt möglich", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    /* Zwei Monate voraus: Der Zuteilungstermin ist noch nicht erreicht, die
       Person bleibt auf der Warteliste und kann sich selbst wieder austragen. */
    const spaeter = toISO(addMonths(startOfToday(), 2));
    await anlegen(admin, qualId, { name: "Frühdienst", date: spaeter, startTime: "08:00", endTime: "16:00" });

    const lea = client();
    await lea.login(EMPLOYEE);
    const frueh = await schichtNamens(lea, "Frühdienst");

    await lea.post(`/api/shifts/${frueh.id}/enroll`);
    // Derselbe Aufruf trägt wieder aus — die Prüfung darf sich nicht selbst im Weg stehen.
    expect((await lea.post(`/api/shifts/${frueh.id}/enroll`)).status).toBe(200);
    expect((await schichtNamens(lea, "Frühdienst")).enrolled).toEqual([]);
  });
  test("die Auslosung teilt keine zwei ausschliessenden Schichten zu", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    /* Zwei Monate voraus: Die Auslosung läuft noch nicht von selbst, sie lässt
       sich also gezielt auslösen. */
    const spaeter = toISO(addMonths(startOfToday(), 2));

    await anlegen(admin, qualId, { name: "Frühdienst", date: spaeter, startTime: "08:00", endTime: "16:00" });
    const frueh = await schichtNamens(admin, "Frühdienst");
    await anlegen(admin, qualId, {
      name: "Tagdienst", date: spaeter, startTime: "14:00", endTime: "22:00",
      combinableWith: [frueh.seriesId],
    });
    const tag = await schichtNamens(admin, "Tagdienst");

    // Solange die Freigabe gilt, geht beides.
    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.post(`/api/shifts/${frueh.id}/enroll`)).status).toBe(200);
    expect((await lea.post(`/api/shifts/${tag.id}/enroll`)).status).toBe(200);

    // Freigabe zurücknehmen — die beiden Einschreibungen bleiben stehen.
    await admin.patch(`/api/shifts/${tag.id}`, {
      name: tag.name, date: tag.date, startTime: tag.startTime, endTime: tag.endTime,
      seats: tag.seats, qualificationIds: [qualId], umfang: "einzeln",
      combinable: { [frueh.seriesId]: false },
    });
    expect((await schichtNamens(admin, "Tagdienst")).enrolled).toHaveLength(1);

    // Jetzt zuteilen: Die Auslosung muss verhindern, dass beides an Lea geht.
    await admin.post(`/api/shifts/${frueh.id}/assign`);
    await admin.post(`/api/shifts/${tag.id}/assign`);

    const danach = (await admin.get("/api/state")).data.company.shifts;
    const leaId = server.db.prepare("SELECT id FROM accounts WHERE name = 'Lea Brunner'").get().id;
    const zugeteilt = danach.filter((s) => s.assigned.includes(leaId));

    expect(zugeteilt).toHaveLength(1);
    expect(zugeteilt[0].name).toBe("Frühdienst");
  });

  test("die Freigabe lässt die Auslosung beides zuteilen", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    const spaeter = toISO(addMonths(startOfToday(), 2));

    await anlegen(admin, qualId, { name: "Frühdienst", date: spaeter, startTime: "08:00", endTime: "16:00" });
    const frueh = await schichtNamens(admin, "Frühdienst");
    await anlegen(admin, qualId, {
      name: "Telefondienst", date: spaeter, startTime: "14:00", endTime: "22:00",
      combinableWith: [frueh.seriesId],
    });
    const telefon = await schichtNamens(admin, "Telefondienst");

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${frueh.id}/enroll`);
    await lea.post(`/api/shifts/${telefon.id}/enroll`);

    await admin.post(`/api/shifts/${frueh.id}/assign`);
    await admin.post(`/api/shifts/${telefon.id}/assign`);

    const leaId = server.db.prepare("SELECT id FROM accounts WHERE name = 'Lea Brunner'").get().id;
    const danach = (await admin.get("/api/state")).data.company.shifts;
    expect(danach.filter((s) => s.assigned.includes(leaId))).toHaveLength(2);
  });
});

describe("Schichten bearbeiten", () => {
  /** Legt eine Schicht an und gibt Qualifikation und Schichtliste zurück. */
  const anlegen = async (admin, form) => {
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", { startTime: "08:00", endTime: "16:00", seats: 1, qualificationIds: [qualId], ...form });
    const shifts = (await admin.get("/api/state")).data.company.shifts;
    return { qualId, shifts };
  };

  const alleSchichten = async (c) => (await c.get("/api/state")).data.company.shifts;

  test("ändert Name, Zeiten und Plätze einer einzelnen Schicht", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Frühdienst", date: heute(), repeat: "once" });

    const res = await admin.patch(`/api/shifts/${shifts[0].id}`, {
      name: "Spätdienst", date: heute(), startTime: "14:00", endTime: "22:00",
      seats: 3, qualificationIds: [qualId], umfang: "einzeln",
    });

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ updated: 1 });
    expect((await alleSchichten(admin))[0]).toMatchObject({
      name: "Spätdienst", startTime: "14:00", endTime: "22:00", seats: 3,
    });
  });

  test("trägt alle Ein- und Zugeteilten aus", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Frühdienst", date: heute(), repeat: "once" });

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shifts[0].id}/enroll`);
    // Schicht im laufenden Monat: die Zuteilung greift sofort.
    expect((await alleSchichten(lea))[0].assigned).toHaveLength(1);

    const res = await admin.patch(`/api/shifts/${shifts[0].id}`, {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      seats: 1, qualificationIds: [qualId], umfang: "einzeln",
    });

    expect(res.data.ausgetragen).toBe(1);
    const danach = (await alleSchichten(admin))[0];
    expect(danach.enrolled).toEqual([]);
    expect(danach.assigned).toEqual([]);
  });

  test("nur diese Schicht löst den Termin aus der Serie", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Tagdienst", date: heute(), repeat: "daily" });
    expect(shifts.length).toBeGreaterThan(2);

    await admin.patch(`/api/shifts/${shifts[0].id}`, {
      name: "Einmalig anders", date: heute(), startTime: "09:00", endTime: "17:00",
      seats: 2, qualificationIds: [qualId], umfang: "einzeln",
    });

    const danach = await alleSchichten(admin);
    expect(danach[0]).toMatchObject({ name: "Einmalig anders", seats: 2, repeat: "once" });
    // Die übrigen laufen unverändert weiter.
    expect(danach[1]).toMatchObject({ name: "Tagdienst", seats: 1 });
    // Und der Termin gehört nicht mehr zur Serie, damit die Ausnahme nicht weiterwandert.
    expect(danach[0].seriesId).not.toBe(danach[1].seriesId);
  });

  test("ab einem Datum ändert es diese und alle späteren der Serie", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Tagdienst", date: heute(), repeat: "daily" });
    const abDatum = shifts[2].date;

    const res = await admin.patch(`/api/shifts/${shifts[2].id}`, {
      name: "Ab jetzt anders", startTime: "10:00", endTime: "18:00",
      seats: 4, qualificationIds: [qualId], umfang: "ab-datum", abDatum,
    });

    expect(res.status).toBe(200);
    expect(res.data.updated).toBe(shifts.length - 2);

    const danach = await alleSchichten(admin);
    // Davor unverändert ...
    expect(danach[0]).toMatchObject({ name: "Tagdienst", seats: 1 });
    expect(danach[1]).toMatchObject({ name: "Tagdienst", seats: 1 });
    // ... ab dem Datum geändert, und die Serie bleibt eine Serie.
    for (const s of danach.slice(2)) {
      expect(s).toMatchObject({ name: "Ab jetzt anders", startTime: "10:00", seats: 4, repeat: "daily" });
      expect(s.seriesId).toBe(danach[1].seriesId);
    }
  });

  test("die Nachfüllung übernimmt den geänderten Stand", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Tagdienst", date: heute(), repeat: "daily" });

    await admin.patch(`/api/shifts/${shifts[1].id}`, {
      name: "Ab jetzt anders", startTime: "10:00", endTime: "18:00",
      seats: 4, qualificationIds: [qualId], umfang: "ab-datum", abDatum: shifts[1].date,
    });

    // Was die Serie später nachlegt, darf nicht auf den alten Stand zurückfallen.
    extendSeries(server.db);
    for (const s of (await alleSchichten(admin)).slice(1)) {
      expect(s).toMatchObject({ name: "Ab jetzt anders", seats: 4 });
    }
  });

  test("Vergangenes bleibt unangetastet", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Tagdienst", date: heute(), repeat: "daily" });
    const gestern = toISO(addDays(startOfToday(), -1));

    // Sonst liesse sich löschen, wer eine Schicht tatsächlich geleistet hat.
    const res = await admin.patch(`/api/shifts/${shifts[0].id}`, {
      name: "Rückwirkend", startTime: "08:00", endTime: "16:00",
      seats: 1, qualificationIds: [qualId], umfang: "ab-datum", abDatum: gestern,
    });
    expect(res.status).toBe(400);

    const einzeln = await admin.patch(`/api/shifts/${shifts[0].id}`, {
      name: "Rückwirkend", date: gestern, startTime: "08:00", endTime: "16:00",
      seats: 1, qualificationIds: [qualId], umfang: "einzeln",
    });
    expect(einzeln.status).toBe(400);
    expect((await alleSchichten(admin))[0].name).toBe("Tagdienst");
  });

  test("weist unbrauchbare Angaben ab", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Frühdienst", date: heute(), repeat: "once" });
    const gut = { name: "Neu", date: heute(), startTime: "08:00", endTime: "16:00", seats: 1, qualificationIds: [qualId] };

    expect((await admin.patch(`/api/shifts/${shifts[0].id}`, { ...gut, name: "  " })).status).toBe(400);
    expect((await admin.patch(`/api/shifts/${shifts[0].id}`, { ...gut, seats: 0 })).status).toBe(400);
    expect((await admin.patch(`/api/shifts/${shifts[0].id}`, { ...gut, startTime: "8 Uhr" })).status).toBe(400);
    expect((await admin.patch(`/api/shifts/${shifts[0].id}`, { ...gut, qualificationIds: ["gibtsnicht"] })).status).toBe(400);
    expect((await alleSchichten(admin))[0].name).toBe("Frühdienst");
  });

  test("Mitarbeitende bearbeiten keine Schichten", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Frühdienst", date: heute(), repeat: "once" });

    const lea = client();
    await lea.login(EMPLOYEE);
    const res = await lea.patch(`/api/shifts/${shifts[0].id}`, {
      name: "Selbst gemacht", date: heute(), startTime: "08:00", endTime: "16:00",
      seats: 9, qualificationIds: [qualId], umfang: "einzeln",
    });

    expect(res.status).toBe(403);
    expect((await alleSchichten(admin))[0].name).toBe("Frühdienst");
  });

  test("fremde Schichten sind unsichtbar", async () => {
    const fremdeId = createCompany(server.db, {
      code: "222222", name: "Zweite Firma AG", adminName: "Andere Chefin", adminPassword: "12345",
    });
    server.db.prepare(
      `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time,
                           repeat, seats, assignment_attempted)
       VALUES ('s_fremd', ?, 'serie_fremd', 'Fremddienst', ?, '08:00', '16:00', 'once', 1, 0)`
    ).run(fremdeId, heute());

    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const res = await admin.patch("/api/shifts/s_fremd", {
      name: "Übernommen", date: heute(), startTime: "08:00", endTime: "16:00",
      seats: 1, qualificationIds: [qualId], umfang: "einzeln",
    });

    expect(res.status).toBe(404);
    expect(server.db.prepare("SELECT name FROM shifts WHERE id = 's_fremd'").get().name).toBe("Fremddienst");
  });
});

describe("Freigaben nachträglich ändern", () => {
  /* Beim Bearbeiten lässt sich eine Überschneidung freigeben, die es beim
     Anlegen noch gar nicht gab — und eine erteilte Freigabe zurücknehmen. */
  const qualVon = async (admin) => (await admin.get("/api/state")).data.company.qualifications[0].id;

  const anlegen = async (admin, qualId, form) =>
    admin.post("/api/shifts", { repeat: "once", seats: 1, qualificationIds: [qualId], ...form });

  const schichtNamens = async (c, name) =>
    (await c.get("/api/state")).data.company.shifts.find((s) => s.name === name);

  /** Zwei Schichten, die sich überschneiden und einander ausschliessen. */
  const zweiUeberschneidende = async (admin) => {
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    await anlegen(admin, qualId, { name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00" });
    return {
      qualId,
      frueh: await schichtNamens(admin, "Frühdienst"),
      tag: await schichtNamens(admin, "Tagdienst"),
    };
  };

  test("eine bestehende Überschneidung lässt sich nachträglich freigeben", async () => {
    const admin = await asAdmin();
    const { qualId, frueh, tag } = await zweiUeberschneidende(admin);

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${frueh.id}/enroll`);
    expect((await lea.post(`/api/shifts/${tag.id}/enroll`)).status).toBe(409);

    // Nichts an der Schicht ändern, nur die Freigabe nachtragen.
    const res = await admin.patch(`/api/shifts/${tag.id}`, {
      name: tag.name, date: tag.date, startTime: tag.startTime, endTime: tag.endTime,
      seats: tag.seats, qualificationIds: [qualId], umfang: "einzeln",
      combinable: { [frueh.seriesId]: true },
    });
    expect(res.status).toBe(200);

    expect((await lea.post(`/api/shifts/${tag.id}/enroll`)).status).toBe(200);
  });

  test("eine reine Freigabe trägt niemanden aus", async () => {
    const admin = await asAdmin();
    const { qualId, frueh, tag } = await zweiUeberschneidende(admin);

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${tag.id}/enroll`);
    expect((await schichtNamens(lea, "Tagdienst")).enrolled).toHaveLength(1);

    const res = await admin.patch(`/api/shifts/${tag.id}`, {
      name: tag.name, date: tag.date, startTime: tag.startTime, endTime: tag.endTime,
      seats: tag.seats, qualificationIds: [qualId], umfang: "einzeln",
      combinable: { [frueh.seriesId]: true },
    });

    expect(res.data).toMatchObject({ ausgetragen: 0, geaendert: false });
    // Wer nur eine Freigabe nachträgt, soll dafür niemanden aus der Schicht werfen.
    expect((await schichtNamens(admin, "Tagdienst")).enrolled).toHaveLength(1);
  });

  test("eine erteilte Freigabe lässt sich zurücknehmen", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    const frueh = await schichtNamens(admin, "Frühdienst");
    await anlegen(admin, qualId, {
      name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00",
      combinableWith: [frueh.seriesId],
    });
    const tag = await schichtNamens(admin, "Tagdienst");

    await admin.patch(`/api/shifts/${tag.id}`, {
      name: tag.name, date: tag.date, startTime: tag.startTime, endTime: tag.endTime,
      seats: tag.seats, qualificationIds: [qualId], umfang: "einzeln",
      combinable: { [frueh.seriesId]: false },
    });

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${frueh.id}/enroll`);
    expect((await lea.post(`/api/shifts/${tag.id}/enroll`)).status).toBe(409);
  });

  test("eine Änderung ohne Angabe lässt bestehende Freigaben stehen", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    const frueh = await schichtNamens(admin, "Frühdienst");
    await anlegen(admin, qualId, {
      name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00",
      combinableWith: [frueh.seriesId],
    });
    const tag = await schichtNamens(admin, "Tagdienst");

    // Nur die Platzzahl ändern, kein Wort zu den Freigaben.
    await admin.patch(`/api/shifts/${tag.id}`, {
      name: tag.name, date: tag.date, startTime: tag.startTime, endTime: tag.endTime,
      seats: 5, qualificationIds: [qualId], umfang: "einzeln",
    });

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${frueh.id}/enroll`);
    expect((await lea.post(`/api/shifts/${tag.id}/enroll`)).status).toBe(200);
  });

  test("eine neu entstandene Überschneidung lässt sich gleich mit freigeben", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "12:00" });
    await anlegen(admin, qualId, { name: "Abenddienst", date: heute(), startTime: "18:00", endTime: "22:00" });
    const frueh = await schichtNamens(admin, "Frühdienst");
    const abend = await schichtNamens(admin, "Abenddienst");

    // Der Abenddienst rückt vor und überschneidet sich ab jetzt mit dem Frühdienst.
    await admin.patch(`/api/shifts/${abend.id}`, {
      name: abend.name, date: abend.date, startTime: "10:00", endTime: "18:00",
      seats: abend.seats, qualificationIds: [qualId], umfang: "einzeln",
      combinable: { [frueh.seriesId]: true },
    });

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${frueh.id}/enroll`);
    expect((await lea.post(`/api/shifts/${abend.id}/enroll`)).status).toBe(200);
  });

  test("beim Herauslösen aus der Serie gilt die Freigabe für den neuen Termin", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    const frueh = await schichtNamens(admin, "Frühdienst");
    await anlegen(admin, qualId, {
      name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00", repeat: "daily",
    });
    const tag = await schichtNamens(admin, "Tagdienst");

    /* Der Termin verlässt die Serie und wird zu einer eigenen — die Freigabe
       muss auf die neue Serie geschrieben werden, sonst ginge sie verloren. */
    await admin.patch(`/api/shifts/${tag.id}`, {
      name: "Tagdienst einmalig", date: tag.date, startTime: "14:00", endTime: "22:00",
      seats: tag.seats, qualificationIds: [qualId], umfang: "einzeln",
      combinable: { [frueh.seriesId]: true },
    });

    const heraus = await schichtNamens(admin, "Tagdienst einmalig");
    expect(heraus.seriesId).not.toBe(tag.seriesId);

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${frueh.id}/enroll`);
    expect((await lea.post(`/api/shifts/${heraus.id}/enroll`)).status).toBe(200);
  });

  test("der Zustand der Freigaben steht im Firmenstand", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await anlegen(admin, qualId, { name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00" });
    const frueh = await schichtNamens(admin, "Frühdienst");
    await anlegen(admin, qualId, {
      name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00",
      combinableWith: [frueh.seriesId],
    });
    const tag = await schichtNamens(admin, "Tagdienst");

    // Das Formular muss zeigen können, was bereits freigegeben ist.
    const { combinableSeries } = (await admin.get("/api/state")).data.company;
    expect(combinableSeries).toHaveLength(1);
    expect(combinableSeries[0].slice().sort()).toEqual([frueh.seriesId, tag.seriesId].sort());
  });
});

describe("Freigaben aufräumen", () => {
  /* Serien-IDs sind keine Fremdschlüssel — verschwindet die letzte Schicht
     einer Serie, muss ihre Freigabe von Hand mit weg. */
  const freigaben = () => server.db.prepare("SELECT COUNT(*) AS n FROM combinable_series").get().n;

  const qualVon = async (admin) => (await admin.get("/api/state")).data.company.qualifications[0].id;

  const schichtNamens = async (c, name) =>
    (await c.get("/api/state")).data.company.shifts.find((s) => s.name === name);

  /** Frühdienst und ein überschneidender Zweiter, für den eine Freigabe gilt. */
  const mitFreigabe = async (admin, zweiter = {}) => {
    const qualId = await qualVon(admin);
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "08:00", endTime: "16:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const frueh = await schichtNamens(admin, "Frühdienst");
    await admin.post("/api/shifts", {
      name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
      combinableWith: [frueh.seriesId], ...zweiter,
    });
    expect(freigaben()).toBe(1);
    return { qualId, frueh, tag: await schichtNamens(admin, "Tagdienst") };
  };

  test("mit der letzten Schicht einer Serie geht ihre Freigabe", async () => {
    const admin = await asAdmin();
    const { tag } = await mitFreigabe(admin);

    await admin.del(`/api/shifts/${tag.id}`);

    expect(freigaben()).toBe(0);
  });

  test("solange die Serie noch Termine hat, bleibt die Freigabe", async () => {
    const admin = await asAdmin();
    const { tag } = await mitFreigabe(admin, { repeat: "daily" });

    // Nur einen Termin von vielen löschen — die Serie besteht weiter.
    await admin.del(`/api/shifts/${tag.id}`);

    expect(freigaben()).toBe(1);
  });

  test("das Löschen einer ganzen Serie nimmt ihre Freigabe mit", async () => {
    const admin = await asAdmin();
    const { tag } = await mitFreigabe(admin, { repeat: "daily" });

    // Diese und alle späteren; vergangene gibt es hier keine.
    await admin.del(`/api/shifts/${tag.id}/series`);

    expect(freigaben()).toBe(0);
  });

  test("das Wegräumen alter Schichten räumt die Freigaben mit", async () => {
    const admin = await asAdmin();
    const { frueh, tag } = await mitFreigabe(admin);

    // Beide Schichten weit genug in die Vergangenheit schieben.
    const uralt = toISO(addMonths(startOfToday(), -61));
    for (const id of [frueh.id, tag.id]) {
      server.db.prepare("UPDATE shifts SET date = ? WHERE id = ?").run(uralt, id);
    }

    expect(purgeOldShifts(server.db)).toBe(2);
    expect(freigaben()).toBe(0);
  });

  test("ohne gelöschte Schichten wird nichts angefasst", async () => {
    const admin = await asAdmin();
    await mitFreigabe(admin);

    // Läuft täglich mit — darf eine gültige Freigabe nicht wegwerfen.
    expect(purgeOldShifts(server.db)).toBe(0);
    expect(freigaben()).toBe(1);
  });

  test("Freigaben einer endgültig gelöschten Firma verschwinden mit ihr", async () => {
    const admin = await asAdmin();
    await mitFreigabe(admin);

    const su = client();
    await su.login(SUPER);
    const firmaId = server.db.prepare("SELECT id FROM companies WHERE code = '111111'").get().id;
    // Endgültiges Löschen geht nur aus dem Archiv heraus.
    await su.post(`/api/companies/${firmaId}/archive`);
    await su.del(`/api/companies/${firmaId}`);

    // Das erledigt der Fremdschlüssel auf company_id von selbst.
    expect(freigaben()).toBe(0);
  });
});

describe("Archivieren und Pausieren", () => {
  const firmaId = () => server.db.prepare("SELECT id FROM companies WHERE code = '111111'").get().id;
  const alsSuper = async () => { const c = client(); await c.login(SUPER); return c; };

  test("Archivieren sperrt neue Logins, ohne Daten zu löschen", async () => {
    const admin = await asAdmin();
    const superadmin = await alsSuper();

    expect((await superadmin.post(`/api/companies/${firmaId()}/archive`)).status).toBe(200);

    // Bestehende Sitzung endet beim nächsten Aufruf von selbst.
    expect((await admin.get("/api/state")).status).toBe(401);
    // Ein neuer Loginversuch verhält sich wie ein unbekannter Firmencode.
    const loginVersuch = await client().login(ADMIN);
    expect(loginVersuch.status).toBe(401);
    expect(loginVersuch.data.error).toBe("Firmencode, Name oder Passwort ist falsch.");

    // Logbuch bleibt für die Verwaltung einsehbar.
    expect((await superadmin.get(`/api/companies/${firmaId()}/logbook`)).status).toBe(200);
  });

  test("archivierte Firma taucht nur noch unter archivedCompanies auf", async () => {
    const superadmin = await alsSuper();
    await superadmin.post(`/api/companies/${firmaId()}/archive`);

    const { data } = await superadmin.get("/api/state");
    expect(data.companies.some((c) => c.id === firmaId())).toBe(false);
    expect(data.archivedCompanies.some((c) => c.id === firmaId())).toBe(true);
  });

  test("Wiederherstellen macht den Zugang wieder nutzbar", async () => {
    const superadmin = await alsSuper();
    await superadmin.post(`/api/companies/${firmaId()}/archive`);
    await superadmin.post(`/api/companies/${firmaId()}/restore`);

    expect((await client().login(ADMIN)).status).toBe(200);
    const { data } = await superadmin.get("/api/state");
    expect(data.companies.some((c) => c.id === firmaId())).toBe(true);
    expect(data.archivedCompanies.some((c) => c.id === firmaId())).toBe(false);
  });

  test("endgültiges Löschen verlangt vorheriges Archivieren", async () => {
    const superadmin = await alsSuper();
    const res = await superadmin.del(`/api/companies/${firmaId()}`);
    expect(res.status).toBe(409);
  });

  test("Pausieren sperrt Logins reversibel, ohne zu archivieren", async () => {
    const admin = await asAdmin();
    const superadmin = await alsSuper();

    expect((await superadmin.post(`/api/companies/${firmaId()}/pause`)).status).toBe(200);

    expect((await admin.get("/api/state")).status).toBe(401);
    const loginVersuch = await client().login(ADMIN);
    expect(loginVersuch.status).toBe(403);
    expect(loginVersuch.data.error).toBe("Dieses Unternehmen ist vorübergehend gesperrt.");

    // Bleibt in der normalen Liste sichtbar, nicht im Archiv.
    const { data } = await superadmin.get("/api/state");
    const firma = data.companies.find((c) => c.id === firmaId());
    expect(firma).toBeTruthy();
    expect(firma.pausedAt).toBeTruthy();

    await superadmin.post(`/api/companies/${firmaId()}/unpause`);
    expect((await client().login(ADMIN)).status).toBe(200);
  });
});

describe("Auskunft", () => {
  /* DSG Art. 25 / DSGVO Art. 15: Jede Person kommt an alles, was zu ihr
     gespeichert ist — ohne den Umweg über einen Menschen mit Datenbankzugang. */
  const leaId = () => server.db.prepare("SELECT id FROM accounts WHERE name = 'Lea Brunner'").get().id;

  test("enthält Konto, Qualifikationen und Einschreibungen", async () => {
    const admin = await asAdmin();
    const { data: state } = await admin.get("/api/state");
    const qualId = state.data?.company?.qualifications?.[0]?.id ?? state.company.qualifications[0].id;

    // Eine Schicht, an der Lea eingeschrieben und zugeteilt ist.
    await admin.post("/api/shifts", {
      name: "Spätschicht", date: toISO(addDays(startOfToday(), 3)),
      startTime: "16:00", endTime: "22:00", repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const lea = client();
    await lea.login(EMPLOYEE);
    const schichtId = (await lea.get("/api/state")).data.company.shifts[0].id;
    await lea.post(`/api/shifts/${schichtId}/enroll`);

    const { status, data } = await lea.get(`/api/accounts/${leaId()}/data`);

    expect(status).toBe(200);
    expect(data.konto).toMatchObject({ name: "Lea Brunner", rolle: "Mitarbeitende", firmencode: "111111" });
    expect(data.qualifikationen).toContain("Erste Hilfe");
    expect(data.einschreibungen[0]).toMatchObject({ schicht: "Spätschicht", von: "16:00" });
    expect(data.hinweise.length).toBeGreaterThan(0);
  });

  test("das Passwort steht nicht darin", async () => {
    const lea = client();
    await lea.login(EMPLOYEE);
    const { data } = await lea.get(`/api/accounts/${leaId()}/data`);

    // Weder Klartext noch Hash — beides hätte in einer Auskunft nichts zu suchen.
    expect(JSON.stringify(data)).not.toContain("12345");
    expect(JSON.stringify(data)).not.toContain("$2");
  });

  test("kommt als Datei mit brauchbarem Namen", async () => {
    const lea = client();
    await lea.login(EMPLOYEE);
    const res = await lea.raw("GET", `/api/accounts/${leaId()}/data`);

    expect(res.headers.get("content-disposition")).toBe('attachment; filename="auskunft_lea-brunner_' + heute() + '.json"');
  });

  test("die Administration holt die Auskunft für ihre Belegschaft", async () => {
    const admin = await asAdmin();
    expect((await admin.get(`/api/accounts/${leaId()}/data`)).status).toBe(200);
  });

  test("Mitarbeitende kommen nur an ihre eigene", async () => {
    const admin = await asAdmin();
    const maraId = (await admin.get("/api/state")).data.userId;

    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.get(`/api/accounts/${maraId}/data`)).status).toBe(403);
  });

  test("fremde Firmen bleiben aussen vor", async () => {
    const fremdeId = createCompany(server.db, {
      code: "222222", name: "Zweite Firma AG", adminName: "Andere Chefin", adminPassword: "12345",
    });
    const fremdesKonto = readCompany(server.db, fremdeId).accounts[0].id;

    const admin = await asAdmin();
    expect((await admin.get(`/api/accounts/${fremdesKonto}/data`)).status).toBe(404);
  });

  test("ohne Anmeldung gibt es nichts", async () => {
    expect((await client().get(`/api/accounts/${leaId()}/data`)).status).toBe(401);
  });
});

describe("Ausgesperrte Admins", () => {
  /* Unter Admins setzt niemand das Passwort eines anderen — sonst könnte einer
     die Firma übernehmen. Bleibt für ein ausgesperrtes Admin-Konto nur die
     Verwaltung. */
  const alsSuper = async () => {
    const c = client();
    await c.login(SUPER);
    return c;
  };

  const maraId = () =>
    server.db.prepare("SELECT id FROM accounts WHERE name = 'Mara Vogt'").get().id;

  const firmaId = () => server.db.prepare("SELECT id FROM companies WHERE code = '111111'").get().id;

  test("die Verwaltung sieht die Admin-Konten einer Firma", async () => {
    const su = await alsSuper();
    const { status, data } = await su.get(`/api/companies/${firmaId()}/admins`);

    expect(status).toBe(200);
    expect(data.map((a) => a.name)).toEqual(["Mara Vogt"]);
  });

  test("die Verwaltung befreit ein ausgesperrtes Admin-Konto", async () => {
    const su = await alsSuper();
    const res = await su.post(`/api/companies/${firmaId()}/admins/${maraId()}/password`, {
      password: "wiederDrin1", currentPassword: SUPER.password,
    });

    expect(res.status).toBe(200);
    expect((await client().login({ ...ADMIN, password: "wiederDrin1" })).status).toBe(200);
  });

  test("ohne das Verwaltungs-Passwort geht es nicht", async () => {
    const su = await alsSuper();
    const res = await su.post(`/api/companies/${firmaId()}/admins/${maraId()}/password`, {
      password: "uebernahme", currentPassword: "falsch",
    });

    expect(res.status).toBe(403);
    expect((await client().login({ ...ADMIN, password: "uebernahme" })).status).toBe(401);
  });

  test("nur Mitarbeitende bleiben aussen vor", async () => {
    const su = await alsSuper();
    const leaId = server.db.prepare("SELECT id FROM accounts WHERE name = 'Lea Brunner'").get().id;

    // Mitarbeitende setzt die eigene Administration zurück, nicht die Verwaltung.
    const res = await su.post(`/api/companies/${firmaId()}/admins/${leaId}/password`, {
      password: "nichtHier", currentPassword: SUPER.password,
    });
    expect(res.status).toBe(404);
  });

  test("Firmen-Admins kommen an diesen Weg nicht heran", async () => {
    const admin = await asAdmin();

    expect((await admin.get(`/api/companies/${firmaId()}/admins`)).status).toBe(403);
    expect((await admin.post(`/api/companies/${firmaId()}/admins/${maraId()}/password`, {
      password: "uebernahme", currentPassword: SUPER.password,
    })).status).toBe(403);
  });
});

describe("Admin-Konten löschen", () => {
  const alsSuper = async () => {
    const c = client();
    await c.login(SUPER);
    return c;
  };

  const firmaId = async (su) => (await su.get("/api/state")).data.companies[0].id;

  test("die Verwaltung entfernt ein Admin-Konto, die Firma selbst nicht", async () => {
    const admin = await asAdmin();
    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;
    await admin.post(`/api/accounts/${leaId}/promote`);

    const su = await alsSuper();
    const id = await firmaId(su);
    expect((await su.del(`/api/companies/${id}/admins/${leaId}`, {
      currentPassword: SUPER.password,
    })).status).toBe(200);

    expect((await su.get("/api/state")).data.companies[0].adminCount).toBe(1);
    expect((await client().login(EMPLOYEE)).status).toBe(401);
  });

  test("ohne das Verwaltungs-Passwort geht es nicht", async () => {
    const admin = await asAdmin();
    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;
    await admin.post(`/api/accounts/${leaId}/promote`);

    const su = await alsSuper();
    const id = await firmaId(su);
    expect((await su.del(`/api/companies/${id}/admins/${leaId}`, { currentPassword: "falsch" })).status).toBe(403);
    expect((await su.get("/api/state")).data.companies[0].adminCount).toBe(2);
  });

  test("das letzte Admin-Konto geht nur mit Nachfolge", async () => {
    const su = await alsSuper();
    const id = await firmaId(su);
    const admins = (await su.get(`/api/companies/${id}/admins`)).data;
    const leute = (await su.get(`/api/companies/${id}/employees`)).data;
    expect(admins).toHaveLength(1);

    /* Eine Firma ohne Administration könnte niemand mehr verwalten, und ihre
       Mitarbeitenden kämen an keine Schicht mehr. */
    const ohne = await su.del(`/api/companies/${id}/admins/${admins[0].id}`, {
      currentPassword: SUPER.password,
    });
    expect(ohne.status).toBe(409);
    expect(ohne.data.error).toMatch(/Nachfolge|übernimmt/);

    const mit = await su.del(`/api/companies/${id}/admins/${admins[0].id}`, {
      currentPassword: SUPER.password,
      nachfolgerId: leute[0].id,
    });
    expect(mit.status).toBe(200);
    expect(mit.data.nachfolge).toBe("Lea Brunner");

    // Lea führt die Firma jetzt — und kommt an die Admin-Wege.
    const lea = client();
    await lea.login(EMPLOYEE);
    expect((await lea.get("/api/state")).data.company.accounts.find((a) => a.name === "Lea Brunner").role).toBe("admin");
    expect((await lea.post("/api/employees", { name: "Neue Person", email: "neu@beispiel.ch" })).status).toBe(200);
  });

  test("eine Nachfolge aus einer fremden Firma zählt nicht", async () => {
    const fremdeId = createCompany(server.db, {
      code: "222222", name: "Zweite Firma AG", adminName: "Andere Chefin", adminPassword: "12345",
    });
    const su = await alsSuper();
    const id = await firmaId(su);
    const admins = (await su.get(`/api/companies/${id}/admins`)).data;

    const res = await su.del(`/api/companies/${id}/admins/${admins[0].id}`, {
      currentPassword: SUPER.password,
      nachfolgerId: readCompany(server.db, fremdeId).accounts[0].id,
    });
    expect(res.status).toBe(409);
  });

  test("Firmen-Admins kommen an diesen Weg nicht heran", async () => {
    const su = await alsSuper();
    const id = await firmaId(su);
    const admins = (await su.get(`/api/companies/${id}/admins`)).data;

    const admin = await asAdmin();
    expect((await admin.del(`/api/companies/${id}/admins/${admins[0].id}`, {
      currentPassword: SUPER.password,
    })).status).toBe(403);
    expect((await admin.get(`/api/companies/${id}/employees`)).status).toBe(403);
  });
});

describe("Verwaltung", () => {
  test("legt Unternehmen an, aber keinen doppelten Firmencode", async () => {
    const su = client();
    await su.login(SUPER);

    const daten = {
      name: "Zweite Firma AG", code: "222222",
      adminName: "Neue Chefin", adminPassword: "chefinPw1", adminEmail: "chefin@beispiel.ch",
    };
    expect((await su.post("/api/companies", daten)).status).toBe(200);

    const doppelt = await su.post("/api/companies", { ...daten, code: "111111" });
    expect(doppelt.status).toBe(409);
    expect(doppelt.data.error).toBe("Dieser Firmencode wird bereits verwendet.");

    // Nur mit dem vergebenen Passwort, nicht mit irgendeinem.
    expect((await client().login({ code: "222222", name: "Neue Chefin", password: "12345" })).status).toBe(401);
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
    // Wieder schliessen: ein offenes Handle hält die Datei fest und das
    // Wegwerf-Verzeichnis liesse sich danach nicht mehr löschen.
    const kopie = openDb(datei);
    try {
      expect(readCompany(kopie, server.db.prepare("SELECT id FROM companies").get().id).code).toBe("111111");
    } finally {
      kopie.close();
    }
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
      adminName: "Chefin", adminPassword: "chefinPw1", adminEmail: "chefin@beispiel.ch",
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

describe("Aufräumen", () => {
  test("Schichten verschwinden fünf Jahre nach ihrem Datum vollständig", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const companyId = (await admin.get("/api/state")).data.company.id;

    const anlegen = (datum) => {
      const id = `s_${datum}`;
      server.db
        .prepare(
          `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time,
                               repeat, seats, assignment_attempted, assigned_at)
           VALUES (?, ?, 'serie_alt', 'Altdienst', ?, '08:00', '16:00', 'once', 1, 1, NULL)`
        )
        .run(id, companyId, datum);
      server.db
        .prepare("INSERT INTO shift_qualifications (shift_id, qualification_id) VALUES (?, ?)")
        .run(id, qualId);
      return id;
    };

    const uralt = anlegen(toISO(addMonths(startOfToday(), -61)));
    const knappDrunter = anlegen(toISO(addDays(addMonths(startOfToday(), -60), 1)));

    // Einschreibung an der alten Schicht, damit auch die Verknüpfung geprüft ist.
    const leaId = server.db.prepare("SELECT id FROM accounts WHERE name = 'Lea Brunner'").get().id;
    server.db.prepare("INSERT INTO enrollments (shift_id, account_id, assigned) VALUES (?, ?, 1)")
      .run(uralt, leaId);

    expect(purgeOldShifts(server.db)).toBe(1);

    const ids = server.db.prepare("SELECT id FROM shifts").all().map((r) => r.id);
    expect(ids).toContain(knappDrunter);
    expect(ids).not.toContain(uralt);
    // Die Einschreibung darf nicht als Karteileiche zurückbleiben.
    expect(server.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE shift_id = ?").get(uralt).n).toBe(0);
  });
});

describe("Neustart", () => {
  test("die Daten liegen in der Datei und überleben", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schichtboard-"));
    const file = path.join(dir, "test.db");

    const erst = openDb(file);
    const companyId = createCompany(erst, {
      code: "444444", name: "Bleibt Bestehen AG",
      adminName: "Chefin", adminPassword: "12345",
    });
    erst.close();

    const zweit = openDb(file);
    expect(readCompany(zweit, companyId).name).toBe("Bleibt Bestehen AG");
    zweit.close();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("Mehrere Qualifikationen je Schicht", () => {
  /** Legt eine zweite Qualifikation an und gibt beide IDs zurück. */
  async function zweiQualifikationen(admin) {
    const ersteId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const { data } = await admin.post("/api/qualifications", { name: "Staplerschein" });
    return [ersteId, data.id];
  }

  async function schichtMit(admin, qualificationIds, extra = {}) {
    const res = await admin.post("/api/shifts", {
      name: "Doppeldienst", date: heute(), startTime: "08:00", endTime: "16:00",
      repeat: "once", seats: 1, qualificationIds, ...extra,
    });
    return res;
  }

  test("eine Schicht kann mehrere verlangen — und liefert sie auch so zurück", async () => {
    const admin = await asAdmin();
    const [ersteHilfe, stapler] = await zweiQualifikationen(admin);
    expect((await schichtMit(admin, [ersteHilfe, stapler])).status).toBe(200);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect([...shift.qualificationIds].sort()).toEqual([ersteHilfe, stapler].sort());
  });

  test("ohne Qualifikation entsteht keine Schicht", async () => {
    const admin = await asAdmin();
    const res = await schichtMit(admin, []);
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/Qualifikation/);
    expect((await admin.get("/api/state")).data.company.shifts).toHaveLength(0);
  });

  test("eine fremde Qualifikation kommt nicht durch", async () => {
    const admin = await asAdmin();
    const [ersteHilfe] = await zweiQualifikationen(admin);
    expect((await schichtMit(admin, [ersteHilfe, "gibt-es-nicht"])).status).toBe(400);
  });

  /* Der Kern der Sache: verlangt heisst verlangt. Wer nur eine der beiden
     mitbringt, kommt nicht hinein — sonst wäre die zweite Angabe wirkungslos. */
  test("wer nur eine der beiden mitbringt, kommt nicht hinein", async () => {
    const admin = await asAdmin();
    const [ersteHilfe, stapler] = await zweiQualifikationen(admin);
    await schichtMit(admin, [ersteHilfe, stapler]);
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    // Lea hat aus der Demo nur die ersten beiden Qualifikationen, keinen Stapler.
    const lea = client();
    await lea.login(EMPLOYEE);
    const abgelehnt = await lea.post(`/api/shifts/${shiftId}/enroll`);
    expect(abgelehnt.status).toBe(403);
    expect((await admin.get("/api/state")).data.company.shifts[0].enrolled).toHaveLength(0);

    // Mit der fehlenden Qualifikation geht es.
    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;
    await admin.patch(`/api/accounts/${leaId}/qualifications`, { qualificationId: stapler, value: true });
    expect((await lea.post(`/api/shifts/${shiftId}/enroll`)).status).toBe(200);
  });

  test("dieselben Anforderungen in anderer Reihenfolge sind keine Änderung", async () => {
    const admin = await asAdmin();
    const [ersteHilfe, stapler] = await zweiQualifikationen(admin);
    await schichtMit(admin, [ersteHilfe, stapler]);
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;
    await admin.patch(`/api/accounts/${leaId}/qualifications`, { qualificationId: stapler, value: true });
    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    expect((await admin.get("/api/state")).data.company.shifts[0].enrolled).toHaveLength(1);

    // Umgedrehte Liste, sonst alles gleich: niemand darf dafür herausfliegen.
    const res = await admin.patch(`/api/shifts/${shiftId}`, {
      name: "Doppeldienst", date: heute(), startTime: "08:00", endTime: "16:00",
      seats: 1, qualificationIds: [stapler, ersteHilfe], umfang: "einzeln",
    });
    expect(res.status).toBe(200);
    expect(res.data.geaendert).toBe(false);
    expect((await admin.get("/api/state")).data.company.shifts[0].enrolled).toHaveLength(1);
  });

  test("eine zusätzliche Anforderung ist eine Änderung und trägt aus", async () => {
    const admin = await asAdmin();
    const [ersteHilfe, stapler] = await zweiQualifikationen(admin);
    await schichtMit(admin, [ersteHilfe]);
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    expect((await admin.get("/api/state")).data.company.shifts[0].enrolled).toHaveLength(1);

    const res = await admin.patch(`/api/shifts/${shiftId}`, {
      name: "Doppeldienst", date: heute(), startTime: "08:00", endTime: "16:00",
      seats: 1, qualificationIds: [ersteHilfe, stapler], umfang: "einzeln",
    });
    expect(res.data.geaendert).toBe(true);
    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.enrolled).toHaveLength(0);
    expect(shift.qualificationIds).toHaveLength(2);
  });

  test("nachgefüllte Serientermine erben alle Anforderungen", async () => {
    const admin = await asAdmin();
    const [ersteHilfe, stapler] = await zweiQualifikationen(admin);
    await schichtMit(admin, [ersteHilfe, stapler], { repeat: "daily" });

    // Horizont vorschieben, indem die Serie künstlich gekürzt wird.
    const alle = (await admin.get("/api/state")).data.company.shifts;
    const behalten = alle[0].id;
    server.db.prepare("DELETE FROM shifts WHERE id != ?").run(behalten);

    extendSeries(server.db);
    const nachher = (await admin.get("/api/state")).data.company.shifts;
    expect(nachher.length).toBeGreaterThan(1);
    for (const s of nachher) {
      expect([...s.qualificationIds].sort()).toEqual([ersteHilfe, stapler].sort());
    }
  });

  test("eine noch verlangte Qualifikation lässt sich nicht löschen", async () => {
    const admin = await asAdmin();
    const [ersteHilfe, stapler] = await zweiQualifikationen(admin);
    await schichtMit(admin, [ersteHilfe, stapler]);

    expect((await admin.del(`/api/qualifications/${stapler}`)).status).toBe(409);
  });
});

describe("Migration: aus der einen Qualifikation werden mehrere", () => {
  /* Eine Datenbank aus der Zeit vor shift_qualifications: Die Anforderung stand
     als Spalte an der Schicht. Beim Öffnen soll sie in die Tabelle wandern —
     ohne dass eine Schicht ihre Anforderung verliert. */
  test("shifts.qualification_id wandert beim Öffnen in shift_qualifications", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schichtboard-qual-migration-"));
    const file = path.join(dir, "test.db");

    const alt = new Database(file);
    alt.exec(`
      CREATE TABLE companies (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, assignment_day INTEGER NOT NULL DEFAULT 7);
      CREATE TABLE qualifications (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT NOT NULL);
      CREATE TABLE shifts (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL, series_id TEXT NOT NULL, name TEXT NOT NULL,
        date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, repeat TEXT NOT NULL,
        seats INTEGER NOT NULL, qualification_id TEXT, end_date TEXT,
        assignment_attempted INTEGER NOT NULL DEFAULT 0, assigned_at TEXT,
        no_auto_assign INTEGER NOT NULL DEFAULT 0
      );
    `);
    alt.prepare("INSERT INTO companies (id, code, name) VALUES ('c1', '999999', 'Alt AG')").run();
    alt.prepare("INSERT INTO qualifications (id, company_id, name) VALUES ('q1', 'c1', 'Erste Hilfe')").run();
    alt.prepare(
      `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time, repeat, seats, qualification_id)
       VALUES ('s1', 'c1', 'serie1', 'Altdienst', '2026-01-05', '08:00', '16:00', 'once', 1, 'q1')`
    ).run();
    // Eine ohne Anforderung — die soll auch keine bekommen.
    alt.prepare(
      `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time, repeat, seats, qualification_id)
       VALUES ('s2', 'c1', 'serie2', 'Ohne', '2026-01-06', '08:00', '16:00', 'once', 1, NULL)`
    ).run();
    alt.close();

    const db = openDb(file);
    expect(db.prepare("SELECT qualification_id FROM shift_qualifications WHERE shift_id = 's1'").get())
      .toEqual({ qualification_id: "q1" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM shift_qualifications WHERE shift_id = 's2'").get().n).toBe(0);
    /* Die alte Spalte ist weg — zwei Antworten auf dieselbe Frage soll es nicht
       geben. Und mit ihr `no_auto_assign`, ein Rest einer noch früheren
       Fassung, den niemand mehr liest. */
    const spalten = db.prepare("PRAGMA table_info(shifts)").all().map((c) => c.name);
    expect(spalten).not.toContain("qualification_id");
    expect(spalten).not.toContain("no_auto_assign");
    db.close();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("Migration: neue Logbuch-Typen", () => {
  /* SQLite kann eine CHECK-Bedingung nicht per ALTER TABLE erweitern — dieser
     Test baut von Hand die *alte* Fassung von logbook_entries (vor den
     Kontoänderungen im Logbuch) und prüft, dass openDb() sie beim nächsten
     Start migriert, ohne den bisherigen Inhalt zu verlieren. */
  test("eine Datenbank mit der alten CHECK-Liste bekommt beim Öffnen die neue, ohne Daten zu verlieren", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schichtboard-migration-"));
    const file = path.join(dir, "test.db");

    const alt = new Database(file);
    alt.exec(`
      CREATE TABLE companies (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, assignment_day INTEGER NOT NULL DEFAULT 7);
      CREATE TABLE logbook_entries (
        id                 TEXT PRIMARY KEY,
        company_id         TEXT NOT NULL,
        shift_id           TEXT,
        shift_label        TEXT NOT NULL,
        type               TEXT NOT NULL CHECK (type IN
                              ('created', 'updated', 'assigned', 'unassigned', 'reassigned', 'help_requested', 'help_withdrawn')),
        message            TEXT NOT NULL,
        actor_account_id   TEXT,
        target_account_id  TEXT,
        created_at         TEXT NOT NULL
      );
    `);
    alt.prepare("INSERT INTO companies (id, code, name) VALUES ('c1', '999999', 'Alt AG')").run();
    alt.prepare(
      `INSERT INTO logbook_entries (id, company_id, shift_id, shift_label, type, message, created_at)
       VALUES ('log1', 'c1', NULL, 'Alte Schicht', 'created', 'Schicht angelegt von Jemandem.', '2024-01-01T00:00:00.000Z')`
    ).run();
    // Die alte Tabelle lässt den neuen Wert (noch) nicht zu — sonst wäre dieser Test gegenstandslos.
    expect(() => alt.prepare(
      `INSERT INTO logbook_entries (id, company_id, shift_id, shift_label, type, message, created_at)
       VALUES ('log2', 'c1', NULL, 'X', 'account_updated', 'egal', '2024-01-01T00:00:00.000Z')`
    ).run()).toThrow();
    alt.close();

    const db = openDb(file);
    // Der alte Eintrag ist noch da …
    expect(db.prepare("SELECT message FROM logbook_entries WHERE id = 'log1'").get().message)
      .toBe("Schicht angelegt von Jemandem.");
    // … und der neue Typ geht jetzt.
    expect(() => db.prepare(
      `INSERT INTO logbook_entries (id, company_id, shift_id, shift_label, type, message, created_at)
       VALUES ('log2', 'c1', NULL, 'X', 'account_updated', 'egal', '2024-01-01T00:00:00.000Z')`
    ).run()).not.toThrow();
    db.close();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("Kalenderabo", () => {
  /* Nur zugeteilte Schichten gehören in den Kalender — eine Einschreibung ist
     ein Wunsch, eine Zuteilung eine Verpflichtung. Das Zeichen in der Adresse
     ist ohne Anmeldung der einzige Zugang, deshalb prüfen die Tests hier
     ausschliesslich über `client().raw(...)`, ganz ohne Cookie. */
  const qualVon = async (admin) => (await admin.get("/api/state")).data.company.qualifications[0].id;
  const tokenAus = (url) => url.split("/").pop().replace(".ics", "");
  const feedVon = async (token) => (await client().raw("GET", `/api/kalender/${token}.ics`)).text();

  test("ohne eingeschaltetes Abo ist der Stand aus", async () => {
    const admin = await asAdmin();
    const meineId = (await admin.get("/api/state")).data.userId;
    const { status, data } = await admin.get(`/api/accounts/${meineId}/calendar-token`);
    expect(status).toBe(200);
    expect(data.url).toBeNull();
  });

  test("ein unbekanntes Zeichen liefert 404, nicht 403", async () => {
    const res = await client().raw("GET", "/api/kalender/unbekanntesZeichen.ics");
    expect(res.status).toBe(404);
  });

  test("ein gültiges Zeichen liefert 200 und text/calendar", async () => {
    const admin = await asAdmin();
    const meineId = (await admin.get("/api/state")).data.userId;
    const { data } = await admin.post(`/api/accounts/${meineId}/calendar-token`);
    expect(data.url).toMatch(/^https?:\/\/.+\/api\/kalender\/.+\.ics$/);

    const res = await client().raw("GET", `/api/kalender/${tokenAus(data.url)}.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/calendar/);
  });

  test("nur die eigenen zugeteilten Schichten stehen im Feed, blosse Einschreibungen nicht", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    const tomId = await legeMitarbeitendeAn(admin, { name: "Tom Klein", password: "geheim123" });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Zugeteilt", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    await admin.post("/api/shifts", {
      name: "Nur eingeschrieben", date: heute(), startTime: "14:00", endTime: "18:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shifts = (await admin.get("/api/state")).data.company.shifts;
    const zugeteiltId = shifts.find((s) => s.name === "Zugeteilt").id;
    const wartelisteId = shifts.find((s) => s.name === "Nur eingeschrieben").id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${zugeteiltId}/enroll`); // bekommt den einzigen Platz

    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "geheim123" });
    await tom.post(`/api/shifts/${wartelisteId}/enroll`); // besetzt den einzigen Platz zuerst
    await lea.post(`/api/shifts/${wartelisteId}/enroll`); // Lea bleibt auf der Warteliste

    const leaId = (await lea.get("/api/state")).data.userId;
    const { data } = await lea.post(`/api/accounts/${leaId}/calendar-token`);
    const text = await feedVon(tokenAus(data.url));

    expect(text).toContain("Zugeteilt");
    expect(text).not.toContain("Nur eingeschrieben");
  });

  test("keine Schicht einer fremden Firma taucht auf", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await admin.post("/api/shifts", {
      name: "Eigene Schicht", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    await admin.post(`/api/shifts/${shiftId}/enroll`);
    const meineId = (await admin.get("/api/state")).data.userId;
    const { data } = await admin.post(`/api/accounts/${meineId}/calendar-token`);

    // Fremde Firma mit eigener zugeteilter Schicht, direkt in der Datenbank.
    const fremdeId = createCompany(server.db, {
      code: "222222", name: "Zweite Firma AG", adminName: "Andere Chefin", adminPassword: "12345",
    });
    const fremdesKonto = readCompany(server.db, fremdeId).accounts[0].id;
    server.db.prepare(
      `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time,
                           repeat, seats, assignment_attempted, assigned_at)
       VALUES ('s_fremd', ?, 'serie_fremd', 'Fremde Schicht', ?, '06:00', '12:00', 'once', 1, 1, ?)`
    ).run(fremdeId, heute(), heute());
    server.db.prepare("INSERT INTO enrollments (shift_id, account_id, assigned) VALUES ('s_fremd', ?, 1)")
      .run(fremdesKonto);

    const text = await feedVon(tokenAus(data.url));
    expect(text).toContain("Eigene Schicht");
    expect(text).not.toContain("Fremde Schicht");
  });

  test("Neue Adresse erzeugen macht die alte ungültig", async () => {
    const admin = await asAdmin();
    const meineId = (await admin.get("/api/state")).data.userId;
    const erste = (await admin.post(`/api/accounts/${meineId}/calendar-token`)).data.url;
    const zweite = (await admin.post(`/api/accounts/${meineId}/calendar-token`)).data.url;
    expect(zweite).not.toBe(erste);

    expect((await client().raw("GET", `/api/kalender/${tokenAus(erste)}.ics`)).status).toBe(404);
    expect((await client().raw("GET", `/api/kalender/${tokenAus(zweite)}.ics`)).status).toBe(200);
  });

  test("nur das eigene Konto kann sein Abo einschalten", async () => {
    const admin = await asAdmin();
    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;
    expect((await admin.post(`/api/accounts/${leaId}/calendar-token`)).status).toBe(403);
    expect((await admin.get(`/api/accounts/${leaId}/calendar-token`)).status).toBe(403);
  });

  test("eine Nachtschicht endet im Feed am Folgetag", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await admin.post("/api/shifts", {
      name: "Nachtdienst", date: heute(), startTime: "22:00", endTime: "06:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    await admin.post(`/api/shifts/${shiftId}/enroll`);

    const meineId = (await admin.get("/api/state")).data.userId;
    const { data } = await admin.post(`/api/accounts/${meineId}/calendar-token`);
    const text = await feedVon(tokenAus(data.url));

    const morgenKompakt = toISO(addDays(startOfToday(), 1)).replaceAll("-", "");
    expect(text).toMatch(new RegExp(`DTEND:${morgenKompakt}T060000`));
  });

  test("die Form: BEGIN/END-Paare, CRLF-Zeilenenden, ein VEVENT je zugeteilter Schicht", async () => {
    const admin = await asAdmin();
    const qualId = await qualVon(admin);
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    await admin.post(`/api/shifts/${shiftId}/enroll`);

    const meineId = (await admin.get("/api/state")).data.userId;
    const { data } = await admin.post(`/api/accounts/${meineId}/calendar-token`);
    const text = await feedVon(tokenAus(data.url));

    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/); // jedes LF hat ein CR davor — keine nackten Zeilenenden
    expect((text.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
    expect((text.match(/END:VEVENT/g) || []).length).toBe(1);
  });
});

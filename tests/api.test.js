/* Die API, so wie der Browser sie benutzt — inklusive der Regeln, die im
   Browser bisher nur durch ausgegraute Knöpfe galten. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addDays, addMonths, toISO, startOfToday } from "#shared/dates.js";
import { hashPassword } from "../server/auth.js";
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

/**
 * Legt ein Mitarbeitendenkonto an und setzt ihm ein Passwort. Neue Konten
 * bekommen ihres sonst nur über den Einladungslink — für Tests, die sich
 * gleich anmelden wollen, wäre das nur Umweg.
 */
async function legeMitarbeitendeAn(admin, { name, email, password }) {
  const { data } = await admin.post("/api/employees", { name, email, notify: false });
  server.db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?")
    .run(hashPassword(password), data.id);
  return data.id;
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
    const tomId = await legeMitarbeitendeAn(admin, {
      name: "Tom Klein", email: "tom@firma.ch", password: "12345",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

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

  test("aus einer festen Zuteilung trägt sich niemand selbst aus", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationId: qualId,
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
      repeat: "once", seats: 1, qualificationId: qualId,
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
      name: "Tom Klein", email: "tom@firma.ch", password: "12345",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationId: qualId,
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    // Beide schreiben sich ein, einer bekommt den einen Platz.
    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "12345" });
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
      name: "Tom Klein", email: "tom@firma.ch", password: "12345",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationId: qualId,
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "12345" });
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
      repeat: "once", seats: 1, qualificationId: qualId,
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
      repeat: "once", seats: 1, qualificationId: qualId,
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
      repeat: "once", seats: 1, qualificationId: qualId,
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
      name: "Tom Klein", email: "tom@firma.ch", password: "12345",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationId: qualId,
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "12345" });
    await tom.post(`/api/shifts/${shiftId}/enroll`);

    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.assigned).toHaveLength(1); // die Platzzahl bleibt gewahrt
    expect(shift.enrolled).toHaveLength(2);
  });

  test("die Auslosung räumt die Warteliste ab", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const tomId = await legeMitarbeitendeAn(admin, {
      name: "Tom Klein", email: "tom@firma.ch", password: "12345",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    // Zuteilungstag auf morgen: die Auslosung läuft erst auf Anordnung.
    const morgen = Math.min(28, startOfToday().getDate() + 1);
    await admin.patch("/api/settings", { assignmentDay: morgen });
    const naechsterMonat = new Date();
    naechsterMonat.setMonth(naechsterMonat.getMonth() + 1, 15);
    await admin.post("/api/shifts", {
      name: "Spätdienst", date: toISO(naechsterMonat), startTime: "14:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationId: qualId,
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "12345" });
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
      name: "Tom Klein", email: "tom@firma.ch", password: "12345",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    const morgen = Math.min(28, startOfToday().getDate() + 1);
    await admin.patch("/api/settings", { assignmentDay: morgen });
    const naechsterMonat = new Date();
    naechsterMonat.setMonth(naechsterMonat.getMonth() + 1, 15);
    await admin.post("/api/shifts", {
      name: "Spätdienst", date: toISO(naechsterMonat), startTime: "14:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationId: qualId,
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const leaId = (await lea.get("/api/state")).data.userId;
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "12345" });
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
      repeat: "once", seats: 1, qualificationId: qualId,
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
      repeat: "once", seats: 1, qualificationId: qualId,
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
      repeat: "once", seats: 1, qualificationId: qualId,
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
      repeat: "daily", seats: 1, qualificationId: qualId,
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
      name: "Tom Klein", email: "tom@firma.ch", password: "12345",
    });
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationId: qualId,
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    // Beide eingeschrieben, eine Person bekommt den Platz.
    const lea = client();
    await lea.login(EMPLOYEE);
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const tom = client();
    await tom.login({ code: "111111", name: "Tom Klein", password: "12345" });
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
      repeat: "once", seats: 1, qualificationId: qualId,
    });

    const res = await admin.del(`/api/qualifications/${qualId}`);
    expect(res.status).toBe(409);

    // Sonst stünde die Schicht ohne Qualifikation da und wäre unbesetzbar.
    const state = (await admin.get("/api/state")).data.company;
    expect(state.qualifications.some((q) => q.id === qualId)).toBe(true);
    expect(state.shifts[0].qualificationId).toBe(qualId);

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

  test("die Administration setzt ein vergessenes Passwort neu", async () => {
    const admin = await asAdmin();
    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;

    // Bestätigt wird mit dem eigenen Admin-Passwort, nicht mit dem fremden.
    expect((await admin.post(`/api/accounts/${leaId}/password`, {
      password: "neuStart", currentPassword: "falsch",
    })).status).toBe(403);

    expect((await admin.post(`/api/accounts/${leaId}/password`, {
      password: "neuStart", currentPassword: "12345",
    })).status).toBe(200);

    expect((await client().login({ ...EMPLOYEE, password: "neuStart" })).status).toBe(200);
  });

  test("die Administration kann ein Konto auch ohne Link freischalten", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", {
      name: "Tom Klein", email: "tom@firma.ch", notify: false,
    });

    expect((await admin.post(`/api/accounts/${data.id}/password`, {
      password: "vomAdmin", currentPassword: "12345",
    })).status).toBe(200);
    expect((await client().login({ code: "111111", name: "Tom Klein", password: "vomAdmin" })).status).toBe(200);
  });

  test("ein gesetztes Passwort entwertet den offenen Einladungslink", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", {
      name: "Tom Klein", email: "tom@firma.ch", notify: false,
    });
    const token = new URL(data.link).searchParams.get("token");

    await admin.post(`/api/accounts/${data.id}/password`, {
      password: "vomAdmin", currentPassword: "12345",
    });

    /* Sonst könnte, wer die Einladung bekommen hat — etwa bei vertippter
       Adresse eine fremde Person — das Konto noch tagelang übernehmen. */
    expect((await client().get(`/api/password-reset/${token}`)).data.valid).toBe(false);
    expect((await client().post(`/api/password-reset/${token}`, { password: "gekapert" })).status).toBe(410);
    expect((await client().login({ code: "111111", name: "Tom Klein", password: "vomAdmin" })).status).toBe(200);
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

describe("Zugangsdaten verschicken", () => {
  /* Ohne SMTP verschickt der Server nichts und meldet das auch so — genau der
     Fall, in dem die Oberfläche nicht "ist unterwegs" behaupten darf. */
  test("meldet ehrlich, wenn kein Versand eingerichtet ist", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", {
      name: "Tom Klein", email: "tom@firma.ch",
    });
    expect(data.id).toBeTruthy();
    expect(data.benachrichtigt).toBe(false);
  });

  test("das Häkchen unterbindet den Versand, das Konto entsteht trotzdem", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", {
      name: "Tom Klein", email: "tom@firma.ch", notify: false,
    });
    expect(data.benachrichtigt).toBe(false);
    expect(data.link).toContain("passwort-neu?token=");
    expect((await admin.get("/api/state")).data.company.accounts.map((a) => a.name)).toContain("Tom Klein");
  });

  test("ein neues Konto hat noch kein Passwort", async () => {
    const admin = await asAdmin();
    await admin.post("/api/employees", { name: "Tom Klein", email: "tom@firma.ch", notify: false });

    // Weder leer noch erraten: der Zugang geht ausschliesslich über den Link.
    for (const versuch of ["", "12345", "tom", "passwort"]) {
      expect((await client().login({ code: "111111", name: "Tom Klein", password: versuch })).status).toBe(401);
    }
  });

  test("über den Einladungslink setzt das Konto sein Passwort", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", {
      name: "Tom Klein", email: "tom@firma.ch", notify: false,
    });
    const token = new URL(data.link).searchParams.get("token");

    const c = client();
    expect((await c.get(`/api/password-reset/${token}`)).data.valid).toBe(true);
    expect((await c.post(`/api/password-reset/${token}`, { password: "selbstGewaehlt" })).status).toBe(200);
    expect((await client().login({ code: "111111", name: "Tom Klein", password: "selbstGewaehlt" })).status).toBe(200);
  });

  test("auch das erste Admin-Konto kommt über einen Link herein", async () => {
    const su = client();
    await su.login(SUPER);
    const { data } = await su.post("/api/companies", {
      name: "Zweite Firma AG", code: "222222",
      adminName: "Neue Chefin", adminEmail: "chefin@zweite.ch", notify: false,
    });
    const token = new URL(data.link).searchParams.get("token");

    expect((await client().post(`/api/password-reset/${token}`, { password: "chefinPw" })).status).toBe(200);
    const res = await client().login({ code: "222222", name: "Neue Chefin", password: "chefinPw" });
    expect(res.status).toBe(200);
  });

  test("ein gescheiterter Versand verhindert das Konto nicht", async () => {
    // Ein Postfach, das es nicht gibt: der Verbindungsversuch muss scheitern.
    const kaputt = await startTestServer({
      env: { SB_SMTP_HOST: "127.0.0.1", SB_SMTP_PORT: "1", SB_SMTP_INSECURE: "1", SB_SMTP_FROM: "x@y.ch" },
    });
    try {
      const admin = createClient(kaputt.url);
      await admin.login(ADMIN);
      const { data } = await admin.post("/api/employees", {
        name: "Tom Klein", email: "tom@firma.ch",
      });
      expect(data.id).toBeTruthy();
      expect(data.benachrichtigt).toBe(false);
      // Der Link bleibt der Administration – sonst wäre das Konto unerreichbar.
      expect(data.link).toContain("passwort-neu?token=");
    } finally {
      await kaputt.close();
    }
  });

  test("ein neues Unternehmen braucht eine Admin-Adresse", async () => {
    const su = client();
    await su.login(SUPER);
    const res = await su.post("/api/companies", {
      name: "Zweite Firma AG", code: "222222",
      adminName: "Neue Chefin", adminEmail: "",
    });
    expect(res.status).toBe(400);
  });
});

describe("Passwort vergessen", () => {
  /** Holt das Token direkt aus der Datenbank — die E-Mail selbst geht hier nirgends hin. */
  const tokenFuer = (accountId) =>
    server.db.prepare("SELECT token_hash FROM password_resets WHERE account_id = ?").get(accountId);

  test("legt für ein bekanntes Konto ein Token an", async () => {
    const admin = await asAdmin();
    const lea = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner");

    const res = await client().post("/api/password-reset/request", {
      code: "111111", email: "LEA@firma.ch",  // Grossschreibung darf nichts ausmachen
    });
    expect(res.status).toBe(200);
    expect(tokenFuer(lea.id)).toBeTruthy();
  });

  test("verrät nicht, ob es das Konto gibt", async () => {
    const bekannt = await client().post("/api/password-reset/request", {
      code: "111111", email: "lea@firma.ch",
    });
    const unbekannt = await client().post("/api/password-reset/request", {
      code: "111111", email: "niemand@firma.ch",
    });
    // Gleicher Status, gleiche Antwort — sonst liesse sich die Belegschaft abfragen.
    expect(unbekannt.status).toBe(bekannt.status);
    expect(unbekannt.data).toEqual(bekannt.data);
  });

  test("das Token setzt das Passwort und gilt danach nicht mehr", async () => {
    const admin = await asAdmin();
    const lea = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner");

    // Wie in der Mail: Klartext-Token erzeugen, Hash in die Datenbank.
    const crypto = await import("node:crypto");
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    server.db.prepare("INSERT INTO password_resets (token_hash, account_id, expires_at) VALUES (?, ?, ?)")
      .run(hash, lea.id, new Date(Date.now() + 3600e3).toISOString());

    const c = client();
    expect((await c.get(`/api/password-reset/${token}`)).data.valid).toBe(true);
    expect((await c.post(`/api/password-reset/${token}`, { password: "ganzNeu" })).status).toBe(200);
    expect((await client().login({ ...EMPLOYEE, password: "ganzNeu" })).status).toBe(200);

    // Einmal und nicht wieder.
    expect((await c.get(`/api/password-reset/${token}`)).data.valid).toBe(false);
    expect((await c.post(`/api/password-reset/${token}`, { password: "nochmal" })).status).toBe(410);
  });

  test("ein abgelaufenes Token wird abgewiesen", async () => {
    const admin = await asAdmin();
    const lea = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner");

    const crypto = await import("node:crypto");
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    server.db.prepare("INSERT INTO password_resets (token_hash, account_id, expires_at) VALUES (?, ?, ?)")
      .run(hash, lea.id, new Date(Date.now() - 1000).toISOString());

    expect((await client().post(`/api/password-reset/${token}`, { password: "zuSpaet" })).status).toBe(410);
    expect((await client().login({ ...EMPLOYEE, password: "zuSpaet" })).status).toBe(401);
  });

  test("ein erfundenes Token führt zu nichts", async () => {
    const c = client();
    expect((await c.get("/api/password-reset/ausgedacht")).data.valid).toBe(false);
    expect((await c.post("/api/password-reset/ausgedacht", { password: "egal12" })).status).toBe(410);
  });

  test("in der Datenbank steht kein verwendbares Token", async () => {
    const admin = await asAdmin();
    const lea = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner");
    await client().post("/api/password-reset/request", { code: "111111", email: "lea@firma.ch" });

    // Gespeichert ist der Hash; damit lässt sich der Link nicht nachbauen.
    const { token_hash } = tokenFuer(lea.id);
    expect((await client().post(`/api/password-reset/${token_hash}`, { password: "versuch" })).status).toBe(410);
  });
});

describe("Verwaltung", () => {
  test("legt Unternehmen an, aber keinen doppelten Firmencode", async () => {
    const su = client();
    await su.login(SUPER);

    const daten = {
      name: "Zweite Firma AG", code: "222222",
      adminName: "Neue Chefin", adminEmail: "chefin@zweite.ch",
    };
    expect((await su.post("/api/companies", daten)).status).toBe(200);

    const doppelt = await su.post("/api/companies", { ...daten, code: "111111" });
    expect(doppelt.status).toBe(409);
    expect(doppelt.data.error).toBe("Dieser Firmencode wird bereits verwendet.");

    // Anmelden geht erst nach dem Einladungslink – das prüft ein eigener Test.
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
      adminName: "Chefin", adminEmail: "c@x.ch",
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
  test("Schichten verschwinden drei Monate nach ihrem Datum vollständig", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const companyId = (await admin.get("/api/state")).data.company.id;

    const anlegen = (datum) => {
      const id = `s_${datum}`;
      server.db
        .prepare(
          `INSERT INTO shifts (id, company_id, series_id, name, date, start_time, end_time,
                               repeat, seats, qualification_id, assignment_attempted, assigned_at)
           VALUES (?, ?, 'serie_alt', 'Altdienst', ?, '08:00', '16:00', 'once', 1, ?, 1, NULL)`
        )
        .run(id, companyId, datum, qualId);
      return id;
    };

    const uralt = anlegen(toISO(addMonths(startOfToday(), -4)));
    const knappDrunter = anlegen(toISO(addDays(addMonths(startOfToday(), -3), 1)));

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
      adminName: "Chefin", adminEmail: "c@x.ch", adminPassword: "12345",
    });
    erst.close();

    const zweit = openDb(file);
    expect(readCompany(zweit, companyId).name).toBe("Bleibt Bestehen AG");
    zweit.close();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

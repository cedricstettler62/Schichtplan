/* Die API, so wie der Browser sie benutzt — inklusive der Regeln, die im
   Browser bisher nur durch ausgegraute Knöpfe galten. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addDays, addMonths, toISO, startOfToday } from "#shared/dates.js";
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

/** Legt ein Mitarbeitendenkonto samt erstem Passwort an. */
async function legeMitarbeitendeAn(admin, { name, password }) {
  const { data } = await admin.post("/api/employees", { name, password });
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
      name: "Tom Klein", password: "12345",
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
      name: "Tom Klein", password: "12345",
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
      name: "Tom Klein", password: "12345",
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
      name: "Tom Klein", password: "12345",
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
      name: "Tom Klein", password: "12345",
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
      name: "Tom Klein", password: "12345",
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
      name: "Tom Klein", password: "12345",
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

  test("die Administration setzt ein neues Konto später wieder neu", async () => {
    const admin = await asAdmin();
    const { data } = await admin.post("/api/employees", { name: "Tom Klein", password: "erstesPw" });

    expect((await admin.post(`/api/accounts/${data.id}/password`, {
      password: "vomAdmin", currentPassword: "12345",
    })).status).toBe(200);

    expect((await client().login({ code: "111111", name: "Tom Klein", password: "vomAdmin" })).status).toBe(200);
    // Das erste Passwort gilt danach nicht mehr.
    expect((await client().login({ code: "111111", name: "Tom Klein", password: "erstesPw" })).status).toBe(401);
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

describe("Erstes Passwort", () => {
  /* Konten entstehen mit einem Passwort, das die Administration vergibt und
     persönlich weitergibt. Verschickt wird nichts — es gibt keinen Kanal mehr,
     auf dem es unterwegs mitlesbar wäre. */
  test("ein neues Konto meldet sich sofort an", async () => {
    const admin = await asAdmin();
    const { status, data } = await admin.post("/api/employees", { name: "Tom Klein", password: "startPw" });

    expect(status).toBe(200);
    expect(data.id).toBeTruthy();
    expect((await client().login({ code: "111111", name: "Tom Klein", password: "startPw" })).status).toBe(200);
  });

  test("ohne Passwort entsteht kein Konto", async () => {
    const admin = await asAdmin();

    // Sonst stünde ein Konto da, in das niemand hineinkommt.
    expect((await admin.post("/api/employees", { name: "Tom Klein" })).status).toBe(400);
    expect((await admin.post("/api/employees", { name: "Tom Klein", password: "abc" })).status).toBe(400);
    expect((await admin.post("/api/employees", { password: "langGenug" })).status).toBe(400);

    expect((await admin.get("/api/state")).data.company.accounts.map((a) => a.name)).not.toContain("Tom Klein");
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
      name: "Zweite Firma AG", code: "222222", adminName: "Neue Chefin", adminPassword: "chefinPw",
    });

    expect((await client().login({ code: "222222", name: "Neue Chefin", password: "chefinPw" })).status).toBe(200);
  });
});

describe("Überschneidende Schichten", () => {
  /* Wer eine Schicht übernimmt, kann in derselben Zeit keine zweite übernehmen.
     Ausnahmen trägt die Administration beim Anlegen ausdrücklich ein. */
  const qualVon = async (admin) => (await admin.get("/api/state")).data.company.qualifications[0].id;

  const anlegen = async (admin, qualId, form) =>
    admin.post("/api/shifts", { repeat: "once", seats: 1, qualificationId: qualId, ...form });

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
      seats: tag.seats, qualificationId: qualId, umfang: "einzeln",
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
    await admin.post("/api/shifts", { startTime: "08:00", endTime: "16:00", seats: 1, qualificationId: qualId, ...form });
    const shifts = (await admin.get("/api/state")).data.company.shifts;
    return { qualId, shifts };
  };

  const alleSchichten = async (c) => (await c.get("/api/state")).data.company.shifts;

  test("ändert Name, Zeiten und Plätze einer einzelnen Schicht", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Frühdienst", date: heute(), repeat: "once" });

    const res = await admin.patch(`/api/shifts/${shifts[0].id}`, {
      name: "Spätdienst", date: heute(), startTime: "14:00", endTime: "22:00",
      seats: 3, qualificationId: qualId, umfang: "einzeln",
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
      seats: 1, qualificationId: qualId, umfang: "einzeln",
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
      seats: 2, qualificationId: qualId, umfang: "einzeln",
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
      seats: 4, qualificationId: qualId, umfang: "ab-datum", abDatum,
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
      seats: 4, qualificationId: qualId, umfang: "ab-datum", abDatum: shifts[1].date,
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
      seats: 1, qualificationId: qualId, umfang: "ab-datum", abDatum: gestern,
    });
    expect(res.status).toBe(400);

    const einzeln = await admin.patch(`/api/shifts/${shifts[0].id}`, {
      name: "Rückwirkend", date: gestern, startTime: "08:00", endTime: "16:00",
      seats: 1, qualificationId: qualId, umfang: "einzeln",
    });
    expect(einzeln.status).toBe(400);
    expect((await alleSchichten(admin))[0].name).toBe("Tagdienst");
  });

  test("weist unbrauchbare Angaben ab", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Frühdienst", date: heute(), repeat: "once" });
    const gut = { name: "Neu", date: heute(), startTime: "08:00", endTime: "16:00", seats: 1, qualificationId: qualId };

    expect((await admin.patch(`/api/shifts/${shifts[0].id}`, { ...gut, name: "  " })).status).toBe(400);
    expect((await admin.patch(`/api/shifts/${shifts[0].id}`, { ...gut, seats: 0 })).status).toBe(400);
    expect((await admin.patch(`/api/shifts/${shifts[0].id}`, { ...gut, startTime: "8 Uhr" })).status).toBe(400);
    expect((await admin.patch(`/api/shifts/${shifts[0].id}`, { ...gut, qualificationId: "gibtsnicht" })).status).toBe(400);
    expect((await alleSchichten(admin))[0].name).toBe("Frühdienst");
  });

  test("Mitarbeitende bearbeiten keine Schichten", async () => {
    const admin = await asAdmin();
    const { qualId, shifts } = await anlegen(admin, { name: "Frühdienst", date: heute(), repeat: "once" });

    const lea = client();
    await lea.login(EMPLOYEE);
    const res = await lea.patch(`/api/shifts/${shifts[0].id}`, {
      name: "Selbst gemacht", date: heute(), startTime: "08:00", endTime: "16:00",
      seats: 9, qualificationId: qualId, umfang: "einzeln",
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
                           repeat, seats, qualification_id, assignment_attempted)
       VALUES ('s_fremd', ?, 'serie_fremd', 'Fremddienst', ?, '08:00', '16:00', 'once', 1, NULL, 0)`
    ).run(fremdeId, heute());

    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const res = await admin.patch("/api/shifts/s_fremd", {
      name: "Übernommen", date: heute(), startTime: "08:00", endTime: "16:00",
      seats: 1, qualificationId: qualId, umfang: "einzeln",
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
    admin.post("/api/shifts", { repeat: "once", seats: 1, qualificationId: qualId, ...form });

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
      seats: tag.seats, qualificationId: qualId, umfang: "einzeln",
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
      seats: tag.seats, qualificationId: qualId, umfang: "einzeln",
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
      seats: tag.seats, qualificationId: qualId, umfang: "einzeln",
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
      seats: 5, qualificationId: qualId, umfang: "einzeln",
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
      seats: abend.seats, qualificationId: qualId, umfang: "einzeln",
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
      seats: tag.seats, qualificationId: qualId, umfang: "einzeln",
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
      repeat: "once", seats: 1, qualificationId: qualId,
    });
    const frueh = await schichtNamens(admin, "Frühdienst");
    await admin.post("/api/shifts", {
      name: "Tagdienst", date: heute(), startTime: "14:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationId: qualId,
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
    const uralt = toISO(addMonths(startOfToday(), -4));
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

  test("Freigaben einer gelöschten Firma verschwinden mit ihr", async () => {
    const admin = await asAdmin();
    await mitFreigabe(admin);

    const su = client();
    await su.login(SUPER);
    const firmaId = server.db.prepare("SELECT id FROM companies WHERE code = '111111'").get().id;
    await su.del(`/api/companies/${firmaId}`);

    // Das erledigt der Fremdschlüssel auf company_id von selbst.
    expect(freigaben()).toBe(0);
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
      startTime: "16:00", endTime: "22:00", repeat: "once", seats: 1, qualificationId: qualId,
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
      password: "wiederDrin", currentPassword: SUPER.password,
    });

    expect(res.status).toBe(200);
    expect((await client().login({ ...ADMIN, password: "wiederDrin" })).status).toBe(200);
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

describe("Verwaltung", () => {
  test("legt Unternehmen an, aber keinen doppelten Firmencode", async () => {
    const su = client();
    await su.login(SUPER);

    const daten = {
      name: "Zweite Firma AG", code: "222222",
      adminName: "Neue Chefin", adminPassword: "chefinPw",
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
      adminName: "Chefin", adminPassword: "12345",
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
      adminName: "Chefin", adminPassword: "12345",
    });
    erst.close();

    const zweit = openDb(file);
    expect(readCompany(zweit, companyId).name).toBe("Bleibt Bestehen AG");
    zweit.close();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

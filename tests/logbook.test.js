/* Logbuch: unveränderlicher Audit-Trail plus die Einsichtsanfragen von
   Mitarbeitenden dazu. */

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addDays, toISO, startOfToday } from "#shared/dates.js";
import { ADMIN, EMPLOYEE, createClient, startTestServer } from "./helpers/server.js";

let server;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

const c = () => createClient(server.url);
const heute = () => toISO(startOfToday());
const gestern = () => toISO(addDays(startOfToday(), -1));

async function asAdmin() {
  const a = c();
  await a.login(ADMIN);
  return a;
}

async function asLea() {
  const l = c();
  await l.login(EMPLOYEE);
  return l;
}

/** Setzt das Datum einer Schicht direkt in der Datenbank — die API lässt das nicht zu. */
function backdate(shiftId, date) {
  server.db.prepare("UPDATE shifts SET date = ? WHERE id = ?").run(date, shiftId);
}

describe("Logbuch", () => {
  test("Anlegen und Zuteilen erzeugen Einträge, die nur die Administration sieht", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;

    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = await asLea();
    await lea.post(`/api/shifts/${shiftId}/enroll`);

    const { data: eintraege } = await admin.get("/api/logbook");
    const typen = eintraege.filter((e) => e.shiftId === shiftId).map((e) => e.type);
    expect(typen).toContain("created");
    expect(typen).toContain("assigned");

    // Mitarbeitende kommen ohne genehmigte Anfrage nicht heran.
    expect((await lea.get("/api/logbook")).status).toBe(403);
    expect((await lea.get(`/api/logbook?shiftId=${shiftId}`)).status).toBe(403);
  });

  test("Bearbeiten, Austragen, Hilfegesuch und Übernahme werden protokolliert", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;

    await admin.post("/api/shifts", {
      name: "Spätdienst", date: heute(), startTime: "14:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    await admin.patch(`/api/shifts/${shiftId}`, {
      name: "Spätdienst (angepasst)", startTime: "15:00", endTime: "22:00", seats: 1, qualificationIds: [qualId],
    });

    const tomId = (
      await admin.post("/api/employees", { name: "Tom Klein", password: "geheim123" })
    ).data.id;
    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });

    const lea = await asLea();
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    // Tom bleibt aussen vor — nur so kann er die Schicht später übernehmen.
    const tom = c();
    await tom.login({ code: "111111", name: "Tom Klein", password: "geheim123" });

    await lea.post(`/api/shifts/${shiftId}/help`); // Hilfegesuch stellen …
    await lea.post(`/api/shifts/${shiftId}/help`); // … und wieder zurückziehen.
    await lea.post(`/api/shifts/${shiftId}/help`); // erneut stellen, für die Übernahme unten.

    const leaId = (await lea.get("/api/state")).data.userId;
    await tom.post(`/api/shifts/${shiftId}/takeover`, { replaceId: leaId });

    const { data: eintraege } = await admin.get(`/api/logbook?shiftId=${shiftId}`);
    const typen = eintraege.map((e) => e.type);
    expect(typen).toContain("updated");
    expect(typen).toContain("help_requested");
    expect(typen).toContain("help_withdrawn");
    expect(typen).toContain("reassigned");
    expect(typen).toContain("unassigned"); // Lea wurde durch die Übernahme ersetzt.
  });

  test("Kontolöschung protokolliert das Austragen aus besetzten Schichten", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Nachtdienst", date: heute(), startTime: "22:00", endTime: "06:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const leaId = (
      await admin.post("/api/employees", { name: "Nina Frei", password: "geheim123" })
    ).data.id;
    await admin.patch(`/api/accounts/${leaId}/qualifications`, { qualificationId: qualId, value: true });

    const nina = c();
    await nina.login({ code: "111111", name: "Nina Frei", password: "geheim123" });
    await nina.post(`/api/shifts/${shiftId}/enroll`);

    await admin.del(`/api/accounts/${leaId}`);

    const { data: eintraege } = await admin.get(`/api/logbook?shiftId=${shiftId}`);
    expect(eintraege.some((e) => e.type === "unassigned" && e.message.includes("Nina Frei"))).toBe(true);
  });

  test("Mitarbeitende fragen Einsicht für eine eigene vergangene Schicht an — erst nach Genehmigung sichtbar", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = await asLea();
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    backdate(shiftId, gestern());

    // Vor der Anfrage taucht die Schicht als anfragbar auf.
    const { data: eligible } = await lea.get("/api/logbook/eligible-shifts");
    expect(eligible.map((s) => s.id)).toContain(shiftId);

    const req = await lea.post("/api/logbook/requests", { shiftId, note: "Wollte nur sichergehen." });
    expect(req.status).toBe(200);

    // Erneut anfragen geht nicht, solange eine offene Anfrage besteht.
    expect((await lea.post("/api/logbook/requests", { shiftId })).status).toBe(409);

    const pending = (await admin.get("/api/state")).data.company.logbookAccessRequests;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ accountName: "Lea Brunner", status: "pending", shiftId });

    // Vor der Genehmigung bleibt der Zugriff verwehrt.
    expect((await lea.get(`/api/logbook?shiftId=${shiftId}`)).status).toBe(403);

    const approve = await admin.post(`/api/logbook/requests/${pending[0].id}/approve`);
    expect(approve.status).toBe(200);

    const nachGenehmigung = await lea.get(`/api/logbook?shiftId=${shiftId}`);
    expect(nachGenehmigung.status).toBe(200);
    expect(nachGenehmigung.data.length).toBeGreaterThan(0);

    // Für eine fremde Schicht kommt niemand an eine Anfrage.
    const fremd = await lea.post("/api/logbook/requests", { shiftId: "shift-existiert-nicht" });
    expect(fremd.status).toBe(400);
  });

  test("Rollenwechsel, Qualifikation und Passwortänderung werden protokolliert", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    const tomId = (
      await admin.post("/api/employees", { name: "Tom Klein", password: "geheim123" })
    ).data.id;

    await admin.patch(`/api/accounts/${tomId}/qualifications`, { qualificationId: qualId, value: true });
    // Passwort ändern, bevor Tom Admin wird — sonst darf ein Admin nicht mehr
    // an sein Konto (siehe darfEingreifen in server/routes/company.js).
    await admin.post(`/api/accounts/${tomId}/password`, {
      password: "neuesPasswort1", currentPassword: ADMIN.password,
    });
    await admin.post(`/api/accounts/${tomId}/promote`);

    const { data: eintraege } = await admin.get("/api/logbook");
    const tomEintraege = eintraege.filter((e) => e.shiftLabel === "Tom Klein");

    const qualEintrag = tomEintraege.find((e) => e.type === "account_updated" && e.message.includes("Qualifikation"));
    expect(qualEintrag.message).toBe("Qualifikation „Erste Hilfe“ vergeben, durch Mara Vogt.");

    const rolleEintrag = tomEintraege.find((e) => e.type === "account_updated" && e.message.includes("Rolle"));
    expect(rolleEintrag.message).toBe("Rolle geändert von Mitarbeitende zu Administration, durch Mara Vogt.");

    const pwEintrag = tomEintraege.find((e) => e.type === "password_changed");
    expect(pwEintrag.message).toBe("Passwort geändert durch Mara Vogt.");
    // Nie das Passwort selbst — weder im Eintrag noch sonst irgendwo in der Antwort.
    expect(JSON.stringify(eintraege)).not.toContain("neuesPasswort1");
  });

  test("eine eigene Passwortänderung ist als solche erkennbar, ohne das Passwort zu zeigen", async () => {
    const lea = await asLea();
    const leaId = (await lea.get("/api/state")).data.userId;
    await lea.post(`/api/accounts/${leaId}/password`, {
      password: "eigenesNeu1", currentPassword: EMPLOYEE.password,
    });

    const admin = await asAdmin();
    const { data: eintraege } = await admin.get("/api/logbook");
    const eintrag = eintraege.find((e) => e.type === "password_changed" && e.shiftLabel === "Lea Brunner");
    expect(eintrag.message).toBe("Eigenes Passwort geändert.");
    expect(JSON.stringify(eintraege)).not.toContain("eigenesNeu1");
  });

  test("eine abgelehnte Anfrage bleibt ohne Zugriff", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = await asLea();
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    backdate(shiftId, gestern());

    await lea.post("/api/logbook/requests", { shiftId });
    const pending = (await admin.get("/api/state")).data.company.logbookAccessRequests[0];

    await admin.post(`/api/logbook/requests/${pending.id}/decline`);
    expect((await lea.get(`/api/logbook?shiftId=${shiftId}`)).status).toBe(403);

    const { data: state } = await lea.get("/api/state");
    expect(state.company.logbookAccessRequests[0].status).toBe("declined");
  });
  test("die Notiz einer fremden Anfrage steht in keinem fremden Zustand", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = await asLea();
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    backdate(shiftId, gestern());
    await lea.post("/api/logbook/requests", { shiftId, note: "Vertraulicher Grund." });

    // Ein zweites Mitarbeitendenkonto sieht die Anfrage samt Notiz nicht.
    await admin.post("/api/employees", { name: "Tom Klein", password: "tomsPasswort1" });
    const tom = c();
    await tom.login({ code: ADMIN.code, name: "Tom Klein", password: "tomsPasswort1" });

    const { data: tomState } = await tom.get("/api/state");
    expect(tomState.company.logbookAccessRequests).toHaveLength(0);
    expect(JSON.stringify(tomState)).not.toContain("Vertraulicher Grund.");

    // Die eigene sieht Lea weiterhin, die Administration ohnehin.
    expect((await lea.get("/api/state")).data.company.logbookAccessRequests).toHaveLength(1);
    expect((await admin.get("/api/state")).data.company.logbookAccessRequests[0].note)
      .toBe("Vertraulicher Grund.");
  });
  test("eine gelöschte Schicht hinterlässt einen Eintrag, der sie überlebt", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Frühdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    expect((await admin.del(`/api/shifts/${shiftId}`)).status).toBe(200);
    expect((await admin.get("/api/state")).data.company.shifts).toHaveLength(0);

    const eintrag = (await admin.get("/api/logbook")).data.find((e) => e.type === "deleted");
    expect(eintrag.message).toBe("Schicht gelöscht von Mara Vogt.");
    // Die Schicht gibt es nicht mehr, ihre Beschriftung schon.
    expect(eintrag.shiftLabel).toContain("Frühdienst");
    expect(eintrag.shiftId).toBe(null);
  });

  /* Vergangene Schichten lassen sich nicht mehr ändern — löschen kann die
     Administration sie aber sehr wohl, und genau dann muss es nachlesbar sein. */
  test("auch das Löschen einer vergangenen Schicht steht im Logbuch", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Altdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;
    backdate(shiftId, gestern());

    expect((await admin.del(`/api/shifts/${shiftId}`)).status).toBe(200);
    const eintraege = (await admin.get("/api/logbook")).data.filter((e) => e.type === "deleted");
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0].shiftLabel).toContain("Altdienst");
  });

  test("beim Löschen einer Serie bekommt jeder Termin seinen Eintrag", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    await admin.post("/api/shifts", {
      name: "Tagesdienst", date: heute(), startTime: "06:00", endTime: "12:00",
      repeat: "daily", seats: 1, qualificationIds: [qualId],
    });
    const shifts = (await admin.get("/api/state")).data.company.shifts;
    expect(shifts.length).toBeGreaterThan(2);

    const res = await admin.del(`/api/shifts/${shifts[0].id}/series`);
    expect(res.data.deleted).toBe(shifts.length);

    const eintraege = (await admin.get("/api/logbook")).data.filter((e) => e.type === "deleted");
    expect(eintraege).toHaveLength(shifts.length);
  });

  test("auch von der Warteliste genommen zu werden steht im Logbuch", async () => {
    const admin = await asAdmin();
    const qualId = (await admin.get("/api/state")).data.company.qualifications[0].id;
    /* Weit genug voraus (70 Tage sind immer mehr als zwei Monatsgrenzen): Dort
       ist die Auslosung noch nicht gelaufen, die Einschreibung bleibt also eine
       Einschreibung ohne Zuteilung. */
    const spaeter = toISO(addDays(startOfToday(), 70));
    await admin.post("/api/shifts", {
      name: "Spätdienst", date: spaeter, startTime: "16:00", endTime: "22:00",
      repeat: "once", seats: 1, qualificationIds: [qualId],
    });
    const shiftId = (await admin.get("/api/state")).data.company.shifts[0].id;

    const lea = await asLea();
    await lea.post(`/api/shifts/${shiftId}/enroll`);
    const shift = (await admin.get("/api/state")).data.company.shifts[0];
    expect(shift.enrolled).toHaveLength(1);
    expect(shift.assigned).toHaveLength(0);

    const leaId = (await admin.get("/api/state")).data.company.accounts
      .find((a) => a.name === "Lea Brunner").id;
    expect((await admin.del(`/api/shifts/${shiftId}/enrollments/${leaId}`)).status).toBe(200);

    const eintrag = (await admin.get("/api/logbook")).data.find((e) => e.type === "unassigned");
    expect(eintrag.message).toBe("Lea Brunner wurde von Mara Vogt aus der Warteliste genommen.");
  });
});

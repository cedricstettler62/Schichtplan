/* Startet die echte Express-App gegen eine frische Datenbank in einem
   Wegwerf-Verzeichnis. Jeder Test bekommt seinen eigenen Server. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createApp } from "../../server/app.js";
import { loadConfig } from "../../server/config.js";
import { DbHandle, seedDemo } from "../../server/db.js";

export const ADMIN = { code: "111111", name: "Mara Vogt", password: "12345" };
export const EMPLOYEE = { code: "111111", name: "Lea Brunner", password: "12345" };
export const SUPER = { code: "000000", name: "Kira X", password: "123456" };

export async function startTestServer({ seed = true, env = {} } = {}) {
  // Echte Datei statt :memory: — nur so lassen sich Export und Import prüfen.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schichtboard-test-"));
  const dbPath = path.join(dir, "data", "schichtplan.db");

  const config = loadConfig({ SB_SESSION_SECRET: "test-schluessel", SB_DB: dbPath, ...env });
  const db = new DbHandle(dbPath);
  if (seed) seedDemo(db);

  const server = await new Promise((resolve) => {
    const s = createApp(db, config).listen(0, "127.0.0.1", () => resolve(s));
  });

  return {
    db,
    dir,
    dbPath,
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Merkt sich gesetzte Cookies — sonst wäre nach dem Login gleich wieder Schluss. */
export function createCookieJar() {
  const jar = new Map();
  return {
    header() {
      return jar.size ? [...jar].map(([k, v]) => `${k}=${v}`).join("; ") : null;
    },
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const i = pair.indexOf("=");
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1);
        if (value === "") jar.delete(name);
        else jar.set(name, value);
      }
    },
  };
}

export function createClient(baseUrl) {
  const jar = createCookieJar();

  const roh = async (method, path, { body, contentType } = {}) => {
    const headers = {};
    if (contentType) headers["Content-Type"] = contentType;
    const cookie = jar.header();
    if (cookie) headers.Cookie = cookie;

    const res = await fetch(baseUrl + path, { method, headers, body });
    jar.absorb(res);
    return res;
  };

  const call = async (method, path, body) => {
    const res = await roh(method, path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      contentType: body === undefined ? undefined : "application/json",
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };

  return {
    get: (path) => call("GET", path),
    post: (path, body = {}) => call("POST", path, body),
    patch: (path, body = {}) => call("PATCH", path, body),
    del: (path) => call("DELETE", path),
    login: (who) => call("POST", "/api/login", who),
    /** Antwort im Rohzustand — für Dateien statt JSON. */
    raw: roh,
  };
}

/**
 * Leitet relative fetch-Aufrufe der App auf den Testserver um und führt dabei
 * einen Cookie-Behälter mit — jsdom hat von sich aus keinen.
 */
export function installFetchBridge(baseUrl) {
  const realFetch = globalThis.fetch;
  const jar = createCookieJar();

  globalThis.fetch = async (input, init = {}) => {
    const path = typeof input === "string" ? input : input.url;
    const headers = new Headers(init.headers || {});
    const cookie = jar.header();
    if (cookie) headers.set("Cookie", cookie);

    const res = await realFetch(baseUrl + path, { ...init, headers });
    jar.absorb(res);
    return res;
  };

  return () => {
    globalThis.fetch = realFetch;
  };
}

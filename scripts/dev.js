/* Startet API-Server und Vite-Entwicklungsserver zusammen.
   Vite reicht /api an den Server auf Port 3000 weiter (siehe vite.config.js). */

import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["--env-file-if-exists=.env", "server/index.js"], {
    stdio: "inherit",
    env: { ...process.env, SB_SEED_DEMO: process.env.SB_SEED_DEMO ?? "1" },
  }),
  spawn("npx", ["vite"], { stdio: "inherit", shell: process.platform === "win32" }),
];

const stopAll = () => children.forEach((c) => c.kill("SIGTERM"));
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
children.forEach((c) => c.on("exit", stopAll));

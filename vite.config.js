import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // API-Aufrufe gehen an den Express-Server auf Port 3000.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    // Standard ist Node — die Oberflächentests schalten per Docblock auf jsdom.
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
  },
});

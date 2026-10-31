import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "@aqualamp/core": path.resolve(rootDir, "../../packages/controller/src/core.ts"),
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [react()],
  root: resolve("src/renderer"),
  base: "./",
  publicDir: resolve("assets/public"),
  build: {
    outDir: resolve("build/renderer"),
    emptyOutDir: true,
    target: "chrome109",
    rollupOptions: {
      input: {
        host: resolve("src/renderer/host.html"),
        controller: resolve("src/renderer/controller.html"),
      },
    },
  },
});

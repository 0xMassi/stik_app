import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  build: {
    manifest: true,
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.STIK_DEV_PORT || 1420),
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "jsdom",
    // .tsx as well as .ts — component tests were silently excluded by the
    // narrower pattern and never ran.
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});

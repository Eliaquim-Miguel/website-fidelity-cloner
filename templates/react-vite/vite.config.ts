import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 4330 },
  build: { outDir: "dist", assetsDir: "_assets" }
});

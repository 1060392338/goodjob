import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/xlsx/")) return "vendor-xlsx";
          if (id.includes("/node_modules/echarts/")) return "vendor-echarts";
          if (id.includes("/node_modules/zrender/")) return "vendor-zrender";
          return undefined;
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": process.env.VITE_API_TARGET || "http://127.0.0.1:4188"
    }
  }
});

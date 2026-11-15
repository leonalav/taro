import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { reviewBrowserPlugin } from './scripts/review-vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const blockedWorkspaceAssets = {
  name: "blocked-workspace-assets",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use((request, response, next) => {
      const pathname = (request.url ?? "").split("?", 1)[0];
      let decoded = pathname;
      try { decoded = decodeURIComponent(pathname); } catch { /* Vite handles invalid URLs. */ }
      const parts = decoded.split(/[\\/]/).map(part => part.toLowerCase().replace(/[. ]+$/, ""));
      if (parts.includes("taro-adi-library") || parts.some((part, i) => part === "src-tauri" && parts[i + 1] === "target")) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      next();
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [blockedWorkspaceAssets, react(), tailwindcss(), viteSingleFile(), reviewBrowserPlugin()],
  // Reference checkouts are research material, not additional application entries.
  optimizeDeps: { entries: ["index.html"] },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/[tT][aA][rR][oO]-[aA][dD][iI]-[lL][iI][bB][rR][aA][rR][yY]/{,**}"],
    },
    // Hosted previews serve the app from a proxied *.e2b.app origin.
    allowedHosts: [".e2b.app"],
    watch: { ignored: ["**/refs/**", "**/src-tauri/target/**"] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

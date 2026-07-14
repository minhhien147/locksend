import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
  const isCloudflarePage = !!process.env.CF_PAGES;

  if (
    mode === "production" &&
    (isRailway || isCloudflarePage) &&
    !process.env.VITE_API_URL?.trim()
  ) {
    throw new Error(
      "VITE_API_URL is required for production builds (Railway / Cloudflare Pages). " +
        "Set it in Dashboard → Settings → Environment Variables."
    );
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            crypto: ["@noble/curves"],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  };
});

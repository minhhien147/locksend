import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  if (
    mode === "production" &&
    process.env.RAILWAY_ENVIRONMENT &&
    !process.env.VITE_API_URL?.trim()
  ) {
    throw new Error(
      "VITE_API_URL is required on Railway (URL backend public, không có dấu / cuối)."
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
  };
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/auth": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/students": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass: (req) => req.headers.accept?.includes("text/html") ? "/index.html" : undefined,
      },
      "/attendance": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass: (req) => req.headers.accept?.includes("text/html") ? "/index.html" : undefined,
      },
      "/notifications": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass: (req) => req.headers.accept?.includes("text/html") ? "/index.html" : undefined,
      },
      "/admin": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass: (req) => req.headers.accept?.includes("text/html") ? "/index.html" : undefined,
      },
      "/settings": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass: (req) => req.headers.accept?.includes("text/html") ? "/index.html" : undefined,
      },
      "/health": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

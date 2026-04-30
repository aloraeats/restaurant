import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
    plugins: [react()],

    // In development: base is "/"
    // In production (GitHub Pages): base is "/restaurant/"
    // TODO: Change "/restaurant/" to your actual repo name
   // base: mode === "production" ? "/restaurant/" : "/",
   // base: mode === "production" ? "/" : "/",
    base: "/",
    server: {
        port: 5173,
        host: true,
    },

    build: {
        chunkSizeWarningLimit: 500,
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ["react", "react-dom", "react-router-dom"],
                    supabase: ["@supabase/supabase-js"],
                },
            },
        },
    },
}));

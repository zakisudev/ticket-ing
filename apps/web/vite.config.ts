import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev convenience only: production serves the SPA and API from one origin.
      '/api': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
    },
  },
  build: {
    sourcemap: false,
  },
});

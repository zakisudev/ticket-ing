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
    rollupOptions: {
      output: {
        // Markdown rendering is only needed on the ticket detail page; keep it
        // out of the initial bundle so first paint stays lean.
        manualChunks(id) {
          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('micromark') ||
            id.includes('mdast') ||
            id.includes('hast') ||
            id.includes('unified') ||
            id.includes('vfile') ||
            id.includes('decode-named-character-reference') ||
            id.includes('character-entities') ||
            id.includes('property-information') ||
            id.includes('space-separated-tokens') ||
            id.includes('comma-separated-tokens')
          ) {
            return 'markdown';
          }
        },
      },
    },
  },
});

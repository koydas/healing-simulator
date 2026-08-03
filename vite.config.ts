import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Root-relative asset paths, so `index.html` always points at `/assets/...`
  // whatever URL served it. Relative paths (`./assets/...`) break the SPA
  // fallback: a page served for `/some/route` resolves them to
  // `/some/assets/...`, the catch-all answers with `index.html`, and the
  // browser refuses the HTML as a module script. Serving under a prefix that
  // the Ingress does not strip needs `vite build --base=/sim/`.
  // See docs/deployment.md and docs/adr/0011-root-relative-asset-base.md.
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    // The engine is pure: tests need no DOM.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

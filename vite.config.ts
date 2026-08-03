import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths. They work at the domain root and behind an Ingress
  // that strips its prefix before forwarding (the common `rewrite-target: /`
  // setup). An Ingress that forwards `/sim/` intact would make the browser
  // request `/sim/assets/...`, which the container does not serve — build with
  // `vite build --base=/sim/` for that case. See docs/deployment.md.
  base: './',
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

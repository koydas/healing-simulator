import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Relative paths: the app works both at the domain root and under an
  // Ingress sub-path.
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

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : l'application fonctionne à la racine du domaine comme
  // dans un sous-chemin d'Ingress.
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
    // Le moteur est pur : aucun DOM n'est nécessaire pour les tests.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

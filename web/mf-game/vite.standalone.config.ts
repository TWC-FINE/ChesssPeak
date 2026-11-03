import { defineConfig } from 'vite';

// Development page with a simulated context; it must work on its own.
export default defineConfig({
  base: './',
  build: { outDir: '../dist/standalone/mf-game', emptyOutDir: true },
});

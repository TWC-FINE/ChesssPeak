import { defaultClientConditions, defineConfig } from 'vite';

// Development page with a simulated context; it must work on its own.
export default defineConfig({
  resolve: { conditions: ['source', ...defaultClientConditions] },
  base: './',
  build: { outDir: '../dist/standalone/mf-history', emptyOutDir: true },
});

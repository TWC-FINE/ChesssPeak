import { defineConfig } from 'vite';

// One self-contained bundle: dist/mf/mf-history.js registers <mf-history> (Lit, light DOM; CSS and pieces inlined).
export default defineConfig({
  build: {
    outDir: '../dist/mf',
    emptyOutDir: false,
    lib: { entry: 'src/mf-history.ts', formats: ['es'], fileName: () => 'mf-history.js' },
    cssCodeSplit: false,
  },
});

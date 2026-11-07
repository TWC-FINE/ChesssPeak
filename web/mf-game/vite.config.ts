import { defaultClientConditions, defineConfig } from 'vite';

// One self-contained bundle: dist/mf/mf-game.js registers <mf-game> (Lit, light DOM; CSS and pieces inlined).
export default defineConfig({
  // read @chessspeak/shared from source (see shared/package.json exports and ADR 1)
  resolve: { conditions: ['source', ...defaultClientConditions] },
  build: {
    outDir: '../dist/mf',
    emptyOutDir: false,
    lib: { entry: 'src/mf-game.ts', formats: ['es'], fileName: () => 'mf-game.js' },
    cssCodeSplit: false,
  },
});

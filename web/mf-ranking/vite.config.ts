import { defaultClientConditions, defineConfig } from 'vite';

// One self-contained bundle: dist/mf/mf-ranking.js registers <mf-ranking> (Lit, light DOM; CSS inlined).
export default defineConfig({
  // read @chessspeak/shared from source (see shared/package.json exports and ADR 1)
  resolve: { conditions: ['source', ...defaultClientConditions] },
  build: {
    outDir: '../dist/mf',
    emptyOutDir: false,
    lib: { entry: 'src/mf-ranking.ts', formats: ['es'], fileName: () => 'mf-ranking.js' },
    cssCodeSplit: false,
  },
});

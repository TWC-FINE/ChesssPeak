import { defineConfig } from 'vite';

// One self-contained bundle: dist/mf/mf-game.js registers <mf-game> (Lit, light DOM; CSS and pieces inlined).
export default defineConfig({
  build: {
    outDir: '../dist/mf',
    emptyOutDir: false,
    lib: { entry: 'src/mf-game.ts', formats: ['es'], fileName: () => 'mf-game.js' },
    cssCodeSplit: false,
  },
});

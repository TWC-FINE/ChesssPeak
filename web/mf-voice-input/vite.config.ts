import { defineConfig } from 'vite';

// One self-contained bundle: dist/mf/mf-voice-input.js registers <mf-voice-input> (Lit, light DOM; CSS and pieces inlined).
export default defineConfig({
  build: {
    outDir: '../dist/mf',
    emptyOutDir: false,
    lib: { entry: 'src/mf-voice-input.ts', formats: ['es'], fileName: () => 'mf-voice-input.js' },
    cssCodeSplit: false,
  },
});

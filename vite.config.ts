import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // Three.js alone is ~600 kB minified; one chunk is fine for a game that needs it all up front.
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});

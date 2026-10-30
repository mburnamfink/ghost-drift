import { defineConfig } from 'vitest/config';

/** Runs the showcase search on its own; `npm test` never picks it up. */
export default defineConfig({
  test: { include: ['scripts/showcase-search.ts'], silent: false },
});

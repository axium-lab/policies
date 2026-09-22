import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Los tests importan el especificador publicado pero ejercitan el working tree,
  // no un dist/ rancio. Espeja `paths` en tsconfig.json.
  resolve: {
    alias: {
      '@axium-lab/policies': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

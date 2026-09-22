import { defineConfig } from 'tsup';

/** One entry per subpath declared in `package.json#exports`. */
const entry = ['src/index.ts'];

export default defineConfig([
  {
    entry,
    format: ['esm'],
    outDir: 'dist/esm',
    dts: true,
    target: 'es2022',
    splitting: false,
    clean: true,
    sourcemap: true,
  },
  {
    entry,
    format: ['cjs'],
    outDir: 'dist/cjs',
    // Types are emitted once, by the ESM build; both `exports` conditions point at
    // the same `.d.ts`.
    dts: false,
    target: 'es2022',
    splitting: false,
    clean: false,
    sourcemap: true,
  },
]);

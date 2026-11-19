import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * The source uses NodeNext-style `./foo.js` specifiers, which is what Node
 * needs at runtime but not something Vite resolves on its own. This maps them
 * back to the TypeScript files when the tests import them.
 */
const resolveJsToTs: Plugin = {
  name: 'resolve-js-to-ts',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null;
    const candidate = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'));
    return fs.existsSync(candidate) ? candidate : null;
  },
};

export default defineConfig({
  plugins: [resolveJsToTs],
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // One database, one worker: the suites share a MongoDB instance and reset
    // collections between files, so running them in parallel would cross wires.
    fileParallelism: false,
    // Share one module graph across files. Mongoose registers each model on a
    // process-wide singleton, so re-evaluating the model modules per file would
    // raise "Cannot overwrite model once compiled". Each suite still resets the
    // collections it uses in beforeEach.
    isolate: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

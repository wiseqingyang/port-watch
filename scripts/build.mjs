import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';

await build({
  entryPoints: ['src/bin.ts'], bundle: true, platform: 'node', format: 'esm',
  target: 'node22', outfile: 'dist/cli.js', packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
});
await chmod('dist/cli.js', 0o755);

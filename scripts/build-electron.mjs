import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const watchMode = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: [
    path.join(rootDir, 'electron/main.ts'),
    path.join(rootDir, 'electron/preload.ts'),
    path.join(rootDir, 'electron/worker.ts')
  ],
  outdir: path.join(rootDir, 'dist-electron'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  sourcemap: true,
  outExtension: { '.js': '.cjs' },
  logLevel: 'info'
};

if (watchMode) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[build-electron] watching electron/*.ts...');
} else {
  await esbuild.build(buildOptions);
}

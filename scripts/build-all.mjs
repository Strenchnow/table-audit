import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const viteBin = path.join(rootDir, 'node_modules/vite/bin/vite.js');
const electronBuildScript = path.join(rootDir, 'scripts/build-electron.mjs');

function runNodeScript(scriptPath, args, label) {
  console.log(`[build] Running ${label}...`);
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  if (res.status !== 0) {
    console.error(`[build] ${label} failed with exit code ${res.status}`);
    process.exit(res.status ?? 1);
  }
}

runNodeScript(viteBin, ['build'], 'vite build');
runNodeScript(electronBuildScript, [], 'electron esbuild');
console.log('[build] Completed successfully.');

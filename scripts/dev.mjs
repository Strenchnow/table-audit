import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const devUrl = 'http://localhost:5173';
const viteBin = path.join(rootDir, 'node_modules/vite/bin/vite.js');
const electronBuildScript = path.join(rootDir, 'scripts/build-electron.mjs');
const electronCli = path.join(rootDir, 'node_modules/electron/cli.js');

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(check, 250);
      });
    };
    check();
  });
}

const viteProc = spawn(process.execPath, [viteBin], {
  cwd: rootDir,
  stdio: 'inherit'
});

const electronWatchProc = spawn(
  process.execPath,
  [electronBuildScript, '--watch'],
  {
    cwd: rootDir,
    stdio: 'inherit'
  }
);

let electronProc = null;

function shutdown() {
  if (electronProc && !electronProc.killed) electronProc.kill();
  if (!electronWatchProc.killed) electronWatchProc.kill();
  if (!viteProc.killed) viteProc.kill();
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

try {
  await waitForServer(devUrl);
  electronProc = spawn(process.execPath, [electronCli, '.'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devUrl
    }
  });
  electronProc.on('exit', (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
} catch (err) {
  console.error('[dev] Startup error:', err);
  shutdown();
  process.exit(1);
}

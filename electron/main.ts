import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

let mainWindow: BrowserWindow | null = null;
let analysisWorker: Worker | null = null;
let nextRequestId = 1;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

const pendingRequests = new Map<number, PendingRequest>();

function ensureWorker(): Worker {
  if (analysisWorker) return analysisWorker;

  const workerPath = path.join(__dirname, 'worker.cjs');
  const worker = new Worker(workerPath);

  worker.on('message', (msg: {
    type: 'response' | 'progress';
    id?: number;
    ok?: boolean;
    result?: unknown;
    error?: string;
    stage?: string;
    percent?: number;
  }) => {
    if (msg.type === 'progress') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('worker:progress', {
          stage: msg.stage ?? '',
          percent: msg.percent ?? 0
        });
      }
      return;
    }

    if (msg.type === 'response' && msg.id !== undefined) {
      const pending = pendingRequests.get(msg.id);
      if (!pending) return;
      pendingRequests.delete(msg.id);
      if (msg.ok) {
        pending.resolve(msg.result);
      } else {
        pending.reject(new Error(msg.error ?? 'Ошибка обработки в фоновом потоке.'));
      }
    }
  });

  worker.on('error', (err) => {
    console.error('[worker] error:', err);
    for (const [, pending] of pendingRequests) {
      pending.reject(err);
    }
    pendingRequests.clear();
    analysisWorker = null;
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[worker] exited unexpectedly with code ${code}`);
    }
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error(`Фоновый процесс завершился с кодом ${code}.`));
    }
    pendingRequests.clear();
    analysisWorker = null;
  });

  analysisWorker = worker;
  return worker;
}

function callWorker<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const worker = ensureWorker();
  const id = nextRequestId++;
  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject
    });
    worker.postMessage({ id, action, payload });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openFile', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Открыть файл таблицы',
      properties: ['openFile'],
      filters: [
        { name: 'Табличные данные', extensions: ['csv', 'tsv', 'xlsx', 'xls', 'json'] },
        { name: 'Все файлы', extensions: ['*'] }
      ]
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, filePath: res.filePaths[0] };
  });

  ipcMain.handle(
    'dialog:saveFile',
    async (
      _event,
      options: {
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }
    ) => {
      const res = await dialog.showSaveDialog({
        title: 'Сохранить файл',
        defaultPath: options?.defaultPath,
        filters: options?.filters
      });
      if (res.canceled || !res.filePath) {
        return { canceled: true };
      }
      return { canceled: false, filePath: res.filePath };
    }
  );

  ipcMain.handle('dataset:loadFile', (_e, filePath: string, options) =>
    callWorker('loadFile', { filePath, options })
  );
  ipcMain.handle('dataset:loadBuffer', (_e, buffer, fileName: string, options) =>
    callWorker('loadBuffer', { buffer, fileName, options })
  );
  ipcMain.handle('dataset:reparse', (_e, options) =>
    callWorker('reparse', { options })
  );
  ipcMain.handle('dataset:loadDemo', () => callWorker('loadDemo'));
  ipcMain.handle('dataset:getRows', (_e, req) => callWorker('getRows', req));

  ipcMain.handle('reconcile:loadSecondFile', (_e, filePath: string, options) =>
    callWorker('loadSecondFile', { filePath, options })
  );
  ipcMain.handle('reconcile:loadSecondBuffer', (_e, buffer, fileName: string, options) =>
    callWorker('loadSecondBuffer', { buffer, fileName, options })
  );
  ipcMain.handle('reconcile:reparseSecond', (_e, options) =>
    callWorker('reparseSecond', { options })
  );
  ipcMain.handle('reconcile:run', (_e, req) => callWorker('reconcile', req));

  ipcMain.handle('ddl:generate', (_e, options) => callWorker('generateDdl', options));
  ipcMain.handle('clean:preview', (_e, options) => callWorker('previewClean', options));
  ipcMain.handle('export:cleaned', (_e, options, format, targetPath) =>
    callWorker('exportCleaned', { options, format, targetPath })
  );
  ipcMain.handle('export:report', (_e, format, dialect, targetPath) =>
    callWorker('exportReport', { format, dialect, targetPath })
  );
  ipcMain.handle('export:sql', (_e, options, targetPath) =>
    callWorker('exportSql', { options, targetPath })
  );
}

function createWindow(isSmokeTest: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: !isSmokeTest,
    title: 'TableAudit — Local Data Quality Profiler',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.setMenuBarVisibility(false);

  const consoleErrors: string[] = [];

  win.webContents.on('console-message', (details) => {
    if (details.level === 'error') {
      consoleErrors.push(details.message);
      console.error('[renderer console error]', details.message);
    }
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[renderer] did-fail-load (${errorCode}): ${errorDescription}`);
    if (isSmokeTest) app.exit(1);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process gone:', details.reason);
    if (isSmokeTest) app.exit(1);
  });

  if (isSmokeTest) {
    const timer = setTimeout(() => {
      console.error('[SMOKE] FAIL: Timeout waiting for smoke test');
      app.exit(1);
    }, 15000);

    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 350));
        const res = (await win.webContents.executeJavaScript(`
          (async () => {
            const root = document.getElementById('root');
            const rendered = Boolean(root && root.children.length > 0);
            const hasApi = typeof window.tableAudit === 'object' && typeof window.tableAudit.loadDemo === 'function';
            if (!rendered || !hasApi) {
              return { ok: false, rendered, hasApi };
            }
            const report = await window.tableAudit.loadDemo();
            const outliers = await window.tableAudit.getRows({ filter: 'outliers', offset: 0, limit: 20 });
            const ddl = await window.tableAudit.generateDdl({ dialect: 'postgresql' });
            const cleanPreview = await window.tableAudit.previewClean({
              removeDuplicates: true,
              trimWhitespace: true,
              normalizeDatesIso: true,
              normalizeDecimalSeparators: true
            });
            return {
              ok: Boolean(
                report &&
                report.rowCount === 1000 &&
                outliers.totalFiltered > 0 &&
                ddl.sql.includes('CREATE TABLE') &&
                cleanPreview.duplicatesRemoved > 0
              ),
              rendered,
              hasApi,
              rowCount: report?.rowCount,
              score: report?.score?.overall,
              outliers: outliers.totalFiltered,
              cleanedDups: cleanPreview.duplicatesRemoved
            };
          })()
        `)) as {
          ok: boolean;
          rendered: boolean;
          hasApi: boolean;
          rowCount?: number;
          score?: number;
          outliers?: number;
          cleanedDups?: number;
        };

        clearTimeout(timer);
        if (!res.ok || consoleErrors.length > 0) {
          console.error('[SMOKE] FAIL:', res, 'consoleErrors:', consoleErrors);
          app.exit(1);
          return;
        }
        console.log(
          `[SMOKE] OK: TableAudit rendered and verified live IPC (${res.rowCount} rows, DQ=${res.score}%, outliers=${res.outliers}, dups=${res.cleanedDups})`
        );
        app.exit(0);
      } catch (err) {
        clearTimeout(timer);
        console.error('[SMOKE] EXCEPTION:', err);
        app.exit(1);
      }
    });
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  const isSmokeTest = process.env.TABLEAUDIT_SMOKE_TEST === '1';
  ensureWorker();
  registerIpcHandlers();
  mainWindow = createWindow(isSmokeTest);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(false);
    }
  });
});

app.on('window-all-closed', () => {
  if (analysisWorker) {
    analysisWorker.terminate().catch(() => {});
    analysisWorker = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

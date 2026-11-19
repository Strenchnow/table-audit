import React, { useCallback, useEffect, useState } from 'react';
import type {
  ParseOptions,
  ProfileReport,
  RowFilterMode,
  WorkerProgressEvent
} from '../shared/types';
import { Sidebar, type NavTab } from './components/Sidebar';
import { ToastContainer, type ToastItem } from './components/ToastContainer';
import { TopBar } from './components/TopBar';
import { CleanExportView } from './views/CleanExportView';
import { DataGridView } from './views/DataGridView';
import { DdlView } from './views/DdlView';
import { OverviewView } from './views/OverviewView';
import { ProfilerView } from './views/ProfilerView';
import { ReconcileView } from './views/ReconcileView';
import { UploadView } from './views/UploadView';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('tableaudit-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [activeTab, setActiveTab] = useState<NavTab>('upload');
  const [report, setReport] = useState<ProfileReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<WorkerProgressEvent | null>(null);
  const [gridFilter, setGridFilter] = useState<RowFilterMode>('all');
  const [gridColumnIndex, setGridColumnIndex] = useState<number | undefined>(undefined);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('tableaudit-theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsub = window.tableAudit.onProgress((ev) => {
      setProgress(ev);
    });
    return unsub;
  }, []);

  const notify = useCallback(
    (type: ToastItem['type'], title: string, message?: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const applyReport = useCallback((nextReport: ProfileReport) => {
    setReport(nextReport);
    setGridFilter('all');
    setGridColumnIndex(undefined);
    setActiveTab('overview');
  }, []);

  const handleOpenFile = useCallback(
    async (options: ParseOptions = {}) => {
      try {
        const dialogRes = await window.tableAudit.openFileDialog();
        if (dialogRes.canceled || !dialogRes.filePath) return;
        setBusy(true);
        const rep = await window.tableAudit.loadFile(dialogRes.filePath, options);
        applyReport(rep);
        notify('success', 'Файл успешно проанализирован', `${rep.fileName} (${rep.rowCount} строк)`);
      } catch (err) {
        notify('error', 'Ошибка загрузки файла', err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [applyReport, notify]
  );

  const handleDropFile = useCallback(
    async (file: File, options: ParseOptions = {}) => {
      try {
        setBusy(true);
        const filePath = window.tableAudit.getPathForFile(file);
        const rep = filePath
          ? await window.tableAudit.loadFile(filePath, options)
          : await window.tableAudit.loadBuffer(await file.arrayBuffer(), file.name, options);
        applyReport(rep);
        notify('success', 'Файл успешно проанализирован', `${rep.fileName} (${rep.rowCount} строк)`);
      } catch (err) {
        notify('error', 'Ошибка разбора файла', err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [applyReport, notify]
  );

  const handleReparse = useCallback(
    async (options: ParseOptions) => {
      try {
        setBusy(true);
        const rep = await window.tableAudit.reparse(options);
        setReport(rep);
        notify('info', 'Параметры чтения обновлены', `Кодировка: ${rep.usedEncoding}`);
      } catch (err) {
        notify('error', 'Ошибка повторного разбора', err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [notify]
  );

  const handleLoadDemo = useCallback(async () => {
    try {
      setBusy(true);
      const rep = await window.tableAudit.loadDemo();
      applyReport(rep);
      notify(
        'success',
        'Демо-датасет загружен',
        `1 000 заказов с аномалиями качества (DQ Score: ${rep.score.overall}%)`
      );
    } catch (err) {
      notify('error', 'Ошибка загрузки демо-набора', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [applyReport, notify]);

  const handleJumpToGrid = useCallback(
    (filter: RowFilterMode, columnIndex?: number) => {
      setGridFilter(filter);
      setGridColumnIndex(columnIndex);
      setActiveTab('grid');
    },
    []
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        report={report}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {report && (
          <TopBar
            report={report}
            busy={busy}
            onReparse={handleReparse}
            onOpenFile={() => handleOpenFile()}
            onLoadDemo={handleLoadDemo}
          />
        )}

        {busy && progress && (
          <div className="h-8 shrink-0 border-b border-indigo-500/20 bg-indigo-500/10 px-5 flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-300">
            <span>{progress.stage}...</span>
            <span className="font-mono font-semibold">{progress.percent}%</span>
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'upload' && (
            <UploadView
              busy={busy}
              onOpenFileDialog={handleOpenFile}
              onDropFile={handleDropFile}
              onLoadDemo={handleLoadDemo}
            />
          )}

          {activeTab === 'overview' && report && (
            <OverviewView report={report} onJumpToGrid={handleJumpToGrid} />
          )}

          {activeTab === 'profiler' && report && (
            <ProfilerView report={report} onJumpToGrid={handleJumpToGrid} />
          )}

          {activeTab === 'grid' && report && (
            <DataGridView
              report={report}
              filter={gridFilter}
              columnIndex={gridColumnIndex}
              onFilterChange={(f, col) => {
                setGridFilter(f);
                setGridColumnIndex(col);
              }}
            />
          )}

          {activeTab === 'reconcile' && report && (
            <ReconcileView reportA={report} onNotify={notify} />
          )}

          {activeTab === 'ddl' && report && (
            <DdlView report={report} onNotify={notify} />
          )}

          {activeTab === 'clean' && report && (
            <CleanExportView report={report} onNotify={notify} />
          )}
        </main>
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

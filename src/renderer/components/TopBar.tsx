import React from 'react';
import { FileSpreadsheet, FolderOpen, Sparkles } from 'lucide-react';
import type {
  CsvDelimiter,
  ParseOptions,
  ProfileReport,
  SupportedEncoding
} from '../../shared/types';
import { formatBytes, formatNum } from '../utils/formatters';

interface TopBarProps {
  report: ProfileReport;
  busy: boolean;
  onReparse: (options: ParseOptions) => void;
  onOpenFile: () => void;
  onLoadDemo: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  report,
  busy,
  onReparse,
  onOpenFile,
  onLoadDemo
}) => {
  const isCsv = report.format === 'csv';
  const isJson = report.format === 'json';
  const isExcel = report.format === 'xlsx' || report.format === 'xls';
  const canReparse = report.format !== 'demo';

  return (
    <header className="h-14 shrink-0 border-b border-slate-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-950/90 backdrop-blur px-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <FileSpreadsheet className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">
          {report.fileName}
        </span>
        <span className="hidden sm:inline-flex items-center rounded-md bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-2 py-0.5 text-[11px] font-mono text-slate-600 dark:text-zinc-400">
          {report.format.toUpperCase()}
        </span>
        <span className="hidden md:inline text-xs text-slate-500 dark:text-zinc-400 font-mono whitespace-nowrap">
          {formatNum(report.rowCount)} × {report.columnCount} · {formatBytes(report.fileSizeBytes)}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {canReparse && (isCsv || isJson) && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
            <span className="hidden lg:inline">Кодировка:</span>
            <select
              disabled={busy}
              value={report.usedEncoding}
              onChange={(e) =>
                onReparse({
                  encoding: e.target.value as SupportedEncoding,
                  delimiter: report.usedDelimiter ?? 'auto'
                })
              }
              className="rounded-md border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2 py-1 text-xs font-mono text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="utf-8">UTF-8</option>
              <option value="windows-1251">Windows-1251</option>
              <option value="koi8-r">KOI8-R</option>
              <option value="utf-16le">UTF-16LE</option>
            </select>
          </label>
        )}

        {canReparse && isCsv && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
            <span className="hidden lg:inline">Разделитель:</span>
            <select
              disabled={busy}
              value={report.usedDelimiter ?? ','}
              onChange={(e) =>
                onReparse({
                  encoding: report.usedEncoding as SupportedEncoding,
                  delimiter: e.target.value as CsvDelimiter
                })
              }
              className="rounded-md border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2 py-1 text-xs font-mono text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value=",">, (запятая)</option>
              <option value=";">; (точка с запятой)</option>
              <option value="	">\t (табуляция)</option>
            </select>
          </label>
        )}

        {canReparse && isExcel && report.sheetNames && report.sheetNames.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
            <span className="hidden lg:inline">Лист:</span>
            <select
              disabled={busy}
              value={report.activeSheet ?? report.sheetNames[0]}
              onChange={(e) => onReparse({ sheetName: e.target.value })}
              className="rounded-md border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2 py-1 text-xs font-medium text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[160px]"
            >
              {report.sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={onLoadDemo}
          className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          title="Загрузить встроенный демо-датасет"
        >
          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
          <span>Демо</span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onOpenFile}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>Открыть файл</span>
        </button>
      </div>
    </header>
  );
};

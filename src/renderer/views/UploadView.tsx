import React, { useState } from 'react';
import {
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  ShieldCheck,
  Sparkles,
  UploadCloud
} from 'lucide-react';
import type { CsvDelimiter, ParseOptions, SupportedEncoding } from '../../shared/types';

interface UploadViewProps {
  busy: boolean;
  onOpenFileDialog: (options: ParseOptions) => void;
  onDropFile: (file: File, options: ParseOptions) => void;
  onLoadDemo: () => void;
}

export const UploadView: React.FC<UploadViewProps> = ({
  busy,
  onOpenFileDialog,
  onDropFile,
  onLoadDemo
}) => {
  const [dragging, setDragging] = useState(false);
  const [encoding, setEncoding] = useState<SupportedEncoding>('auto');
  const [delimiter, setDelimiter] = useState<CsvDelimiter>('auto');

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onDropFile(file, { encoding, delimiter });
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-300 mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            100% локально · Без серверов и утечек данных
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
            Аудит качества табличных данных
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-zinc-400">
            Загрузите CSV, Excel или JSON для мгновенного профилирования до 100 000 строк, поиска аномалий, сверки таблиц и генерации SQL-схемы.
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onLoadDemo}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-60 transition-all shrink-0"
        >
          <Sparkles className="h-4 w-4" />
          <span>Загрузить демо-датасет</span>
        </button>
      </div>

      {/* Drag and Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
          dragging
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.005]'
            : 'border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-indigo-400/70'
        }`}
      >
        <div className="mx-auto h-14 w-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 mb-4">
          <UploadCloud className="h-7 w-7" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
          Перетащите файл сюда или выберите на диске
        </h2>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-zinc-400">
          Автоопределение кодировки (UTF-8, Windows-1251) и разделителя (запятая, точка с запятой, табуляция)
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-mono text-slate-700 dark:text-zinc-300">
            <FileText className="h-3.5 w-3.5 text-sky-500" /> .csv / .tsv
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-mono text-slate-700 dark:text-zinc-300">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" /> .xlsx / .xls
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-mono text-slate-700 dark:text-zinc-300">
            <FileCode2 className="h-3.5 w-3.5 text-amber-500" /> .json
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenFileDialog({ encoding, delimiter })}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-zinc-100 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <FolderOpen className="h-4 w-4 text-indigo-500" />
            <span>Выбрать файл...</span>
          </button>

          <select
            value={encoding}
            onChange={(e) => setEncoding(e.target.value as SupportedEncoding)}
            className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-3 py-2.5 text-xs font-mono text-slate-700 dark:text-zinc-300"
          >
            <option value="auto">Кодировка: Авто</option>
            <option value="utf-8">UTF-8</option>
            <option value="windows-1251">Windows-1251</option>
            <option value="koi8-r">KOI8-R</option>
          </select>

          <select
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value as CsvDelimiter)}
            className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-3 py-2.5 text-xs font-mono text-slate-700 dark:text-zinc-300"
          >
            <option value="auto">Разделитель CSV: Авто</option>
            <option value=",">, (запятая)</option>
            <option value=";">; (точка с запятой)</option>
            <option value="	">\t (табуляция)</option>
          </select>
        </div>
      </div>

      {/* Capabilities grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
            Профилирование & IQR
          </div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
            Автоопределение 9 семантических типов, поиск смешанных форматов дат, битых email, разных форматов телефонов, лишних пробелов и выбросов по IQR.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
            Сверка таблиц (A vs B)
          </div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
            Сопоставление выгрузок по ключевому полю с разбивкой на строки только в A, только в B и наглядным diff «было → стало».
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">
            SQL DDL & Очистка
          </div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
            Генерация CREATE TABLE для PostgreSQL и SQLite с предупреждениями, безопасная очистка дубликатов/пробелов/дат и экспорт в HTML/MD/CSV/XLSX.
          </p>
        </div>
      </div>
    </div>
  );
};

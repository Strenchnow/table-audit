import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Download } from 'lucide-react';
import type { DdlDialect, DdlResult, ProfileReport } from '../../shared/types';

interface DdlViewProps {
  report: ProfileReport;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const DdlView: React.FC<DdlViewProps> = ({ report, onNotify }) => {
  const [dialect, setDialect] = useState<DdlDialect>('postgresql');
  const [tableName, setTableName] = useState<string>('');
  const [ddl, setDdl] = useState<DdlResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTableName('');
  }, [report.fileName]);

  useEffect(() => {
    let active = true;
    window.tableAudit
      .generateDdl({
        dialect,
        tableName: tableName.trim() || undefined
      })
      .then((res) => {
        if (active) setDdl(res);
      })
      .catch((err) => {
        onNotify('error', 'Ошибка генерации DDL', err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [report, dialect, tableName, onNotify]);

  const handleCopy = async () => {
    if (!ddl) return;
    await navigator.clipboard.writeText(ddl.sql);
    setCopied(true);
    onNotify('success', 'SQL скопирован в буфер обмена');
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSave = async () => {
    if (!ddl) return;
    const res = await window.tableAudit.saveFileDialog({
      defaultPath: `${ddl.tableName}_${dialect}.sql`,
      filters: [{ name: 'SQL Script', extensions: ['sql'] }]
    });
    if (res.canceled || !res.filePath) return;
    await window.tableAudit.exportSql(
      { dialect, tableName: ddl.tableName },
      res.filePath
    );
    onNotify('success', 'SQL-файл сохранен', res.filePath);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
            Генератор SQL-схемы (DDL)
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Автоматический подбор типов, NOT NULL, кандидатов PRIMARY KEY / UNIQUE и диагностика рисков загрузки
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1">
            {(['postgresql', 'sqlite'] as DdlDialect[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDialect(d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  dialect === d
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                }`}
              >
                {d === 'postgresql' ? 'PostgreSQL' : 'SQLite'}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder={ddl?.tableName ?? 'Имя таблицы...'}
            className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-zinc-200 w-44"
          />

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copied ? 'Скопировано' : 'Копировать SQL'}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Сохранить .sql</span>
          </button>
        </div>
      </div>

      {/* Warnings Banner */}
      {ddl && ddl.warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <span>Предупреждения схемы ({ddl.warnings.length})</span>
          </div>
          <ul className="space-y-1 pl-6 list-disc text-xs text-amber-800 dark:text-amber-200/90">
            {ddl.warnings.map((w, idx) => (
              <li key={idx}>{w.replace(/^WARNING:\s*/i, '')}</li>
            ))}
          </ul>
        </div>
      )}

      {/* SQL Viewer */}
      {ddl && (
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-zinc-950 text-zinc-100 overflow-hidden shadow-lg">
          <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>{ddl.tableName}.sql</span>
            <span>{ddl.columns.length} столбцов</span>
          </div>
          <div className="p-4 overflow-x-auto font-mono text-[13px] leading-relaxed">
            {ddl.sql.split('\n').map((line, i) => {
              const isWarning = line.includes('-- WARNING:');
              const isComment = line.trim().startsWith('--');
              return (
                <div
                  key={i}
                  className={`flex gap-4 px-2 rounded ${
                    isWarning
                      ? 'bg-amber-500/15 text-amber-300'
                      : isComment
                        ? 'text-zinc-500'
                        : 'text-zinc-100'
                  }`}
                >
                  <span className="w-7 text-right select-none text-zinc-600 shrink-0">
                    {i + 1}
                  </span>
                  <span className="whitespace-pre">{line}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

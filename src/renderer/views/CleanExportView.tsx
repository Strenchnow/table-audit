import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Sparkles
} from 'lucide-react';
import type {
  CleaningOptions,
  CleaningPreview,
  DdlDialect,
  ProfileReport
} from '../../shared/types';
import { formatNum } from '../utils/formatters';

interface CleanExportViewProps {
  report: ProfileReport;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const CleanExportView: React.FC<CleanExportViewProps> = ({
  report,
  onNotify
}) => {
  const [options, setOptions] = useState<CleaningOptions>({
    removeDuplicates: true,
    trimWhitespace: true,
    normalizeDatesIso: true,
    normalizeDecimalSeparators: false
  });
  const [preview, setPreview] = useState<CleaningPreview | null>(null);
  const [reportDialect, setReportDialect] = useState<DdlDialect>('postgresql');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    window.tableAudit
      .previewClean(options)
      .then((res) => {
        if (active) setPreview(res);
      })
      .catch((err) => {
        onNotify('error', 'Ошибка предпросмотра очистки', err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [report, options, onNotify]);

  const baseName = report.fileName.replace(/\.[a-z0-9]+$/i, '');

  const handleExportCleaned = async (format: 'csv' | 'xlsx') => {
    try {
      const saveRes = await window.tableAudit.saveFileDialog({
        defaultPath: `${baseName}_cleaned.${format}`,
        filters: [
          format === 'csv'
            ? { name: 'CSV (UTF-8)', extensions: ['csv'] }
            : { name: 'Excel Workbook', extensions: ['xlsx'] }
        ]
      });
      if (saveRes.canceled || !saveRes.filePath) return;
      setBusy(true);
      const out = await window.tableAudit.exportCleaned(options, format, saveRes.filePath);
      onNotify(
        'success',
        `Очищенный ${format.toUpperCase()} сохранен`,
        `Записано строк: ${formatNum(out.rowsWritten)}`
      );
    } catch (err) {
      onNotify('error', 'Ошибка экспорта файла', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExportReport = async (format: 'html' | 'md') => {
    try {
      const saveRes = await window.tableAudit.saveFileDialog({
        defaultPath: `${baseName}_audit_report.${format}`,
        filters: [
          format === 'html'
            ? { name: 'Автономный HTML-отчет', extensions: ['html'] }
            : { name: 'Markdown-отчет', extensions: ['md'] }
        ]
      });
      if (saveRes.canceled || !saveRes.filePath) return;
      setBusy(true);
      await window.tableAudit.exportReport(format, reportDialect, saveRes.filePath);
      onNotify('success', `Отчет (${format.toUpperCase()}) сохранен`, saveRes.filePath);
    } catch (err) {
      onNotify('error', 'Ошибка сохранения отчета', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
          Безопасная очистка и экспорт отчетов
        </h1>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Все преобразования выполняются без изменения исходного файла на диске
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Safe Cleaning */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
              Правила безопасной очистки
            </h2>
          </div>

          <div className="space-y-2.5 text-xs">
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900">
              <input
                type="checkbox"
                checked={options.removeDuplicates}
                onChange={(e) =>
                  setOptions({ ...options, removeDuplicates: e.target.checked })
                }
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <div className="font-medium text-slate-900 dark:text-zinc-100">
                  Удалить полные дубликаты строк
                </div>
                <div className="text-slate-500 dark:text-zinc-400">
                  Оставляет первое вхождение каждой уникальной строки
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900">
              <input
                type="checkbox"
                checked={options.trimWhitespace}
                onChange={(e) =>
                  setOptions({ ...options, trimWhitespace: e.target.checked })
                }
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <div className="font-medium text-slate-900 dark:text-zinc-100">
                  Обрезать лишние пробелы и невидимые символы
                </div>
                <div className="text-slate-500 dark:text-zinc-400">
                  Удаляет пробелы по краям, zero-width символы и заменяет NBSP на обычный пробел
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900">
              <input
                type="checkbox"
                checked={options.normalizeDatesIso}
                onChange={(e) =>
                  setOptions({ ...options, normalizeDatesIso: e.target.checked })
                }
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <div className="font-medium text-slate-900 dark:text-zinc-100">
                  Привести даты к формату ISO 8601 (YYYY-MM-DD)
                </div>
                <div className="text-slate-500 dark:text-zinc-400">
                  Унифицирует DD.MM.YYYY, DD/MM/YYYY и другие распознанные даты в стандартный формат БД
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900">
              <input
                type="checkbox"
                checked={options.normalizeDecimalSeparators}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    normalizeDecimalSeparators: e.target.checked
                  })
                }
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <div className="font-medium text-slate-900 dark:text-zinc-100">
                  Унифицировать десятичные разделители (, → .)
                </div>
                <div className="text-slate-500 dark:text-zinc-400">
                  Приводит числа с запятой (например, 1250,50) к стандартной точке в столбцах float
                </div>
              </div>
            </label>
          </div>

          {preview && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-2.5">
                  <div className="text-[11px] text-slate-500">Удалено дубликатов</div>
                  <div className="text-base font-bold font-mono text-amber-500">
                    {formatNum(preview.duplicatesRemoved)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-2.5">
                  <div className="text-[11px] text-slate-500">Изменено ячеек</div>
                  <div className="text-base font-bold font-mono text-indigo-500">
                    {formatNum(preview.totalCellsChanged)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-2.5">
                  <div className="text-[11px] text-slate-500">Итого строк</div>
                  <div className="text-base font-bold font-mono text-emerald-500">
                    {formatNum(preview.resultingRows)}
                  </div>
                </div>
              </div>

              {preview.samples.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 text-[11px] font-medium text-slate-500 border-b border-slate-200 dark:border-zinc-800">
                    Примеры изменений ячеек (первые {preview.samples.length})
                  </div>
                  <div className="max-h-44 overflow-auto divide-y divide-slate-100 dark:divide-zinc-800 text-xs font-mono">
                    {preview.samples.map((s, i) => (
                      <div key={i} className="px-3 py-1.5 flex items-center gap-2">
                        <span className="text-slate-400 shrink-0">#{s.rowIndex}</span>
                        <span className="text-slate-500 shrink-0">{s.columnName}:</span>
                        <span className="px-1 rounded bg-rose-500/10 text-rose-500 truncate max-w-[140px]">
                          {JSON.stringify(s.before)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="px-1 rounded bg-emerald-500/10 text-emerald-500 truncate max-w-[140px]">
                          {JSON.stringify(s.after)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleExportCleaned('csv')}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  <FileText className="h-4 w-4" />
                  <span>Экспорт очищенного CSV</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleExportCleaned('xlsx')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                  <span>Экспорт очищенного XLSX</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Audit Report Export */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                Экспорт отчета аудита
              </h2>
            </div>

            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
              Полный автономный отчет для команды разработки, заказчика или документации проекта:
            </p>

            <ul className="text-xs text-slate-600 dark:text-zinc-300 space-y-1.5 list-disc pl-5">
              <li>Data Quality Score ({report.score.overall}%) и 4 компонентные метрики</li>
              <li>Ключевые KPI, список критических проблем и примеров ошибок</li>
              <li>Детальный профиль всех {report.columnCount} столбцов</li>
              <li>Рекомендуемый SQL DDL с предупреждениями</li>
            </ul>

            <label className="block text-xs space-y-1.5 pt-1">
              <span className="text-slate-500 dark:text-zinc-400">
                Диалект SQL в отчете:
              </span>
              <select
                value={reportDialect}
                onChange={(e) => setReportDialect(e.target.value as DdlDialect)}
                className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-xs"
              >
                <option value="postgresql">PostgreSQL</option>
                <option value="sqlite">SQLite</option>
              </select>
            </label>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleExportReport('html')}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <FileCode className="h-4 w-4" />
              <span>Сохранить автономный HTML-отчет (.html)</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleExportReport('md')}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
            >
              <FileText className="h-4 w-4 text-indigo-500" />
              <span>Сохранить отчет в Markdown (.md)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

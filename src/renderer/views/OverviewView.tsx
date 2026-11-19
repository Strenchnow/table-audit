import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CopyCheck,
  FileWarning,
  HardDrive,
  Info,
  Rows3,
  Columns3
} from 'lucide-react';
import type { ProfileReport, RowFilterMode } from '../../shared/types';
import { DqGauge } from '../components/DqGauge';
import { formatBytes, formatNum } from '../utils/formatters';

interface OverviewViewProps {
  report: ProfileReport;
  onJumpToGrid: (filter: RowFilterMode, columnIndex?: number) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  report,
  onJumpToGrid
}) => {
  const { score } = report;

  const metricBars = [
    {
      label: 'Полнота (Completeness)',
      weight: '30%',
      value: score.completeness,
      hint: `Заполнено ${formatNum(score.details.totalCells - score.details.missingCells)} из ${formatNum(score.details.totalCells)} ячеек`
    },
    {
      label: 'Уникальность (Uniqueness)',
      weight: '25%',
      value: score.uniqueness,
      hint: `Лишних полных дубликатов: ${formatNum(score.details.duplicateExtraRows)} из ${formatNum(score.details.totalRows)} строк`
    },
    {
      label: 'Валидность форматов (Validity)',
      weight: '25%',
      value: score.validity,
      hint: `Невалидных или аномальных ячеек: ${formatNum(score.details.invalidCells)}`
    },
    {
      label: 'Согласованность (Consistency)',
      weight: '20%',
      value: score.consistency,
      hint: `Ячеек с разнобоем формата или пробелами: ${formatNum(score.details.inconsistentCells)}`
    }
  ];

  const kpis = [
    {
      label: 'Всего строк',
      value: formatNum(report.rowCount),
      icon: <Rows3 className="h-4 w-4 text-indigo-500" />
    },
    {
      label: 'Столбцов',
      value: formatNum(report.columnCount),
      icon: <Columns3 className="h-4 w-4 text-sky-500" />
    },
    {
      label: 'Пропусков',
      value: `${report.missingPercentTotal}%`,
      sub: `${formatNum(report.missingCellsTotal)} ячеек`,
      icon: <FileWarning className="h-4 w-4 text-amber-500" />
    },
    {
      label: 'Полные дубликаты',
      value: formatNum(report.duplicateExtraRows),
      sub: `${formatNum(report.duplicateGroupCount)} групп`,
      icon: <CopyCheck className="h-4 w-4 text-rose-500" />
    },
    {
      label: 'Всего аномалий',
      value: formatNum(report.totalAnomalies),
      icon: <AlertTriangle className="h-4 w-4 text-orange-500" />
    },
    {
      label: 'Размер файла',
      value: formatBytes(report.fileSizeBytes),
      sub: `${report.profileTimeMs} мс`,
      icon: <HardDrive className="h-4 w-4 text-emerald-500" />
    }
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
            Дашборд качества данных
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Интегральный аудит файла {report.fileName} · Кодировка: {report.usedEncoding}
            {report.usedDelimiter ? ` · Разделитель: «${report.usedDelimiter === '\t' ? '\\t' : report.usedDelimiter}»` : ''}
          </p>
        </div>
      </div>

      {/* DQ Score + 4 Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-5 flex flex-col items-center justify-center">
          <DqGauge score={score} />
          <p className="mt-3 text-[11px] text-center text-slate-500 dark:text-zinc-400">
            0.30×Полнота + 0.25×Уникальность + 0.25×Валидность + 0.20×Согласованность
          </p>
        </div>

        <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-5 flex flex-col justify-between space-y-4">
          {metricBars.map((m) => {
            const barColor =
              m.value >= 90
                ? 'bg-emerald-500'
                : m.value >= 75
                  ? 'bg-blue-500'
                  : m.value >= 55
                    ? 'bg-amber-500'
                    : 'bg-rose-500';
            return (
              <div key={m.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-zinc-200">
                      {m.label}
                    </span>
                    <span className="ml-2 text-[11px] text-slate-400 dark:text-zinc-500">
                      вес {m.weight}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 dark:text-zinc-100">
                    {m.value}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-500`}
                    style={{ width: `${m.value}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                  {m.hint}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-3.5"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
              <span>{k.label}</span>
              {k.icon}
            </div>
            <div className="mt-2 text-lg font-bold font-mono text-slate-900 dark:text-zinc-100">
              {k.value}
            </div>
            {k.sub && (
              <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                {k.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Critical Issues List */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800/80 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
              Сводка обнаруженных проблем
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Приоритизировано по критичности и количеству затронутых ячеек/строк
            </p>
          </div>
          <span className="rounded-full bg-slate-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs font-mono text-slate-700 dark:text-zinc-300">
            {report.criticalIssues.length}
          </span>
        </div>

        {report.criticalIssues.length === 0 ? (
          <div className="p-8 text-center text-sm text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <span>Критических аномалий не обнаружено!</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/70">
            {report.criticalIssues.map((issue) => {
              const icon =
                issue.severity === 'critical' ? (
                  <AlertOctagon className="h-4 w-4 text-rose-500 shrink-0" />
                ) : issue.severity === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                ) : (
                  <Info className="h-4 w-4 text-sky-500 shrink-0" />
                );

              return (
                <div
                  key={issue.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-zinc-900/80 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5">{icon}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                          {issue.title}
                        </span>
                        {issue.columnName && (
                          <span className="rounded bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-slate-600 dark:text-zinc-300">
                            {issue.columnName}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400 truncate max-w-2xl">
                        {issue.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 px-2 py-1 rounded-md">
                      {formatNum(issue.affectedRows)} шт.
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onJumpToGrid(issue.recommendedFilter, issue.columnIndex)
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                    >
                      <span>К строкам</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

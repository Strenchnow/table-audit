import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Search
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { ProfileReport, RowFilterMode, SemanticType } from '../../shared/types';
import {
  SEMANTIC_TYPE_META,
  formatNum,
  formatStatNum
} from '../utils/formatters';

interface ProfilerViewProps {
  report: ProfileReport;
  onJumpToGrid: (filter: RowFilterMode, columnIndex?: number) => void;
}

export const ProfilerView: React.FC<ProfilerViewProps> = ({
  report,
  onJumpToGrid
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<SemanticType | 'all'>('all');

  const availableTypes = useMemo(() => {
    return Array.from(new Set(report.columns.map((c) => c.semanticType)));
  }, [report.columns]);

  const filteredColumns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return report.columns.filter((c) => {
      if (typeFilter !== 'all' && c.semanticType !== typeFilter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [report.columns, search, typeFilter]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
            Профилирование по столбцам
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Семантические типы, статистики распределения, топ-5 значений и диагностика дефектов
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск столбца..."
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as SemanticType | 'all')}
            className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-zinc-200"
          >
            <option value="all">Все типы ({report.columns.length})</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Column Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filteredColumns.map((col) => {
          const typeMeta = SEMANTIC_TYPE_META[col.semanticType];
          return (
            <div
              key={col.index}
              className="rounded-2xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-5 flex flex-col gap-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                      #{col.index + 1}
                    </span>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100 truncate">
                      {col.name}
                    </h3>
                  </div>
                  {(col.dominantDateFormat || col.dominantPhoneStyle) && (
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                      Основной формат:{' '}
                      <code className="font-mono text-slate-700 dark:text-zinc-300">
                        {col.dominantDateFormat ?? col.dominantPhoneStyle}
                      </code>
                    </div>
                  )}
                </div>

                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono font-medium shrink-0 ${typeMeta.badgeClass}`}
                >
                  {typeMeta.label}
                </span>
              </div>

              {/* Completeness & Uniqueness bars */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/70 dark:border-zinc-800 p-2.5">
                  <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                    <span>Пропуски</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-zinc-100">
                      {formatNum(col.missingCount)} ({col.missingPercent}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        col.missingPercent > 10
                          ? 'bg-rose-500'
                          : col.missingPercent > 0
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, col.missingPercent)}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/70 dark:border-zinc-800 p-2.5">
                  <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                    <span>Уникальные</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-zinc-100">
                      {formatNum(col.uniqueCount)} ({col.uniquePercent}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.min(100, col.uniquePercent)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Numeric or Date stats */}
              {col.numericStats && col.numericStats.count > 0 && (
                <div className="grid grid-cols-4 gap-2 text-[11px] font-mono bg-slate-50 dark:bg-zinc-950/50 border border-slate-200/70 dark:border-zinc-800 rounded-lg p-2.5">
                  <div>
                    <div className="text-slate-400 dark:text-zinc-500">min</div>
                    <div className="font-semibold text-slate-900 dark:text-zinc-100">
                      {formatStatNum(col.numericStats.min)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-zinc-500">max</div>
                    <div className="font-semibold text-slate-900 dark:text-zinc-100">
                      {formatStatNum(col.numericStats.max)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-zinc-500">mean</div>
                    <div className="font-semibold text-slate-900 dark:text-zinc-100">
                      {formatStatNum(col.numericStats.mean)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-zinc-500">median</div>
                    <div className="font-semibold text-slate-900 dark:text-zinc-100">
                      {formatStatNum(col.numericStats.median)}
                    </div>
                  </div>
                </div>
              )}

              {col.dateStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-slate-50 dark:bg-zinc-950/50 border border-slate-200/70 dark:border-zinc-800 rounded-lg p-2.5">
                  <div>
                    <div className="text-slate-400 dark:text-zinc-500">min</div>
                    <div className="font-semibold text-slate-900 dark:text-zinc-100">
                      {col.dateStats.minIso}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-zinc-500">max</div>
                    <div className="font-semibold text-slate-900 dark:text-zinc-100">
                      {col.dateStats.maxIso}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-zinc-500">mean</div>
                    <div className="font-semibold text-slate-900 dark:text-zinc-100">
                      {col.dateStats.meanIso}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 dark:text-zinc-500">median</div>
                    <div className="font-semibold text-slate-900 dark:text-zinc-100">
                      {col.dateStats.medianIso}
                    </div>
                  </div>
                </div>
              )}

              {/* Histogram + Top 5 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1.5">
                    Распределение
                  </div>
                  {col.histogram.length > 0 ? (
                    <div className="h-[140px] w-full">
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart
                          data={col.histogram}
                          margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                        >
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: '#71717a' }}
                            interval="preserveStartEnd"
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: '#71717a' }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#18181b',
                              borderColor: '#27272a',
                              borderRadius: 8,
                              fontSize: 11,
                              color: '#f4f4f5'
                            }}
                          />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {col.histogram.map((bin, idx) => (
                              <Cell
                                key={idx}
                                fill={bin.isOutlierBin ? '#f43f5e' : '#6366f1'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[140px] flex items-center justify-center text-xs text-slate-400">
                      Нет данных
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1.5">
                    Топ-5 значений
                  </div>
                  <div className="space-y-1.5">
                    {col.topValues.length === 0 ? (
                      <div className="text-xs text-slate-400">Только пропуски</div>
                    ) : (
                      col.topValues.map((tv, i) => (
                        <div key={i} className="text-xs">
                          <div className="flex justify-between gap-2">
                            <span
                              className="truncate text-slate-700 dark:text-zinc-300 font-mono"
                              title={tv.value}
                            >
                              {tv.value}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                              {tv.count} ({tv.percent}%)
                            </span>
                          </div>
                          <div className="mt-0.5 h-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500/70"
                              style={{ width: `${Math.min(100, tv.percent)}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Defects footer */}
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/70">
                {col.defects.length === 0 ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Дефекты не обнаружены</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {col.defects.map((d) => {
                      const targetFilter: RowFilterMode =
                        d.type === 'missing'
                          ? 'missing'
                          : d.type === 'outlier'
                            ? 'outliers'
                            : 'format_errors';
                      return (
                        <div
                          key={d.type}
                          className="flex items-center justify-between gap-2 text-xs rounded-lg bg-slate-50 dark:bg-zinc-950/60 px-2.5 py-1.5"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <AlertTriangle
                              className={`h-3.5 w-3.5 shrink-0 ${
                                d.severity === 'critical'
                                  ? 'text-rose-500'
                                  : 'text-amber-500'
                              }`}
                            />
                            <span className="truncate text-slate-700 dark:text-zinc-300">
                              {d.label}
                            </span>
                            <span className="font-mono font-semibold text-slate-900 dark:text-zinc-100">
                              ({formatNum(d.count)})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => onJumpToGrid(targetFilter, col.index)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                          >
                            <span>Строки</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

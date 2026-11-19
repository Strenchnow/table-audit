import React from 'react';
import {
  Activity,
  BarChart3,
  Code2,
  Database,
  GitCompare,
  Moon,
  Sparkles,
  Sun,
  Table2,
  UploadCloud
} from 'lucide-react';
import type { ProfileReport } from '../../shared/types';
import { formatNum } from '../utils/formatters';

export type NavTab =
  | 'upload'
  | 'overview'
  | 'profiler'
  | 'grid'
  | 'reconcile'
  | 'ddl'
  | 'clean';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  report: ProfileReport | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  report,
  theme,
  onToggleTheme
}) => {
  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    requiresData?: boolean;
    badge?: string;
    badgeColor?: string;
  }> = [
    {
      id: 'upload',
      label: 'Загрузка данных',
      icon: <UploadCloud className="h-4 w-4" />
    },
    {
      id: 'overview',
      label: 'Обзор качества',
      icon: <Activity className="h-4 w-4" />,
      requiresData: true,
      badge: report ? `${report.score.overall}%` : undefined,
      badgeColor:
        report && report.score.overall >= 85
          ? 'bg-emerald-500/15 text-emerald-500'
          : report && report.score.overall >= 65
            ? 'bg-amber-500/15 text-amber-500'
            : 'bg-rose-500/15 text-rose-500'
    },
    {
      id: 'profiler',
      label: 'Профилирование',
      icon: <BarChart3 className="h-4 w-4" />,
      requiresData: true,
      badge: report ? String(report.columnCount) : undefined
    },
    {
      id: 'grid',
      label: 'Инспектор данных',
      icon: <Table2 className="h-4 w-4" />,
      requiresData: true,
      badge:
        report && report.totalAnomalies > 0
          ? formatNum(report.totalAnomalies)
          : undefined,
      badgeColor: 'bg-rose-500/15 text-rose-500'
    },
    {
      id: 'reconcile',
      label: 'Сверка таблиц',
      icon: <GitCompare className="h-4 w-4" />,
      requiresData: true
    },
    {
      id: 'ddl',
      label: 'SQL-схема (DDL)',
      icon: <Code2 className="h-4 w-4" />,
      requiresData: true
    },
    {
      id: 'clean',
      label: 'Очистка и экспорт',
      icon: <Sparkles className="h-4 w-4" />,
      requiresData: true
    }
  ];

  return (
    <aside className="w-[244px] shrink-0 border-r border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 flex flex-col">
      {/* Brand Header */}
      <div className="px-4 py-4 border-b border-slate-200 dark:border-zinc-800/80 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/25">
          <Database className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-zinc-100 leading-tight">
            TableAudit
          </div>
          <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
            Local Data Quality Profiler
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const disabled = Boolean(item.requiresData && !report);
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25'
                  : disabled
                    ? 'text-slate-400 dark:text-zinc-600 cursor-not-allowed'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono font-medium shrink-0 ${
                    item.badgeColor ??
                    'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Active Dataset Summary + Theme Toggle */}
      <div className="p-3 border-t border-slate-200 dark:border-zinc-800/80 space-y-2.5">
        {report ? (
          <div className="rounded-lg bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-2.5 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-zinc-500">
              Активный датасет
            </div>
            <div
              className="mt-0.5 font-medium text-slate-800 dark:text-zinc-200 truncate"
              title={report.fileName}
            >
              {report.fileName}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
              <span>{formatNum(report.rowCount)} строк</span>
              <span>{report.columnCount} стб.</span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-zinc-800 p-2.5 text-[11px] text-slate-400 dark:text-zinc-500 text-center">
            Файл не загружен
          </div>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/70 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <span className="flex items-center gap-2">
            {theme === 'dark' ? (
              <Moon className="h-3.5 w-3.5 text-indigo-400" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-amber-500" />
            )}
            <span>{theme === 'dark' ? 'Темная тема' : 'Светлая тема'}</span>
          </span>
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </button>
      </div>
    </aside>
  );
};

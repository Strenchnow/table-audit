import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RotateCcw, Search } from 'lucide-react';
import type {
  CellDefect,
  GridRow,
  ProfileReport,
  RowFilterMode
} from '../../shared/types';
import { formatNum } from '../utils/formatters';

interface DataGridViewProps {
  report: ProfileReport;
  filter: RowFilterMode;
  columnIndex?: number;
  onFilterChange: (filter: RowFilterMode, columnIndex?: number) => void;
}

const PAGE_SIZE = 200;

const FILTER_TABS: Array<{ id: RowFilterMode; label: string }> = [
  { id: 'all', label: 'Все строки' },
  { id: 'missing', label: 'Только с пропусками' },
  { id: 'duplicates', label: 'Только дубликаты' },
  { id: 'outliers', label: 'Только выбросы' },
  { id: 'format_errors', label: 'Ошибки формата' }
];

export const DataGridView: React.FC<DataGridViewProps> = ({
  report,
  filter,
  columnIndex,
  onFilterChange
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalFiltered, setTotalFiltered] = useState<number>(report.rowCount);
  const [pages, setPages] = useState<Record<number, GridRow[]>>({});
  const inFlightPages = useRef<Set<number>>(new Set());
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const [hoveredInfo, setHoveredInfo] = useState<{
    x: number;
    y: number;
    rowNumber: number;
    colName: string;
    defects: CellDefect[];
  } | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 220);
    return () => clearTimeout(t);
  }, [search]);

  const queryKey = `${report.fileName}|${report.rowCount}|${report.usedEncoding}|${report.usedDelimiter}|${report.activeSheet}|${filter}|${columnIndex ?? 'all'}|${debouncedSearch}`;
  const activeQueryKeyRef = useRef(queryKey);
  activeQueryKeyRef.current = queryKey;

  const fetchPage = useCallback(
    async (pageIdx: number, expectedKey: string) => {
      if (inFlightPages.current.has(pageIdx)) return;
      inFlightPages.current.add(pageIdx);
      try {
        const res = await window.tableAudit.getRows({
          filter,
          offset: pageIdx * PAGE_SIZE,
          limit: PAGE_SIZE,
          columnIndex,
          search: debouncedSearch
        });
        if (activeQueryKeyRef.current !== expectedKey) return;
        setTotalFiltered(res.totalFiltered);
        setPages((prev) => ({ ...prev, [pageIdx]: res.rows }));
      } catch (err) {
        console.error('[DataGridView] fetchPage error:', err, expectedKey);
      } finally {
        inFlightPages.current.delete(pageIdx);
      }
    },
    [filter, columnIndex, debouncedSearch]
  );

  // Reset cache and fetch page 0 when query parameters change
  useEffect(() => {
    setPages({});
    inFlightPages.current.clear();
    if (scrollParentRef.current) {
      scrollParentRef.current.scrollTop = 0;
    }
    fetchPage(0, queryKey);
  }, [queryKey, fetchPage]);

  const virtualizer = useVirtualizer({
    count: totalFiltered,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 36,
    overscan: 15
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Trigger page loads for currently visible virtual items
  useEffect(() => {
    if (virtualItems.length === 0) return;
    const firstIdx = virtualItems[0].index;
    const lastIdx = virtualItems[virtualItems.length - 1].index;
    const firstPage = Math.floor(firstIdx / PAGE_SIZE);
    const lastPage = Math.floor(lastIdx / PAGE_SIZE);

    for (let p = firstPage; p <= lastPage; p++) {
      if (!pages[p] && !inFlightPages.current.has(p)) {
        fetchPage(p, queryKey);
      }
    }
  }, [virtualItems, pages, fetchPage, queryKey]);

  const colWidths = useMemo(() => {
    return report.columns.map((col) => {
      const base = Math.max(col.name.length * 9 + 36, Math.min(col.maxStringLength * 7.5 + 24, 240));
      return Math.max(130, Math.min(260, Math.round(base)));
    });
  }, [report.columns]);

  const totalTableWidth = useMemo(
    () => 72 + colWidths.reduce((s, w) => s + w, 0),
    [colWidths]
  );

  const getRow = (virtualIndex: number): GridRow | undefined => {
    const pageIdx = Math.floor(virtualIndex / PAGE_SIZE);
    const localIdx = virtualIndex % PAGE_SIZE;
    return pages[pageIdx]?.[localIdx];
  };

  return (
    <div className="h-full flex flex-col p-5 gap-3 overflow-hidden">
      {/* Header & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
            Инспектор проблемных данных
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Наведите курсор на подсвеченную ячейку, чтобы увидеть причину ошибки · Показано{' '}
            <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
              {formatNum(totalFiltered)}
            </span>{' '}
            строк
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={columnIndex === undefined ? '' : String(columnIndex)}
            onChange={(e) =>
              onFilterChange(
                filter,
                e.target.value === '' ? undefined : Number(e.target.value)
              )
            }
            className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-zinc-200 max-w-[200px]"
          >
            <option value="">Все столбцы</option>
            {report.columns.map((c) => (
              <option key={c.index} value={String(c.index)}>
                Столбец: {c.name}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по значениям..."
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 w-52 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {(filter !== 'all' || columnIndex !== undefined || search !== '') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                onFilterChange('all', undefined);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Сбросить</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.id;
          const count = report.filterCounts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFilterChange(tab.id, columnIndex)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'
                }`}
              >
                {formatNum(count)}
              </span>
            </button>
          );
        })}

        {/* Color Legend */}
        <div className="ml-auto hidden xl:flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/40 border border-rose-500" />
            Критич. ошибка / Выброс
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/40 border border-amber-500" />
            Формат / Пропуск / Дубликат
          </span>
        </div>
      </div>

      {/* Virtualized Data Grid */}
      <div className="flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden flex flex-col">
        <div ref={scrollParentRef} className="flex-1 overflow-auto relative">
          <div style={{ width: totalTableWidth, minWidth: '100%' }}>
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 flex bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <div className="w-[72px] shrink-0 px-3 py-2.5 border-r border-slate-200 dark:border-zinc-800 font-mono text-[11px] text-slate-500">
                #
              </div>
              {report.columns.map((col, cIdx) => (
                <div
                  key={col.index}
                  style={{ width: colWidths[cIdx] }}
                  className={`shrink-0 px-3 py-2.5 border-r border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-1 ${
                    columnIndex === col.index
                      ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                      : ''
                  }`}
                >
                  <span className="truncate" title={col.name}>
                    {col.name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 shrink-0">
                    {col.semanticType}
                  </span>
                </div>
              ))}
            </div>

            {/* Virtual Rows Container */}
            {totalFiltered === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500 dark:text-zinc-400">
                Нет строк, удовлетворяющих выбранным фильтрам.
              </div>
            ) : (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  position: 'relative',
                  width: '100%'
                }}
              >
                {virtualItems.map((vRow) => {
                  const row = getRow(vRow.index);
                  return (
                    <div
                      key={vRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${vRow.size}px`,
                        transform: `translateY(${vRow.start}px)`
                      }}
                      className={`flex items-stretch border-b border-slate-100 dark:border-zinc-800/60 text-xs ${
                        row?.isDuplicate
                          ? 'bg-amber-500/10 hover:bg-amber-500/15'
                          : 'hover:bg-slate-50 dark:hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="w-[72px] shrink-0 px-3 flex items-center justify-between border-r border-slate-100 dark:border-zinc-800/70 font-mono text-[11px] text-slate-400 dark:text-zinc-500">
                        <span>{row ? row.rowIndex + 1 : '…'}</span>
                        {row?.isDuplicate && (
                          <span
                            title="Полный дубликат строки"
                            className="px-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[9px] font-bold"
                          >
                            DUP
                          </span>
                        )}
                      </div>

                      {report.columns.map((col, cIdx) => {
                        const cellVal = row ? row.cells[cIdx] : undefined;
                        const defects = row?.cellDefects[cIdx];
                        const hasCritical = defects?.some((d) => d.severity === 'critical');
                        const hasWarning = defects && defects.length > 0 && !hasCritical;

                        const cellBg = hasCritical
                          ? 'bg-rose-500/15 ring-1 ring-inset ring-rose-500/40'
                          : hasWarning
                            ? 'bg-amber-500/15 ring-1 ring-inset ring-amber-500/35'
                            : '';

                        return (
                          <div
                            key={col.index}
                            style={{ width: colWidths[cIdx] }}
                            onMouseEnter={(e) => {
                              if (defects && defects.length > 0 && row) {
                                setHoveredInfo({
                                  x: e.clientX,
                                  y: e.clientY,
                                  rowNumber: row.rowIndex + 1,
                                  colName: col.name,
                                  defects
                                });
                              }
                            }}
                            onMouseMove={(e) => {
                              if (defects && defects.length > 0 && row) {
                                setHoveredInfo({
                                  x: e.clientX,
                                  y: e.clientY,
                                  rowNumber: row.rowIndex + 1,
                                  colName: col.name,
                                  defects
                                });
                              }
                            }}
                            onMouseLeave={() => setHoveredInfo(null)}
                            className={`shrink-0 px-3 flex items-center border-r border-slate-100 dark:border-zinc-800/70 truncate font-mono text-[12px] ${cellBg} ${
                              defects ? 'cursor-help' : ''
                            }`}
                          >
                            {!row ? (
                              <span className="text-slate-300 dark:text-zinc-700">…</span>
                            ) : cellVal === null || cellVal === undefined || cellVal.trim() === '' ? (
                              <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 text-[10px]">
                                NULL
                              </span>
                            ) : (
                              <span className="truncate text-slate-800 dark:text-zinc-200">
                                {cellVal}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Cell Tooltip */}
      {hoveredInfo && (
        <div
          style={{
            left: Math.min(hoveredInfo.x + 14, window.innerWidth - 340),
            top: Math.min(hoveredInfo.y + 14, window.innerHeight - 160)
          }}
          className="fixed z-50 w-80 pointer-events-none rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 shadow-2xl"
        >
          <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
            Строка {hoveredInfo.rowNumber} · Столбец «{hoveredInfo.colName}»
          </div>
          <ul className="mt-1.5 space-y-1">
            {hoveredInfo.defects.map((d, i) => (
              <li
                key={i}
                className={`text-xs font-medium ${
                  d.severity === 'critical'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-amber-600 dark:text-amber-300'
                }`}
              >
                • {d.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

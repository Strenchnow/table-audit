import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  FolderOpen,
  GitCompare,
  Play,
  UploadCloud
} from 'lucide-react';
import type {
  CsvDelimiter,
  ProfileReport,
  ReconciliationResult,
  SupportedEncoding,
  TableBMeta
} from '../../shared/types';
import { formatNum } from '../utils/formatters';

interface ReconcileViewProps {
  reportA: ProfileReport;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const ReconcileView: React.FC<ReconcileViewProps> = ({
  reportA,
  onNotify
}) => {
  const [tableB, setTableB] = useState<TableBMeta | null>(null);
  const [keyColumnA, setKeyColumnA] = useState<string>(reportA.headers[0] ?? '');
  const [keyColumnB, setKeyColumnB] = useState<string>('');
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [trimKeys, setTrimKeys] = useState(true);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'diffs' | 'onlyA' | 'onlyB'>('diffs');
  const [busy, setBusy] = useState(false);

  // Auto-select matching key & common compare columns when Table A or B updates
  useEffect(() => {
    if (!tableB) return;
    const common = reportA.headers.filter((h) => tableB.headers.includes(h));
    const defaultKey =
      common.find((h) => /(^|_)id$|email|code/i.test(h)) ??
      common[0] ??
      reportA.headers[0] ??
      '';
    setKeyColumnA(defaultKey);
    setKeyColumnB(tableB.headers.includes(defaultKey) ? defaultKey : tableB.headers[0] ?? '');
    setSelectedCols(common.filter((c) => c !== defaultKey));
    setResult(null);
  }, [tableB, reportA.headers]);

  const handleOpenB = async () => {
    try {
      const dialogRes = await window.tableAudit.openFileDialog();
      if (dialogRes.canceled || !dialogRes.filePath) return;
      setBusy(true);
      const meta = await window.tableAudit.loadSecondFile(dialogRes.filePath);
      setTableB(meta);
      onNotify('success', 'Таблица B загружена', `${meta.fileName} (${formatNum(meta.rowCount)} строк)`);
    } catch (err) {
      onNotify('error', 'Ошибка загрузки Таблицы B', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDropB = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      const filePath = window.tableAudit.getPathForFile(file);
      const meta = filePath
        ? await window.tableAudit.loadSecondFile(filePath)
        : await window.tableAudit.loadSecondBuffer(await file.arrayBuffer(), file.name);
      setTableB(meta);
      onNotify('success', 'Таблица B загружена', `${meta.fileName} (${formatNum(meta.rowCount)} строк)`);
    } catch (err) {
      onNotify('error', 'Ошибка загрузки Таблицы B', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReparseB = async (opts: {
    encoding?: SupportedEncoding;
    delimiter?: CsvDelimiter;
    sheetName?: string;
  }) => {
    try {
      setBusy(true);
      const meta = await window.tableAudit.reparseSecond(opts);
      setTableB(meta);
    } catch (err) {
      onNotify('error', 'Ошибка переразбора Таблицы B', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRunReconcile = async () => {
    if (!tableB) return;
    try {
      setBusy(true);
      const comparePairs = selectedCols
        .filter((c) => tableB.headers.includes(c))
        .map((c) => ({ colA: c, colB: c }));

      const res = await window.tableAudit.reconcile({
        keyColumnA,
        keyColumnB,
        compareColumns: comparePairs,
        trimKeys
      });
      setResult(res);
      if (res.differences.length > 0) setActiveResultTab('diffs');
      else if (res.onlyInA.length > 0) setActiveResultTab('onlyA');
      else setActiveResultTab('onlyB');
    } catch (err) {
      onNotify('error', 'Ошибка сверки', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const commonCompareCandidates = tableB
    ? reportA.headers.filter((h) => tableB.headers.includes(h) && h !== keyColumnA)
    : [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
          Сверка двух таблиц (Reconciliation)
        </h1>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Сравнение активной Таблицы A (<span className="font-mono">{reportA.fileName}</span>) со второй выгрузкой по ключевому столбцу
        </p>
      </div>

      {/* Load Table B & Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropB}
          className="lg:col-span-5 rounded-2xl border border-dashed border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 p-5 flex flex-col justify-between gap-4"
        >
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
              Таблица B (эталон / новая выгрузка)
            </div>
            {tableB ? (
              <div className="mt-2 space-y-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">
                  {tableB.fileName}
                </div>
                <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                  {formatNum(tableB.rowCount)} строк × {tableB.columnCount} столбцов · {tableB.usedEncoding}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {tableB.format === 'csv' && (
                    <>
                      <select
                        value={tableB.usedEncoding}
                        onChange={(e) =>
                          handleReparseB({
                            encoding: e.target.value as SupportedEncoding,
                            delimiter: tableB.usedDelimiter
                          })
                        }
                        className="rounded border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2 py-1 text-xs font-mono"
                      >
                        <option value="utf-8">UTF-8</option>
                        <option value="windows-1251">Windows-1251</option>
                        <option value="koi8-r">KOI8-R</option>
                      </select>
                      <select
                        value={tableB.usedDelimiter ?? ','}
                        onChange={(e) =>
                          handleReparseB({
                            encoding: tableB.usedEncoding as SupportedEncoding,
                            delimiter: e.target.value as CsvDelimiter
                          })
                        }
                        className="rounded border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2 py-1 text-xs font-mono"
                      >
                        <option value=",">, (запятая)</option>
                        <option value=";">; (точка с запятой)</option>
                        <option value="	">\t (таб)</option>
                      </select>
                    </>
                  )}

                  {tableB.sheetNames && tableB.sheetNames.length > 0 && (
                    <select
                      value={tableB.activeSheet ?? tableB.sheetNames[0]}
                      onChange={(e) => handleReparseB({ sheetName: e.target.value })}
                      className="rounded border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2 py-1 text-xs"
                    >
                      {tableB.sheetNames.map((s) => (
                        <option key={s} value={s}>
                          Лист: {s}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400">
                <UploadCloud className="h-6 w-6 text-indigo-500 shrink-0" />
                <span>Перетащите второй файл (.csv, .xlsx, .json) или выберите с диска</span>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleOpenB}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <FolderOpen className="h-3.5 w-3.5 text-indigo-500" />
            <span>{tableB ? 'Выбрать другой файл B...' : 'Загрузить Таблицу B...'}</span>
          </button>
        </div>

        {/* Keys & Columns Picker */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-5 flex flex-col justify-between gap-4">
          {!tableB ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-6 text-xs text-slate-400 dark:text-zinc-500">
              <GitCompare className="h-8 w-8 mb-2 opacity-50" />
              Загрузите Таблицу B слева, чтобы выбрать ключ и поля для сравнения.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs space-y-1">
                  <span className="text-slate-500 dark:text-zinc-400 font-medium">
                    Ключ в Таблице A
                  </span>
                  <select
                    value={keyColumnA}
                    onChange={(e) => setKeyColumnA(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-2 text-xs font-mono"
                  >
                    {reportA.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs space-y-1">
                  <span className="text-slate-500 dark:text-zinc-400 font-medium">
                    Ключ в Таблице B
                  </span>
                  <select
                    value={keyColumnB}
                    onChange={(e) => setKeyColumnB(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-2 text-xs font-mono"
                  >
                    {tableB.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-500 dark:text-zinc-400 font-medium">
                    Общие столбцы для сравнения ({selectedCols.length} из {commonCompareCandidates.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedCols(
                        selectedCols.length === commonCompareCandidates.length
                          ? []
                          : commonCompareCandidates
                      )
                    }
                    className="text-indigo-500 hover:underline text-[11px]"
                  >
                    {selectedCols.length === commonCompareCandidates.length
                      ? 'Снять все'
                      : 'Выбрать все'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {commonCompareCandidates.map((col) => {
                    const checked = selectedCols.includes(col);
                    return (
                      <label
                        key={col}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-700 dark:text-indigo-300'
                            : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCols([...selectedCols, col]);
                            } else {
                              setSelectedCols(selectedCols.filter((c) => c !== col));
                            }
                          }}
                          className="accent-indigo-600"
                        />
                        <span className="font-mono">{col}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trimKeys}
                    onChange={(e) => setTrimKeys(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <span>Игнорировать пробелы по краям (trim)</span>
                </label>

                <button
                  type="button"
                  disabled={busy || !keyColumnA || !keyColumnB}
                  onClick={handleRunReconcile}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Выполнить сверку</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Совпали полностью</div>
              <div className="mt-1 text-xl font-bold font-mono text-emerald-500">
                {formatNum(result.summary.matchedIdentical)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Отличаются поля</div>
              <div className="mt-1 text-xl font-bold font-mono text-amber-500">
                {formatNum(result.summary.matchedWithDiffs)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Есть только в A</div>
              <div className="mt-1 text-xl font-bold font-mono text-rose-500">
                {formatNum(result.summary.onlyInACount)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Есть только в B</div>
              <div className="mt-1 text-xl font-bold font-mono text-sky-500">
                {formatNum(result.summary.onlyInBCount)}
              </div>
            </div>
          </div>

          {(result.duplicateKeysA > 0 || result.duplicateKeysB > 0) && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
              Обратите внимание: найдены неуникальные ключи (дубликатов в A: {result.duplicateKeysA}, в B: {result.duplicateKeysB}). Для сверки взято первое вхождение каждого ключа.
            </div>
          )}

          {/* Result Tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveResultTab('diffs')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium border ${
                activeResultTab === 'diffs'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              Различия значений ({formatNum(result.differences.length)})
            </button>
            <button
              type="button"
              onClick={() => setActiveResultTab('onlyA')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium border ${
                activeResultTab === 'onlyA'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              Только в A ({formatNum(result.onlyInA.length)})
            </button>
            <button
              type="button"
              onClick={() => setActiveResultTab('onlyB')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium border ${
                activeResultTab === 'onlyB'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              Только в B ({formatNum(result.onlyInB.length)})
            </button>
          </div>

          {/* Section Content */}
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
            {activeResultTab === 'diffs' && (
              <div className="max-h-[420px] overflow-auto divide-y divide-slate-100 dark:divide-zinc-800">
                {result.differences.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Расхождений по выбранным полям не найдено.
                  </div>
                ) : (
                  result.differences.slice(0, 300).map((rowDiff) => (
                    <div key={rowDiff.key} className="p-4 space-y-2">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-mono font-semibold text-indigo-500">
                          Ключ: {rowDiff.key}
                        </span>
                        <span className="text-slate-400 font-mono">
                          (строка A #{rowDiff.rowIndexA + 1} ↔ строка B #{rowDiff.rowIndexB + 1})
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {rowDiff.diffs.map((d, idx) => (
                          <div
                            key={idx}
                            className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-3 py-2 text-xs font-mono"
                          >
                            <span className="text-slate-500 dark:text-zinc-400">
                              {d.column}:
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-300 line-through">
                              {d.valueA ?? 'NULL'}
                            </span>
                            <ArrowRight className="h-3 w-3 text-slate-400" />
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                              {d.valueB ?? 'NULL'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {(activeResultTab === 'onlyA' || activeResultTab === 'onlyB') && (
              <div className="max-h-[420px] overflow-auto">
                {(() => {
                  const list = activeResultTab === 'onlyA' ? result.onlyInA : result.onlyInB;
                  if (list.length === 0) {
                    return (
                      <div className="p-8 text-center text-xs text-slate-500">
                        Уникальных записей только в этой таблице нет.
                      </div>
                    );
                  }
                  const keys = Object.keys(list[0].record);
                  return (
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800">
                        <tr>
                          <th className="px-3 py-2 font-mono text-slate-500">#</th>
                          {keys.map((k) => (
                            <th key={k} className="px-3 py-2 font-mono">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                        {list.slice(0, 300).map((item) => (
                          <tr key={`${item.key}-${item.rowIndex}`}>
                            <td className="px-3 py-2 font-mono text-slate-400">
                              {item.rowIndex + 1}
                            </td>
                            {keys.map((k) => (
                              <td key={k} className="px-3 py-2 font-mono max-w-[200px] truncate">
                                {item.record[k] ?? 'NULL'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

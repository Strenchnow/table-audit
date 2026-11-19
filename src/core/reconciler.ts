import type {
  CellValue,
  ParsedTable,
  ReconcileRequest,
  ReconcileRowDiff,
  ReconcileSideRow,
  ReconciliationResult
} from '../shared/types';

function rowToRecord(headers: string[], row: CellValue[]): Record<string, CellValue> {
  const rec: Record<string, CellValue> = {};
  for (let i = 0; i < headers.length; i++) {
    rec[headers[i]] = row[i] ?? null;
  }
  return rec;
}

function normalizeCellForCompare(val: CellValue, trim: boolean): string {
  if (val === null || val === undefined) return '';
  return trim ? val.trim() : val;
}

export function reconcileTables(
  tableA: ParsedTable,
  tableB: ParsedTable,
  req: ReconcileRequest
): ReconciliationResult {
  const keyIdxA = tableA.headers.indexOf(req.keyColumnA);
  const keyIdxB = tableB.headers.indexOf(req.keyColumnB);

  if (keyIdxA === -1) {
    throw new Error(`Ключевой столбец «${req.keyColumnA}» не найден в Таблице A.`);
  }
  if (keyIdxB === -1) {
    throw new Error(`Ключевой столбец «${req.keyColumnB}» не найден в Таблице B.`);
  }

  const trimKeys = req.trimKeys ?? true;

  const colPairs = req.compareColumns
    .map((pair) => ({
      name: pair.colA === pair.colB ? pair.colA : `${pair.colA} / ${pair.colB}`,
      idxA: tableA.headers.indexOf(pair.colA),
      idxB: tableB.headers.indexOf(pair.colB)
    }))
    .filter((p) => p.idxA !== -1 && p.idxB !== -1);

  const mapA = new Map<string, { rowIndex: number; row: CellValue[] }>();
  let duplicateKeysA = 0;

  for (let r = 0; r < tableA.rows.length; r++) {
    const rawKey = tableA.rows[r][keyIdxA];
    const key = rawKey === null ? '' : trimKeys ? rawKey.trim() : rawKey;
    if (!key) continue;
    if (mapA.has(key)) {
      duplicateKeysA++;
      continue;
    }
    mapA.set(key, { rowIndex: r, row: tableA.rows[r] });
  }

  const mapB = new Map<string, { rowIndex: number; row: CellValue[] }>();
  let duplicateKeysB = 0;

  for (let r = 0; r < tableB.rows.length; r++) {
    const rawKey = tableB.rows[r][keyIdxB];
    const key = rawKey === null ? '' : trimKeys ? rawKey.trim() : rawKey;
    if (!key) continue;
    if (mapB.has(key)) {
      duplicateKeysB++;
      continue;
    }
    mapB.set(key, { rowIndex: r, row: tableB.rows[r] });
  }

  const onlyInA: ReconcileSideRow[] = [];
  const onlyInB: ReconcileSideRow[] = [];
  const differences: ReconcileRowDiff[] = [];
  let matchedIdentical = 0;

  for (const [key, entryA] of mapA.entries()) {
    const entryB = mapB.get(key);
    if (!entryB) {
      onlyInA.push({
        key,
        rowIndex: entryA.rowIndex,
        record: rowToRecord(tableA.headers, entryA.row)
      });
      continue;
    }

    const diffs = [];
    for (const pair of colPairs) {
      const valA = entryA.row[pair.idxA] ?? null;
      const valB = entryB.row[pair.idxB] ?? null;
      if (normalizeCellForCompare(valA, trimKeys) !== normalizeCellForCompare(valB, trimKeys)) {
        diffs.push({
          column: pair.name,
          valueA: valA,
          valueB: valB
        });
      }
    }

    if (diffs.length > 0) {
      differences.push({
        key,
        rowIndexA: entryA.rowIndex,
        rowIndexB: entryB.rowIndex,
        diffs
      });
    } else {
      matchedIdentical++;
    }
  }

  for (const [key, entryB] of mapB.entries()) {
    if (!mapA.has(key)) {
      onlyInB.push({
        key,
        rowIndex: entryB.rowIndex,
        record: rowToRecord(tableB.headers, entryB.row)
      });
    }
  }

  return {
    tableAName: tableA.fileName,
    tableBName: tableB.fileName,
    keyColumnA: req.keyColumnA,
    keyColumnB: req.keyColumnB,
    onlyInA,
    onlyInB,
    differences,
    duplicateKeysA,
    duplicateKeysB,
    summary: {
      totalA: tableA.rows.length,
      totalB: tableB.rows.length,
      matchedIdentical,
      matchedWithDiffs: differences.length,
      onlyInACount: onlyInA.length,
      onlyInBCount: onlyInB.length
    }
  };
}

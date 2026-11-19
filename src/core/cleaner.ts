import * as XLSX from 'xlsx';
import type {
  CellValue,
  CleaningChangeSample,
  CleaningOptions,
  CleaningPreview,
  ParsedTable
} from '../shared/types';
import type { ProfileSession } from './profiler';
import { isMissingValue, parseDateValue, parseNumericValue } from './validators';

function cleanWhitespaceText(val: string): string {
  return val
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

export function applyCleaning(
  session: ProfileSession,
  options: CleaningOptions
): { table: ParsedTable; preview: CleaningPreview } {
  const { table, columnMeta } = session;
  const colCount = table.headers.length;

  let duplicatesRemoved = 0;
  let cellsTrimmed = 0;
  let datesNormalized = 0;
  let decimalsNormalized = 0;
  let totalCellsChanged = 0;
  const samples: CleaningChangeSample[] = [];

  const seenRowKeys = new Set<string>();
  const cleanedRows: CellValue[][] = [];

  for (let r = 0; r < table.rows.length; r++) {
    const srcRow = table.rows[r];

    if (options.removeDuplicates) {
      let key = '';
      for (let c = 0; c < colCount; c++) {
        const v = srcRow[c];
        key += (c > 0 ? '\u001F' : '') + (v === null ? '\u0000' : v);
      }
      if (seenRowKeys.has(key)) {
        duplicatesRemoved++;
        continue;
      }
      seenRowKeys.add(key);
    }

    const nextRow: CellValue[] = new Array(colCount);
    for (let c = 0; c < colCount; c++) {
      const original = srcRow[c] ?? null;
      let current = original;
      const meta = columnMeta[c];
      const reasons: string[] = [];

      if (current !== null && !isMissingValue(current)) {
        if (options.trimWhitespace) {
          const trimmed = cleanWhitespaceText(current);
          if (trimmed !== current) {
            current = trimmed;
            cellsTrimmed++;
            reasons.push('обрезка пробелов');
          }
        }

        if (
          options.normalizeDatesIso &&
          (meta.semanticType === 'date' || meta.semanticType === 'datetime')
        ) {
          const parsed = parseDateValue(current);
          if (parsed.valid && parsed.isoDate) {
            const target = parsed.hasTime && parsed.isoDateTime ? parsed.isoDateTime : parsed.isoDate;
            if (target !== current) {
              current = target;
              datesNormalized++;
              reasons.push('ISO 8601');
            }
          }
        }

        if (
          options.normalizeDecimalSeparators &&
          meta.semanticType === 'float'
        ) {
          const parsedNum = parseNumericValue(current);
          if (
            parsedNum.valid &&
            parsedNum.value !== undefined &&
            parsedNum.decimalSeparator === ','
          ) {
            const normalized = String(parsedNum.value);
            if (normalized !== current) {
              current = normalized;
              decimalsNormalized++;
              reasons.push('унификация десятичного разделителя');
            }
          }
        }
      }

      if (current !== original) {
        totalCellsChanged++;
        if (samples.length < 30) {
          samples.push({
            rowIndex: r + 1,
            columnName: table.headers[c],
            before: original,
            after: current,
            reason: reasons.join(', ')
          });
        }
      }

      nextRow[c] = current;
    }

    cleanedRows.push(nextRow);
  }

  const cleanedTable: ParsedTable = {
    ...table,
    rows: cleanedRows
  };

  return {
    table: cleanedTable,
    preview: {
      originalRows: table.rows.length,
      resultingRows: cleanedRows.length,
      duplicatesRemoved,
      cellsTrimmed,
      datesNormalized,
      decimalsNormalized,
      totalCellsChanged,
      samples
    }
  };
}

export function previewCleaning(
  session: ProfileSession,
  options: CleaningOptions
): CleaningPreview {
  return applyCleaning(session, options).preview;
}

function escapeCsvCell(val: CellValue): string {
  if (val === null || val === undefined) return '';
  if (/[",\r\n;]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function serializeTableToCsv(table: ParsedTable): Buffer {
  const lines: string[] = [];
  lines.push(table.headers.map((h) => escapeCsvCell(h)).join(','));
  for (const row of table.rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(','));
  }
  // UTF-8 with BOM so Excel on Windows opens Cyrillic seamlessly
  const content = '\uFEFF' + lines.join('\r\n');
  return Buffer.from(content, 'utf-8');
}

export function serializeTableToXlsx(table: ParsedTable): Buffer {
  const aoa: Array<Array<string | null>> = [table.headers, ...table.rows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'CleanedData');
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(out);
}

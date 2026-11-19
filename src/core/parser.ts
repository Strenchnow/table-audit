import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import path from 'node:path';
import type {
  CellValue,
  CsvDelimiter,
  FileFormat,
  ParseOptions,
  ParsedTable
} from '../shared/types';
import { decodeBuffer } from './encoding';

const CANDIDATE_DELIMITERS: Array<',' | ';' | '\t'> = [',', ';', '\t'];

function countDelimiterInLine(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delimiter) {
      count++;
    }
  }
  return count;
}

export function detectCsvDelimiter(text: string): ',' | ';' | '\t' {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .slice(0, 30);

  if (lines.length === 0) return ',';

  let bestDelimiter: ',' | ';' | '\t' = ',';
  let bestScore = -1;

  for (const delim of CANDIDATE_DELIMITERS) {
    const counts = lines.map((line) => countDelimiterInLine(line, delim));
    const nonZeroLines = counts.filter((c) => c > 0).length;
    if (nonZeroLines === 0) continue;

    const avg = counts.reduce((acc, c) => acc + c, 0) / counts.length;
    const variance =
      counts.reduce((acc, c) => acc + Math.pow(c - avg, 2), 0) / counts.length;
    const consistency = nonZeroLines / counts.length;
    const score = consistency * 100 + Math.min(avg, 25) - variance * 2;

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

export function normalizeHeaders(rawHeaders: unknown[], columnCount: number): string[] {
  const seen = new Map<string, number>();
  const headers: string[] = [];

  for (let i = 0; i < columnCount; i++) {
    const raw = rawHeaders[i];
    let base =
      raw === null || raw === undefined
        ? ''
        : String(raw)
            .replace(/^\uFEFF/, '')
            .trim();
    if (!base) {
      base = `column_${i + 1}`;
    }

    const prevCount = seen.get(base) ?? 0;
    seen.set(base, prevCount + 1);
    headers.push(prevCount === 0 ? base : `${base}_${prevCount + 1}`);
  }

  return headers;
}

function normalizeGridRows(rawMatrix: unknown[][]): { headers: string[]; rows: CellValue[][] } {
  if (rawMatrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const headerRow = rawMatrix[0] ?? [];
  let maxCols = headerRow.length;
  for (let i = 1; i < rawMatrix.length; i++) {
    if (rawMatrix[i].length > maxCols) {
      maxCols = rawMatrix[i].length;
    }
  }

  if (maxCols === 0) {
    return { headers: [], rows: [] };
  }

  const headers = normalizeHeaders(headerRow, maxCols);
  const rows: CellValue[][] = [];

  for (let r = 1; r < rawMatrix.length; r++) {
    const src = rawMatrix[r];
    if (!src || src.length === 0) continue;

    const row: CellValue[] = new Array(maxCols);
    let allNull = true;
    for (let c = 0; c < maxCols; c++) {
      const val = src[c];
      if (val === undefined || val === null) {
        row[c] = null;
      } else {
        const str = String(val);
        row[c] = str;
        if (str.trim().length > 0) allNull = false;
      }
    }

    if (!allNull) {
      rows.push(row);
    }
  }

  return { headers, rows };
}

export function parseCsvBuffer(
  buffer: Uint8Array,
  fileName: string,
  options: ParseOptions = {},
  filePath?: string
): ParsedTable {
  const start = performance.now();
  const { text, detectedEncoding, usedEncoding } = decodeBuffer(
    buffer,
    options.encoding ?? 'auto'
  );
  const detectedDelimiter = detectCsvDelimiter(text);
  const usedDelimiter: ',' | ';' | '\t' =
    options.delimiter && options.delimiter !== 'auto'
      ? options.delimiter
      : detectedDelimiter;

  const parsed = Papa.parse<string[]>(text, {
    delimiter: usedDelimiter,
    header: false,
    skipEmptyLines: 'greedy',
    dynamicTyping: false
  });

  const matrix = (parsed.data ?? []) as unknown[][];
  const { headers, rows } = normalizeGridRows(matrix);

  return {
    fileName,
    filePath,
    fileSizeBytes: buffer.byteLength,
    format: 'csv',
    detectedEncoding,
    usedEncoding,
    detectedDelimiter,
    usedDelimiter,
    headers,
    rows,
    parseTimeMs: Math.round(performance.now() - start)
  };
}

export function parseExcelBuffer(
  buffer: Uint8Array,
  fileName: string,
  options: ParseOptions = {},
  filePath?: string
): ParsedTable {
  const start = performance.now();
  const ext = path.extname(fileName).toLowerCase();
  const format: FileFormat = ext === '.xls' ? 'xls' : 'xlsx';

  const workbook = XLSX.read(Buffer.from(buffer), {
    type: 'buffer',
    cellDates: false,
    cellNF: true,
    cellText: true
  });

  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) {
    throw new Error('В Excel-файле не найдено ни одного листа.');
  }

  const activeSheet =
    options.sheetName && sheetNames.includes(options.sheetName)
      ? options.sheetName
      : sheetNames[0];

  const sheet = workbook.Sheets[activeSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: false
  });

  const { headers, rows } = normalizeGridRows(matrix);

  return {
    fileName,
    filePath,
    fileSizeBytes: buffer.byteLength,
    format,
    detectedEncoding: 'utf-8',
    usedEncoding: 'utf-8',
    sheetNames,
    activeSheet,
    headers,
    rows,
    parseTimeMs: Math.round(performance.now() - start)
  };
}

function flattenObject(
  input: unknown,
  prefix = '',
  target: Record<string, CellValue> = {}
): Record<string, CellValue> {
  if (input === null || input === undefined) {
    if (prefix) target[prefix] = null;
    return target;
  }

  if (Array.isArray(input)) {
    if (prefix) {
      target[prefix] = input.length === 0 ? null : JSON.stringify(input);
    }
    return target;
  }

  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length === 0 && prefix) {
      target[prefix] = null;
      return target;
    }
    for (const [key, val] of entries) {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        flattenObject(val, nextKey, target);
      } else if (Array.isArray(val)) {
        target[nextKey] = val.length === 0 ? null : JSON.stringify(val);
      } else if (val === undefined || val === null) {
        target[nextKey] = null;
      } else {
        target[nextKey] = String(val);
      }
    }
    return target;
  }

  if (prefix) {
    target[prefix] = String(input);
  }
  return target;
}

function extractJsonArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const arrayEntry = Object.values(obj).find((v) => Array.isArray(v));
    if (Array.isArray(arrayEntry)) {
      return arrayEntry;
    }
    return [obj];
  }
  throw new Error('JSON должен содержать массив объектов или объект с массивом данных.');
}

export function parseJsonBuffer(
  buffer: Uint8Array,
  fileName: string,
  options: ParseOptions = {},
  filePath?: string
): ParsedTable {
  const start = performance.now();
  const { text, detectedEncoding, usedEncoding } = decodeBuffer(
    buffer,
    options.encoding ?? 'auto'
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Ошибка синтаксиса JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const items = extractJsonArray(parsed);
  const flatRecords: Array<Record<string, CellValue>> = [];
  const headerSet = new Set<string>();

  for (const item of items) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const flat = flattenObject(item);
      for (const k of Object.keys(flat)) {
        headerSet.add(k);
      }
      flatRecords.push(flat);
    } else {
      headerSet.add('value');
      flatRecords.push({
        value: item === null || item === undefined ? null : String(item)
      });
    }
  }

  const headers = Array.from(headerSet);
  const rows: CellValue[][] = flatRecords.map((rec) =>
    headers.map((h) => (h in rec ? rec[h] : null))
  );

  return {
    fileName,
    filePath,
    fileSizeBytes: buffer.byteLength,
    format: 'json',
    detectedEncoding,
    usedEncoding,
    headers,
    rows,
    parseTimeMs: Math.round(performance.now() - start)
  };
}

export function parseFileBuffer(
  buffer: Uint8Array,
  fileName: string,
  options: ParseOptions = {},
  filePath?: string
): ParsedTable {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    return parseExcelBuffer(buffer, fileName, options, filePath);
  }
  if (ext === '.json') {
    return parseJsonBuffer(buffer, fileName, options, filePath);
  }
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt' || ext === '') {
    const effectiveOptions: ParseOptions =
      ext === '.tsv' && (!options.delimiter || options.delimiter === 'auto')
        ? { ...options, delimiter: '\t' }
        : options;
    return parseCsvBuffer(buffer, fileName, effectiveOptions, filePath);
  }
  throw new Error(`Неподдерживаемый формат файла: ${ext}. Используйте .csv, .xlsx, .xls или .json.`);
}

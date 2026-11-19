import type {
  CellDefect,
  CellValue,
  ColumnDefectSummary,
  ColumnProfile,
  CriticalIssue,
  DataQualityScore,
  DateStats,
  DefectType,
  GetRowsRequest,
  GetRowsResponse,
  GridRow,
  HistogramBin,
  IssueSeverity,
  NumericStats,
  ParsedTable,
  ProfileReport,
  RowFilterMode,
  SemanticType
} from '../shared/types';
import {
  buildDateHistogram,
  buildNumericHistogram,
  computeNumericStats,
  computeQuantile,
  computeTopValues,
  formatCompactNumber
} from './statistics';
import {
  classifyPhone,
  detectWhitespaceDefect,
  inferColumnType,
  isBooleanToken,
  isMissingValue,
  isValidEmail,
  parseDateValue,
  parseNumericValue,
  type DateFormatKind,
  type PhoneStyle
} from './validators';

export const BIT_MISSING = 1;
export const BIT_DUPLICATE = 2;
export const BIT_OUTLIER = 4;
export const BIT_FORMAT_ERROR = 8;

export interface InternalColumnMeta {
  index: number;
  name: string;
  semanticType: SemanticType;
  dominantDateFormat?: DateFormatKind;
  dominantPhoneStyle?: PhoneStyle;
  dominantDecimalSeparator?: '.' | ',';
  hasMixedDecimalSeparators: boolean;
  numericStats?: NumericStats;
}

export interface ProfileSession {
  table: ParsedTable;
  report: ProfileReport;
  rowBitmasks: Uint16Array;
  duplicateRowSet: Set<number>;
  columnMeta: InternalColumnMeta[];
}

const DATE_FORMAT_LABELS: Record<DateFormatKind, string> = {
  ISO_DATE: 'YYYY-MM-DD',
  ISO_DATETIME: 'YYYY-MM-DD HH:mm:ss',
  RU_DOT_DATE: 'DD.MM.YYYY',
  RU_DOT_DATETIME: 'DD.MM.YYYY HH:mm:ss',
  SLASH_EU_DATE: 'DD/MM/YYYY',
  SLASH_US_DATE: 'MM/DD/YYYY',
  YYYY_SLASH_DATE: 'YYYY/MM/DD',
  SHORT_DOT_DATE: 'DD.MM.YY'
};

const PHONE_STYLE_LABELS: Record<PhoneStyle, string> = {
  E164_PLUS: '+7XXXXXXXXXX',
  PLUS_PARENS: '+7 (XXX) XXX-XX-XX',
  PLUS_DASHED: '+7-XXX-XXX-XX-XX',
  EIGHT_DASHED: '8-XXX-XXX-XX-XX',
  DIGITS_11: '8XXXXXXXXXX',
  OTHER_FORMATTED: 'Другой формат'
};

const DEFECT_LABELS: Record<DefectType, string> = {
  missing: 'Пропущенные значения',
  duplicate_row: 'Полные дубликаты строк',
  mixed_date_format: 'Смешанные форматы дат',
  invalid_date: 'Некорректные даты',
  invalid_email: 'Невалидные email',
  inconsistent_phone: 'Неединообразные телефоны',
  mixed_decimal_separator: 'Смешанные десятичные разделители (. и ,)',
  whitespace: 'Лишние пробелы и невидимые символы',
  outlier: 'Статистические выбросы (IQR)',
  type_mismatch: 'Несоответствие типу данных'
};

export function evaluateCellDefects(
  rawValue: CellValue,
  meta: InternalColumnMeta
): {
  defects: CellDefect[];
  isMissing: boolean;
  hasOutlier: boolean;
  hasFormatError: boolean;
  hasInvalid: boolean;
  hasInconsistent: boolean;
} {
  const defects: CellDefect[] = [];
  let hasOutlier = false;
  let hasFormatError = false;
  let hasInvalid = false;
  let hasInconsistent = false;

  if (isMissingValue(rawValue)) {
    const label =
      rawValue === null || rawValue === ''
        ? 'Пустое значение (NULL)'
        : `Маркер пропуска: «${rawValue.trim()}»`;
    defects.push({ type: 'missing', message: label, severity: 'warning' });
    return {
      defects,
      isMissing: true,
      hasOutlier: false,
      hasFormatError: false,
      hasInvalid: false,
      hasInconsistent: false
    };
  }

  const str = rawValue as string;
  const wsDefect = detectWhitespaceDefect(str);
  if (wsDefect) {
    defects.push({ type: 'whitespace', message: wsDefect, severity: 'warning' });
    hasInconsistent = true;
    hasFormatError = true;
  }

  const trimmed = str.trim();

  switch (meta.semanticType) {
    case 'integer':
    case 'float': {
      const parsed = parseNumericValue(trimmed);
      if (!parsed.valid || parsed.value === undefined) {
        defects.push({
          type: 'type_mismatch',
          message: `Ожидалось число, получено: «${trimmed}»`,
          severity: 'critical'
        });
        hasInvalid = true;
        hasFormatError = true;
      } else {
        if (parsed.isTextFormatted) {
          defects.push({
            type: 'type_mismatch',
            message: 'Число записано как текст (содержит пробелы разрядов или символ валюты)',
            severity: 'warning'
          });
          hasInvalid = true;
          hasFormatError = true;
        }
        if (
          meta.hasMixedDecimalSeparators &&
          parsed.decimalSeparator !== null &&
          meta.dominantDecimalSeparator &&
          parsed.decimalSeparator !== meta.dominantDecimalSeparator
        ) {
          defects.push({
            type: 'mixed_decimal_separator',
            message: `Десятичный разделитель «${parsed.decimalSeparator}» отличается от основного («${meta.dominantDecimalSeparator}»)`,
            severity: 'warning'
          });
          hasInconsistent = true;
          hasFormatError = true;
        }
        if (
          meta.numericStats &&
          meta.numericStats.count >= 8 &&
          meta.numericStats.iqr > 0 &&
          (parsed.value < meta.numericStats.lowerFence ||
            parsed.value > meta.numericStats.upperFence)
        ) {
          defects.push({
            type: 'outlier',
            message: `Выброс по IQR: ${formatCompactNumber(parsed.value)} вне диапазона [${formatCompactNumber(meta.numericStats.lowerFence)} .. ${formatCompactNumber(meta.numericStats.upperFence)}]`,
            severity: 'critical'
          });
          hasOutlier = true;
          hasInvalid = true;
        }
      }
      break;
    }

    case 'date':
    case 'datetime': {
      const parsed = parseDateValue(trimmed);
      if (!parsed.valid) {
        defects.push({
          type: 'invalid_date',
          message: `Невалидная дата или несуществующий календарный день: «${trimmed}»`,
          severity: 'critical'
        });
        hasInvalid = true;
        hasFormatError = true;
      } else if (
        meta.dominantDateFormat &&
        parsed.format &&
        parsed.format !== meta.dominantDateFormat
      ) {
        defects.push({
          type: 'mixed_date_format',
          message: `Смешанный формат даты (${DATE_FORMAT_LABELS[parsed.format]} вместо основного ${DATE_FORMAT_LABELS[meta.dominantDateFormat]})`,
          severity: 'warning'
        });
        hasInconsistent = true;
        hasFormatError = true;
      }
      break;
    }

    case 'email': {
      if (!isValidEmail(trimmed)) {
        defects.push({
          type: 'invalid_email',
          message: `Некорректный формат email: «${trimmed}»`,
          severity: 'critical'
        });
        hasInvalid = true;
        hasFormatError = true;
      }
      break;
    }

    case 'phone': {
      const phone = classifyPhone(trimmed);
      if (!phone.valid) {
        defects.push({
          type: 'inconsistent_phone',
          message: `Некорректный номер телефона (ожидается 10–15 цифр): «${trimmed}»`,
          severity: 'critical'
        });
        hasInvalid = true;
        hasFormatError = true;
      } else if (
        meta.dominantPhoneStyle &&
        phone.style &&
        phone.style !== meta.dominantPhoneStyle
      ) {
        defects.push({
          type: 'inconsistent_phone',
          message: `Формат телефона (${PHONE_STYLE_LABELS[phone.style]}) отличается от основного (${PHONE_STYLE_LABELS[meta.dominantPhoneStyle]})`,
          severity: 'warning'
        });
        hasInconsistent = true;
        hasFormatError = true;
      }
      break;
    }

    case 'boolean': {
      const headerHint = /^(is_|has_|flag|paid|active|enabled|оплачен|актив|статус_оплат)/.test(
        meta.name.toLowerCase()
      );
      if (!isBooleanToken(trimmed, headerHint || trimmed === '0' || trimmed === '1')) {
        defects.push({
          type: 'type_mismatch',
          message: `Ожидалось логическое значение (true/false, Да/Нет), получено: «${trimmed}»`,
          severity: 'warning'
        });
        hasInvalid = true;
        hasFormatError = true;
      }
      break;
    }

    default:
      break;
  }

  return {
    defects,
    isMissing: false,
    hasOutlier,
    hasFormatError,
    hasInvalid,
    hasInconsistent
  };
}

function formatIsoDateFromUtcMs(ms: number, hasTime: boolean): string {
  const d = new Date(ms);
  const datePart = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  if (!hasTime) return datePart;
  return `${datePart} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

export function profileTable(
  table: ParsedTable,
  onProgress?: (stage: string, percent: number) => void
): ProfileSession {
  const start = performance.now();
  const rowCount = table.rows.length;
  const colCount = table.headers.length;

  onProgress?.('Поиск полных дубликатов строк', 20);

  // 1. Exact duplicate rows
  const rowKeyToIndices = new Map<string, number[]>();
  for (let r = 0; r < rowCount; r++) {
    const row = table.rows[r];
    let key = '';
    for (let c = 0; c < colCount; c++) {
      const cell = row[c];
      key += (c > 0 ? '\u001F' : '') + (cell === null ? '\u0000' : cell);
    }
    const list = rowKeyToIndices.get(key);
    if (list) {
      list.push(r);
    } else {
      rowKeyToIndices.set(key, [r]);
    }
  }

  const duplicateRowSet = new Set<number>();
  let duplicateGroupCount = 0;
  let duplicateExtraRows = 0;

  for (const indices of rowKeyToIndices.values()) {
    if (indices.length > 1) {
      duplicateGroupCount++;
      duplicateExtraRows += indices.length - 1;
      for (const idx of indices) {
        duplicateRowSet.add(idx);
      }
    }
  }

  const rowBitmasks = new Uint16Array(rowCount);
  for (const idx of duplicateRowSet) {
    rowBitmasks[idx] |= BIT_DUPLICATE;
  }

  onProgress?.('Определение типов и статистик по столбцам', 45);

  // 2. Column inference and statistics
  const columnMeta: InternalColumnMeta[] = [];
  const columnProfiles: ColumnProfile[] = [];

  for (let c = 0; c < colCount; c++) {
    const colValues: CellValue[] = new Array(rowCount);
    for (let r = 0; r < rowCount; r++) {
      colValues[r] = table.rows[r][c] ?? null;
    }

    const inference = inferColumnType(table.headers[c], colValues);
    const freqMap = new Map<string, number>();
    const numericValues: number[] = [];
    const dateTimestamps: number[] = [];
    let missingCount = 0;
    let maxStringLength = 0;
    let hasNegativeNumbers = false;
    let maxDecimalScale = 0;
    let hasAnyTime = false;

    for (let r = 0; r < rowCount; r++) {
      const v = colValues[r];
      if (isMissingValue(v)) {
        missingCount++;
        continue;
      }
      const trimmed = (v as string).trim();
      if (trimmed.length > maxStringLength) maxStringLength = trimmed.length;
      freqMap.set(trimmed, (freqMap.get(trimmed) ?? 0) + 1);

      if (inference.semanticType === 'integer' || inference.semanticType === 'float') {
        const parsed = parseNumericValue(trimmed);
        if (parsed.valid && parsed.value !== undefined) {
          numericValues.push(parsed.value);
          if (parsed.value < 0) hasNegativeNumbers = true;
          if (parsed.decimalScale > maxDecimalScale) maxDecimalScale = parsed.decimalScale;
        }
      } else if (inference.semanticType === 'date' || inference.semanticType === 'datetime') {
        const parsed = parseDateValue(trimmed);
        if (parsed.valid && parsed.timestamp !== undefined) {
          dateTimestamps.push(parsed.timestamp);
          if (parsed.hasTime) hasAnyTime = true;
        }
      }
    }

    const numericStats =
      inference.semanticType === 'integer' || inference.semanticType === 'float'
        ? computeNumericStats(numericValues)
        : undefined;

    let dateStats: DateStats | undefined;
    if (
      (inference.semanticType === 'date' || inference.semanticType === 'datetime') &&
      dateTimestamps.length > 0
    ) {
      const sortedDates = Float64Array.from(dateTimestamps).sort();
      let sum = 0;
      for (let i = 0; i < sortedDates.length; i++) sum += sortedDates[i];
      dateStats = {
        count: sortedDates.length,
        minIso: formatIsoDateFromUtcMs(sortedDates[0], hasAnyTime),
        maxIso: formatIsoDateFromUtcMs(sortedDates[sortedDates.length - 1], hasAnyTime),
        medianIso: formatIsoDateFromUtcMs(computeQuantile(sortedDates, 0.5), hasAnyTime),
        meanIso: formatIsoDateFromUtcMs(sum / sortedDates.length, hasAnyTime)
      };
    }

    const meta: InternalColumnMeta = {
      index: c,
      name: table.headers[c],
      semanticType: inference.semanticType,
      dominantDateFormat: inference.dominantDateFormat,
      dominantPhoneStyle: inference.dominantPhoneStyle,
      dominantDecimalSeparator: inference.dominantDecimalSeparator,
      hasMixedDecimalSeparators: inference.hasMixedDecimalSeparators,
      numericStats
    };
    columnMeta.push(meta);

    const nonMissingCount = rowCount - missingCount;
    const topValues = computeTopValues(freqMap, nonMissingCount, 5);

    let histogram: HistogramBin[] = [];
    if (numericStats && numericValues.length > 0) {
      histogram = buildNumericHistogram(
        numericValues,
        numericStats.count >= 8 && numericStats.iqr > 0 ? numericStats.lowerFence : undefined,
        numericStats.count >= 8 && numericStats.iqr > 0 ? numericStats.upperFence : undefined
      );
    } else if (dateTimestamps.length > 0) {
      histogram = buildDateHistogram(dateTimestamps);
    } else {
      histogram = topValues.map((tv) => ({
        label: tv.value.length > 18 ? `${tv.value.slice(0, 16)}…` : tv.value,
        count: tv.count
      }));
    }

    columnProfiles.push({
      index: c,
      name: table.headers[c],
      semanticType: inference.semanticType,
      totalCount: rowCount,
      nonMissingCount,
      missingCount,
      missingPercent: rowCount > 0 ? Number(((missingCount / rowCount) * 100).toFixed(2)) : 0,
      uniqueCount: freqMap.size,
      uniquePercent:
        nonMissingCount > 0 ? Number(((freqMap.size / nonMissingCount) * 100).toFixed(2)) : 0,
      maxStringLength,
      hasNegativeNumbers,
      maxDecimalScale,
      numericStats,
      dateStats,
      topValues,
      histogram,
      defects: [],
      dominantDateFormat: inference.dominantDateFormat
        ? DATE_FORMAT_LABELS[inference.dominantDateFormat]
        : undefined,
      dominantPhoneStyle: inference.dominantPhoneStyle
        ? PHONE_STYLE_LABELS[inference.dominantPhoneStyle]
        : undefined,
      dominantDecimalSeparator: inference.dominantDecimalSeparator
    });
  }

  onProgress?.('Проверка ячеек и расчет Data Quality Score', 75);

  // 3. Evaluate all cells, build bitmasks & defect summaries
  let missingCellsTotal = 0;
  let nonMissingCellsTotal = 0;
  let invalidCellsTotal = 0;
  let inconsistentCellsTotal = 0;
  let totalAnomalies = duplicateExtraRows;

  const colDefectCounters = Array.from({ length: colCount }, () => new Map<
    DefectType,
    { count: number; severity: IssueSeverity; samples: string[] }
  >());

  for (let r = 0; r < rowCount; r++) {
    const row = table.rows[r];
    for (let c = 0; c < colCount; c++) {
      const val = row[c] ?? null;
      const evalRes = evaluateCellDefects(val, columnMeta[c]);

      if (evalRes.isMissing) {
        missingCellsTotal++;
        rowBitmasks[r] |= BIT_MISSING;
      } else {
        nonMissingCellsTotal++;
      }

      if (evalRes.hasOutlier) rowBitmasks[r] |= BIT_OUTLIER;
      if (evalRes.hasFormatError) rowBitmasks[r] |= BIT_FORMAT_ERROR;
      if (evalRes.hasInvalid) invalidCellsTotal++;
      if (evalRes.hasInconsistent) inconsistentCellsTotal++;

      if (evalRes.defects.length > 0) {
        for (const d of evalRes.defects) {
          if (d.type !== 'missing') totalAnomalies++;
          const map = colDefectCounters[c];
          const existing = map.get(d.type);
          const sampleText = val === null ? 'NULL' : val.trim();
          if (existing) {
            existing.count++;
            if (existing.samples.length < 3 && !existing.samples.includes(sampleText)) {
              existing.samples.push(sampleText);
            }
          } else {
            map.set(d.type, {
              count: 1,
              severity: d.severity,
              samples: [sampleText]
            });
          }
        }
      }
    }
  }

  totalAnomalies += missingCellsTotal;

  for (let c = 0; c < colCount; c++) {
    const summaries: ColumnDefectSummary[] = [];
    for (const [type, info] of colDefectCounters[c].entries()) {
      summaries.push({
        type,
        label: DEFECT_LABELS[type],
        count: info.count,
        severity: info.severity,
        sampleValues: info.samples
      });
    }
    summaries.sort((a, b) => b.count - a.count);
    columnProfiles[c].defects = summaries;
  }

  // 4. Filter counts
  const filterCounts: Record<RowFilterMode, number> = {
    all: rowCount,
    missing: 0,
    duplicates: 0,
    outliers: 0,
    format_errors: 0
  };
  for (let r = 0; r < rowCount; r++) {
    const mask = rowBitmasks[r];
    if (mask & BIT_MISSING) filterCounts.missing++;
    if (mask & BIT_DUPLICATE) filterCounts.duplicates++;
    if (mask & BIT_OUTLIER) filterCounts.outliers++;
    if (mask & BIT_FORMAT_ERROR) filterCounts.format_errors++;
  }

  // 5. Data Quality Score (0–100%)
  const totalCells = rowCount * colCount;
  const clampPct = (v: number) => Math.max(0, Math.min(100, Number(v.toFixed(1))));

  const completeness =
    totalCells > 0 ? clampPct((1 - missingCellsTotal / totalCells) * 100) : 100;
  const uniqueness =
    rowCount > 0 ? clampPct((1 - duplicateExtraRows / rowCount) * 100) : 100;
  const validity =
    nonMissingCellsTotal > 0
      ? clampPct((1 - invalidCellsTotal / nonMissingCellsTotal) * 100)
      : 100;
  const consistency =
    nonMissingCellsTotal > 0
      ? clampPct((1 - inconsistentCellsTotal / nonMissingCellsTotal) * 100)
      : 100;

  const overall = Number(
    (0.3 * completeness + 0.25 * uniqueness + 0.25 * validity + 0.2 * consistency).toFixed(1)
  );

  const grade: DataQualityScore['grade'] =
    overall >= 90
      ? 'Отлично'
      : overall >= 75
        ? 'Хорошо'
        : overall >= 55
          ? 'Требует внимания'
          : 'Критично';

  const score: DataQualityScore = {
    overall,
    completeness,
    uniqueness,
    validity,
    consistency,
    grade,
    details: {
      totalCells,
      missingCells: missingCellsTotal,
      totalRows: rowCount,
      duplicateExtraRows,
      nonMissingCells: nonMissingCellsTotal,
      invalidCells: invalidCellsTotal,
      inconsistentCells: inconsistentCellsTotal
    }
  };

  // 6. Critical Issues summary
  const criticalIssues: CriticalIssue[] = [];

  if (duplicateExtraRows > 0) {
    criticalIssues.push({
      id: 'issue_duplicates',
      severity: 'critical',
      title: `Обнаружены полные дубликаты строк (${duplicateExtraRows} лишних)`,
      description: `${duplicateRowSet.size} строк образуют ${duplicateGroupCount} дублирующихся групп.`,
      affectedRows: duplicateRowSet.size,
      recommendedFilter: 'duplicates'
    });
  }

  for (const col of columnProfiles) {
    for (const def of col.defects) {
      if (def.count === 0) continue;
      if (def.type === 'missing' && col.missingPercent < 1 && def.count < 5) continue;

      const recommendedFilter: RowFilterMode =
        def.type === 'missing'
          ? 'missing'
          : def.type === 'outlier'
            ? 'outliers'
            : 'format_errors';

      criticalIssues.push({
        id: `issue_${col.index}_${def.type}`,
        severity: def.severity,
        title: `${def.label} в столбце «${col.name}»`,
        description: `Затронуто значений: ${def.count}${def.sampleValues.length > 0 ? `. Примеры: ${def.sampleValues.join(', ')}` : ''}`,
        columnIndex: col.index,
        columnName: col.name,
        affectedRows: def.count,
        recommendedFilter
      });
    }
  }

  const severityWeight: Record<IssueSeverity, number> = {
    critical: 3,
    warning: 2,
    info: 1
  };
  criticalIssues.sort((a, b) => {
    const diff = severityWeight[b.severity] - severityWeight[a.severity];
    if (diff !== 0) return diff;
    return b.affectedRows - a.affectedRows;
  });

  onProgress?.('Готово', 100);

  const report: ProfileReport = {
    fileName: table.fileName,
    filePath: table.filePath,
    fileSizeBytes: table.fileSizeBytes,
    format: table.format,
    detectedEncoding: table.detectedEncoding,
    usedEncoding: table.usedEncoding,
    detectedDelimiter: table.detectedDelimiter,
    usedDelimiter: table.usedDelimiter,
    sheetNames: table.sheetNames,
    activeSheet: table.activeSheet,
    rowCount,
    columnCount: colCount,
    headers: table.headers,
    missingCellsTotal,
    missingPercentTotal:
      totalCells > 0 ? Number(((missingCellsTotal / totalCells) * 100).toFixed(2)) : 0,
    duplicateGroupCount,
    duplicateRowCount: duplicateRowSet.size,
    duplicateExtraRows,
    totalAnomalies,
    score,
    columns: columnProfiles,
    criticalIssues,
    filterCounts,
    profileTimeMs: Math.round(performance.now() - start)
  };

  return {
    table,
    report,
    rowBitmasks,
    duplicateRowSet,
    columnMeta
  };
}

function matchesRowFilter(
  mask: number,
  filter: RowFilterMode,
  row: CellValue[],
  columnIndex: number | undefined,
  columnMeta: InternalColumnMeta[]
): boolean {
  if (columnIndex === undefined) {
    switch (filter) {
      case 'all':
        return true;
      case 'missing':
        return (mask & BIT_MISSING) !== 0;
      case 'duplicates':
        return (mask & BIT_DUPLICATE) !== 0;
      case 'outliers':
        return (mask & BIT_OUTLIER) !== 0;
      case 'format_errors':
        return (mask & BIT_FORMAT_ERROR) !== 0;
    }
  }

  if (filter === 'duplicates') {
    return (mask & BIT_DUPLICATE) !== 0;
  }

  const meta = columnMeta[columnIndex];
  if (!meta) return false;
  const evalRes = evaluateCellDefects(row[columnIndex] ?? null, meta);

  switch (filter) {
    case 'all':
      return evalRes.defects.length > 0;
    case 'missing':
      return evalRes.isMissing;
    case 'outliers':
      return evalRes.hasOutlier;
    case 'format_errors':
      return evalRes.hasFormatError;
  }
}

export function querySessionRows(
  session: ProfileSession,
  req: GetRowsRequest
): GetRowsResponse {
  const { table, rowBitmasks, duplicateRowSet, columnMeta, report } = session;
  const totalRows = table.rows.length;
  const searchLower = req.search?.trim().toLowerCase() ?? '';
  const hasSearch = searchLower.length > 0;

  const matchedIndices: number[] = [];

  for (let r = 0; r < totalRows; r++) {
    const row = table.rows[r];
    if (!matchesRowFilter(rowBitmasks[r], req.filter, row, req.columnIndex, columnMeta)) {
      continue;
    }

    if (hasSearch) {
      let found = false;
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (val !== null && val.toLowerCase().includes(searchLower)) {
          found = true;
          break;
        }
      }
      if (!found) continue;
    }

    matchedIndices.push(r);
  }

  const offset = Math.max(0, req.offset);
  const limit = Math.max(1, Math.min(500, req.limit));
  const slice = matchedIndices.slice(offset, offset + limit);

  const rows: GridRow[] = slice.map((rowIndex) => {
    const rawRow = table.rows[rowIndex];
    const isDuplicate = duplicateRowSet.has(rowIndex);
    const mask = rowBitmasks[rowIndex];
    const cellDefects: Record<number, CellDefect[]> = {};

    for (let c = 0; c < columnMeta.length; c++) {
      const evalRes = evaluateCellDefects(rawRow[c] ?? null, columnMeta[c]);
      if (evalRes.defects.length > 0) {
        cellDefects[c] = evalRes.defects;
      }
    }

    return {
      rowIndex,
      cells: rawRow,
      isDuplicate,
      hasMissing: (mask & BIT_MISSING) !== 0,
      hasOutlier: (mask & BIT_OUTLIER) !== 0,
      hasFormatError: (mask & BIT_FORMAT_ERROR) !== 0,
      cellDefects
    };
  });

  return {
    totalFiltered: matchedIndices.length,
    offset,
    rows,
    filterCounts: report.filterCounts
  };
}

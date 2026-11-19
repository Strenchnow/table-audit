export type CellValue = string | null;

export type FileFormat = 'csv' | 'xlsx' | 'xls' | 'json' | 'demo';

export type SupportedEncoding = 'auto' | 'utf-8' | 'windows-1251' | 'utf-16le' | 'koi8-r';

export type CsvDelimiter = 'auto' | ',' | ';' | '\t';

export type SemanticType =
  | 'integer'
  | 'float'
  | 'date'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'boolean'
  | 'categorical'
  | 'string';

export type DefectType =
  | 'missing'
  | 'duplicate_row'
  | 'mixed_date_format'
  | 'invalid_date'
  | 'invalid_email'
  | 'inconsistent_phone'
  | 'mixed_decimal_separator'
  | 'whitespace'
  | 'outlier'
  | 'type_mismatch';

export type IssueSeverity = 'critical' | 'warning' | 'info';

export interface CellDefect {
  type: DefectType;
  message: string;
  severity: IssueSeverity;
}

export interface ParseOptions {
  encoding?: SupportedEncoding;
  delimiter?: CsvDelimiter;
  sheetName?: string;
}

export interface ParsedTable {
  fileName: string;
  filePath?: string;
  fileSizeBytes: number;
  format: FileFormat;
  detectedEncoding: string;
  usedEncoding: string;
  detectedDelimiter?: ',' | ';' | '\t';
  usedDelimiter?: ',' | ';' | '\t';
  sheetNames?: string[];
  activeSheet?: string;
  headers: string[];
  rows: CellValue[][];
  parseTimeMs: number;
}

export interface HistogramBin {
  label: string;
  count: number;
  isOutlierBin?: boolean;
}

export interface ValueFrequency {
  value: string;
  count: number;
  percent: number;
}

export interface NumericStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  q1: number;
  q3: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
  outlierCount: number;
}

export interface DateStats {
  count: number;
  minIso: string;
  maxIso: string;
  medianIso: string;
  meanIso: string;
}

export interface ColumnDefectSummary {
  type: DefectType;
  label: string;
  count: number;
  severity: IssueSeverity;
  sampleValues: string[];
}

export interface ColumnProfile {
  index: number;
  name: string;
  semanticType: SemanticType;
  totalCount: number;
  nonMissingCount: number;
  missingCount: number;
  missingPercent: number;
  uniqueCount: number;
  uniquePercent: number;
  maxStringLength: number;
  hasNegativeNumbers: boolean;
  maxDecimalScale: number;
  numericStats?: NumericStats;
  dateStats?: DateStats;
  topValues: ValueFrequency[];
  histogram: HistogramBin[];
  defects: ColumnDefectSummary[];
  dominantDateFormat?: string;
  dominantPhoneStyle?: string;
  dominantDecimalSeparator?: '.' | ',';
}

export interface DataQualityScore {
  overall: number;
  completeness: number;
  uniqueness: number;
  validity: number;
  consistency: number;
  grade: 'Отлично' | 'Хорошо' | 'Требует внимания' | 'Критично';
  details: {
    totalCells: number;
    missingCells: number;
    totalRows: number;
    duplicateExtraRows: number;
    nonMissingCells: number;
    invalidCells: number;
    inconsistentCells: number;
  };
}

export interface CriticalIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  columnIndex?: number;
  columnName?: string;
  affectedRows: number;
  recommendedFilter: RowFilterMode;
}

export interface ProfileReport {
  fileName: string;
  filePath?: string;
  fileSizeBytes: number;
  format: FileFormat;
  detectedEncoding: string;
  usedEncoding: string;
  detectedDelimiter?: ',' | ';' | '\t';
  usedDelimiter?: ',' | ';' | '\t';
  sheetNames?: string[];
  activeSheet?: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  missingCellsTotal: number;
  missingPercentTotal: number;
  duplicateGroupCount: number;
  duplicateRowCount: number;
  duplicateExtraRows: number;
  totalAnomalies: number;
  score: DataQualityScore;
  columns: ColumnProfile[];
  criticalIssues: CriticalIssue[];
  filterCounts: Record<RowFilterMode, number>;
  profileTimeMs: number;
}

export type RowFilterMode =
  | 'all'
  | 'missing'
  | 'duplicates'
  | 'outliers'
  | 'format_errors';

export interface GetRowsRequest {
  filter: RowFilterMode;
  offset: number;
  limit: number;
  columnIndex?: number;
  search?: string;
}

export interface GridRow {
  rowIndex: number;
  cells: CellValue[];
  isDuplicate: boolean;
  hasMissing: boolean;
  hasOutlier: boolean;
  hasFormatError: boolean;
  cellDefects: Record<number, CellDefect[]>;
}

export interface GetRowsResponse {
  totalFiltered: number;
  offset: number;
  rows: GridRow[];
  filterCounts: Record<RowFilterMode, number>;
}

export interface TableBMeta {
  fileName: string;
  filePath?: string;
  fileSizeBytes: number;
  format: FileFormat;
  detectedEncoding: string;
  usedEncoding: string;
  detectedDelimiter?: ',' | ';' | '\t';
  usedDelimiter?: ',' | ';' | '\t';
  sheetNames?: string[];
  activeSheet?: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
}

export interface ReconcileColumnPair {
  colA: string;
  colB: string;
}

export interface ReconcileRequest {
  keyColumnA: string;
  keyColumnB: string;
  compareColumns: ReconcileColumnPair[];
  trimKeys?: boolean;
}

export interface ReconcileSideRow {
  key: string;
  rowIndex: number;
  record: Record<string, CellValue>;
}

export interface ReconcileFieldDiff {
  column: string;
  valueA: CellValue;
  valueB: CellValue;
}

export interface ReconcileRowDiff {
  key: string;
  rowIndexA: number;
  rowIndexB: number;
  diffs: ReconcileFieldDiff[];
}

export interface ReconciliationResult {
  tableAName: string;
  tableBName: string;
  keyColumnA: string;
  keyColumnB: string;
  onlyInA: ReconcileSideRow[];
  onlyInB: ReconcileSideRow[];
  differences: ReconcileRowDiff[];
  duplicateKeysA: number;
  duplicateKeysB: number;
  summary: {
    totalA: number;
    totalB: number;
    matchedIdentical: number;
    matchedWithDiffs: number;
    onlyInACount: number;
    onlyInBCount: number;
  };
}

export type DdlDialect = 'postgresql' | 'sqlite';

export interface DdlOptions {
  dialect: DdlDialect;
  tableName?: string;
}

export interface DdlColumnPlan {
  originalName: string;
  sqlName: string;
  sqlType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  warnings: string[];
}

export interface DdlResult {
  dialect: DdlDialect;
  tableName: string;
  sql: string;
  warnings: string[];
  columns: DdlColumnPlan[];
}

export interface CleaningOptions {
  removeDuplicates: boolean;
  trimWhitespace: boolean;
  normalizeDatesIso: boolean;
  normalizeDecimalSeparators: boolean;
}

export interface CleaningChangeSample {
  rowIndex: number;
  columnName: string;
  before: CellValue;
  after: CellValue;
  reason: string;
}

export interface CleaningPreview {
  originalRows: number;
  resultingRows: number;
  duplicatesRemoved: number;
  cellsTrimmed: number;
  datesNormalized: number;
  decimalsNormalized: number;
  totalCellsChanged: number;
  samples: CleaningChangeSample[];
}

export interface WorkerProgressEvent {
  stage: string;
  percent: number;
}

export interface SaveFileResult {
  canceled: boolean;
  filePath?: string;
}

export interface OpenFileResult {
  canceled: boolean;
  filePath?: string;
}

export interface TableAuditApi {
  getPathForFile: (file: File) => string;
  openFileDialog: () => Promise<OpenFileResult>;
  saveFileDialog: (options: {
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => Promise<SaveFileResult>;
  loadFile: (filePath: string, options?: ParseOptions) => Promise<ProfileReport>;
  loadBuffer: (
    buffer: ArrayBuffer | Uint8Array,
    fileName: string,
    options?: ParseOptions
  ) => Promise<ProfileReport>;
  reparse: (options: ParseOptions) => Promise<ProfileReport>;
  loadDemo: () => Promise<ProfileReport>;
  getRows: (req: GetRowsRequest) => Promise<GetRowsResponse>;
  loadSecondFile: (filePath: string, options?: ParseOptions) => Promise<TableBMeta>;
  loadSecondBuffer: (
    buffer: ArrayBuffer | Uint8Array,
    fileName: string,
    options?: ParseOptions
  ) => Promise<TableBMeta>;
  reparseSecond: (options: ParseOptions) => Promise<TableBMeta>;
  reconcile: (req: ReconcileRequest) => Promise<ReconciliationResult>;
  generateDdl: (options: DdlOptions) => Promise<DdlResult>;
  previewClean: (options: CleaningOptions) => Promise<CleaningPreview>;
  exportCleaned: (
    options: CleaningOptions,
    format: 'csv' | 'xlsx',
    targetPath: string
  ) => Promise<{ filePath: string; rowsWritten: number }>;
  exportReport: (
    format: 'html' | 'md',
    dialect: DdlDialect,
    targetPath: string
  ) => Promise<{ filePath: string }>;
  exportSql: (
    options: DdlOptions,
    targetPath: string
  ) => Promise<{ filePath: string }>;
  onProgress: (callback: (event: WorkerProgressEvent) => void) => () => void;
}

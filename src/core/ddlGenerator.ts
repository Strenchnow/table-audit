import type {
  ColumnProfile,
  DdlColumnPlan,
  DdlDialect,
  DdlOptions,
  DdlResult,
  ProfileReport
} from '../shared/types';

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya'
};

export function toSqlIdentifier(rawName: string, fallback = 'col'): string {
  const withoutExt = rawName.trim();
  let transliterated = '';
  for (const ch of withoutExt.toLowerCase()) {
    if (ch in CYRILLIC_MAP) {
      transliterated += CYRILLIC_MAP[ch];
    } else {
      transliterated += ch;
    }
  }
  let normalized = transliterated
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) normalized = fallback;
  if (/^\d/.test(normalized)) normalized = `_${normalized}`;
  return normalized;
}

function mapSqlType(col: ColumnProfile, dialect: DdlDialect): string {
  if (dialect === 'sqlite') {
    switch (col.semanticType) {
      case 'integer':
        return 'INTEGER';
      case 'float':
        return 'REAL';
      case 'boolean':
        return 'INTEGER';
      default:
        return 'TEXT';
    }
  }

  // PostgreSQL
  switch (col.semanticType) {
    case 'integer': {
      const maxVal = col.numericStats?.max ?? 0;
      const minVal = col.numericStats?.min ?? 0;
      if (maxVal > 2_147_483_647 || minVal < -2_147_483_648) {
        return 'BIGINT';
      }
      return 'BIGINT';
    }
    case 'float': {
      const scale = Math.max(2, Math.min(6, col.maxDecimalScale || 2));
      return `NUMERIC(12, ${scale})`;
    }
    case 'date':
      return 'DATE';
    case 'datetime':
      return 'TIMESTAMP';
    case 'boolean':
      return 'BOOLEAN';
    case 'email':
      return `VARCHAR(${Math.max(255, Math.min(320, col.maxStringLength + 32))})`;
    case 'phone':
      return `VARCHAR(${Math.max(32, col.maxStringLength + 8)})`;
    case 'categorical': {
      const len = Math.max(32, Math.ceil((col.maxStringLength + 16) / 16) * 16);
      return `VARCHAR(${Math.min(255, len)})`;
    }
    default: {
      if (col.maxStringLength <= 120) {
        const len = Math.max(64, Math.ceil((col.maxStringLength + 32) / 32) * 32);
        return `VARCHAR(${len})`;
      }
      return 'TEXT';
    }
  }
}

export function generateDdl(profile: ProfileReport, options: DdlOptions): DdlResult {
  const dialect = options.dialect;
  const rawTableName = (options.tableName ?? profile.fileName).replace(/\.[a-z0-9]+$/i, '');
  const tableName = toSqlIdentifier(rawTableName, 'audit_table');

  const usedColNames = new Set<string>();
  const globalWarnings: string[] = [];

  if (profile.duplicateExtraRows > 0) {
    globalWarnings.push(
      `WARNING: В таблице найдено ${profile.duplicateExtraRows} полных дубликатов строк — проверьте ограничения PRIMARY KEY / UNIQUE перед импортом.`
    );
  }

  // Pick Primary Key candidate: 0 missing, 100% unique among non-empty rows, prefer id-like / integer
  let pkColIndex = -1;
  let bestPkScore = -1;
  for (const col of profile.columns) {
    if (col.missingCount === 0 && col.uniqueCount === profile.rowCount && profile.rowCount > 0) {
      const nameLower = col.name.toLowerCase();
      let score = 1;
      if (/(^|_)id$|_id$|^id_|код|номер/.test(nameLower)) score += 10;
      if (col.semanticType === 'integer') score += 5;
      if (col.index === 0) score += 2;
      if (score > bestPkScore) {
        bestPkScore = score;
        pkColIndex = col.index;
      }
    }
  }

  const columnPlans: DdlColumnPlan[] = [];
  const columnLines: string[] = [];
  const constraintLines: string[] = [];
  const commentBlocks: string[] = [];

  for (const col of profile.columns) {
    let sqlName = toSqlIdentifier(col.name, `col_${col.index + 1}`);
    if (usedColNames.has(sqlName)) {
      sqlName = `${sqlName}_${col.index + 1}`;
    }
    usedColNames.add(sqlName);

    const sqlType = mapSqlType(col, dialect);
    const nullable = col.missingCount > 0;
    const isPrimaryKey = col.index === pkColIndex;
    const isLikelyKeyName = /(^|_)id$|email|e-mail|phone|тел|sku|code/.test(
      col.name.toLowerCase()
    );
    const isUnique =
      !isPrimaryKey &&
      col.missingCount === 0 &&
      col.uniqueCount === profile.rowCount &&
      profile.rowCount > 0 &&
      isLikelyKeyName;

    const colWarnings: string[] = [];
    const nonUniqueDiff = col.nonMissingCount - col.uniqueCount;

    if (isLikelyKeyName && nonUniqueDiff > 0) {
      const msg = `WARNING: найдено ${nonUniqueDiff} дубликатов в столбце «${col.name}», PRIMARY KEY / UNIQUE-индекс упадет до очистки`;
      colWarnings.push(msg);
      globalWarnings.push(msg);
    }

    if (isLikelyKeyName && col.missingCount > 0) {
      const msg = `WARNING: в ключевом столбце «${col.name}» обнаружено ${col.missingCount} пропусков (NULL), NOT NULL / PRIMARY KEY не пройдет`;
      colWarnings.push(msg);
      globalWarnings.push(msg);
    }

    for (const def of col.defects) {
      if (
        def.type === 'mixed_date_format' ||
        def.type === 'invalid_date' ||
        def.type === 'mixed_decimal_separator' ||
        def.type === 'type_mismatch'
      ) {
        const msg = `WARNING: в столбце «${col.name}» — ${def.label.toLowerCase()} (${def.count} шт.), загрузка в ${sqlType} может завершиться ошибкой приведения типа`;
        colWarnings.push(msg);
        globalWarnings.push(msg);
      }
    }

    if (sqlName !== col.name) {
      commentBlocks.push(`-- Столбец ${sqlName} <- исходное имя: "${col.name}"`);
    }
    for (const w of colWarnings) {
      commentBlocks.push(`-- ${w}`);
    }

    let line = `  ${sqlName} ${sqlType}`;
    if (!nullable) line += ' NOT NULL';
    if (isPrimaryKey && dialect === 'sqlite') line += ' PRIMARY KEY';
    if (isUnique) line += ' UNIQUE';
    if (dialect === 'sqlite' && col.semanticType === 'boolean') {
      line += ` CHECK (${sqlName} IN (0, 1))`;
    }

    columnLines.push(line);
    if (isPrimaryKey && dialect === 'postgresql') {
      constraintLines.push(`  CONSTRAINT pk_${tableName} PRIMARY KEY (${sqlName})`);
    }

    columnPlans.push({
      originalName: col.name,
      sqlName,
      sqlType,
      nullable,
      isPrimaryKey,
      isUnique,
      warnings: colWarnings
    });
  }

  const lines: string[] = [];
  lines.push(
    `-- Сгенерировано TableAudit (${dialect === 'postgresql' ? 'PostgreSQL' : 'SQLite'})`
  );
  lines.push(`-- Источник: ${profile.fileName} (${profile.rowCount} строк, DQ Score: ${profile.score.overall}%)`);

  const uniqueGlobalWarnings = Array.from(new Set(globalWarnings));
  if (uniqueGlobalWarnings.length > 0) {
    lines.push('--');
    for (const w of uniqueGlobalWarnings) {
      lines.push(`-- ${w}`);
    }
  }
  const extraComments = Array.from(new Set(commentBlocks)).filter(
    (cb) => !lines.includes(cb)
  );
  if (extraComments.length > 0) {
    lines.push('--');
    for (const cb of extraComments) {
      lines.push(cb);
    }
  }

  lines.push('');
  lines.push(`CREATE TABLE ${tableName} (`);
  const allDefs = [...columnLines, ...constraintLines];
  for (let i = 0; i < allDefs.length; i++) {
    const suffix = i < allDefs.length - 1 ? ',' : '';
    lines.push(`${allDefs[i]}${suffix}`);
  }
  lines.push(');');

  return {
    dialect,
    tableName,
    sql: lines.join('\n'),
    warnings: Array.from(new Set(globalWarnings)),
    columns: columnPlans
  };
}

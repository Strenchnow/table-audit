import type { CellValue, SemanticType } from '../shared/types';

const MISSING_TOKENS = new Set([
  '',
  'n/a',
  'na',
  'null',
  'none',
  'nil',
  'nan',
  '-',
  '—',
  '–',
  '--',
  'н/д',
  'н.д.',
  'n.a.',
  '#n/a',
  '#н/д'
]);

const BOOLEAN_TRUE_TOKENS = new Set(['true', 'yes', 'да', 't', 'y']);
const BOOLEAN_FALSE_TOKENS = new Set(['false', 'no', 'нет', 'f', 'n']);

const EMAIL_STRICT_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isMissingValue(value: CellValue): boolean {
  if (value === null || value === undefined) return true;
  const trimmed = value.trim().toLowerCase();
  return MISSING_TOKENS.has(trimmed);
}

export function detectWhitespaceDefect(value: CellValue): string | null {
  if (value === null || value === undefined || value.length === 0) return null;
  if (isMissingValue(value)) return null;

  const hasEdgeSpaces = /^\s|\s$/.test(value);
  const hasInvisible = /[\u00A0\u200B-\u200D\uFEFF\u00AD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(
    value
  );

  if (hasEdgeSpaces && hasInvisible) {
    return 'Лишние пробелы по краям и невидимые спецсимволы (NBSP / zero-width)';
  }
  if (hasInvisible) {
    return 'Обнаружены невидимые спецсимволы (неразрывный пробел или zero-width)';
  }
  if (hasEdgeSpaces) {
    return 'Лишние пробелы в начале или конце строки';
  }
  return null;
}

export type DateFormatKind =
  | 'ISO_DATE'
  | 'ISO_DATETIME'
  | 'RU_DOT_DATE'
  | 'RU_DOT_DATETIME'
  | 'SLASH_EU_DATE'
  | 'SLASH_US_DATE'
  | 'YYYY_SLASH_DATE'
  | 'SHORT_DOT_DATE';

export interface ParsedDateResult {
  valid: boolean;
  isDateLike: boolean;
  format?: DateFormatKind;
  timestamp?: number;
  isoDate?: string;
  isoDateTime?: string;
  hasTime: boolean;
}

function isRealCalendarDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseDateValue(raw: string): ParsedDateResult {
  const s = raw.trim();
  if (!s) return { valid: false, isDateLike: false, hasTime: false };

  // 1. ISO Date or Datetime: YYYY-MM-DD([T ]HH:mm(:ss)?)?
  let m = s.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
  );
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hasTime = m[4] !== undefined;
    const hour = hasTime ? Number(m[4]) : 0;
    const min = hasTime ? Number(m[5]) : 0;
    const sec = m[6] ? Number(m[6]) : 0;
    if (!isRealCalendarDate(year, month, day, hour, min, sec)) {
      return {
        valid: false,
        isDateLike: true,
        format: hasTime ? 'ISO_DATETIME' : 'ISO_DATE',
        hasTime
      };
    }
    const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;
    const isoDateTime = hasTime
      ? `${isoDate} ${pad2(hour)}:${pad2(min)}:${pad2(sec)}`
      : isoDate;
    return {
      valid: true,
      isDateLike: true,
      format: hasTime ? 'ISO_DATETIME' : 'ISO_DATE',
      timestamp: Date.UTC(year, month - 1, day, hour, min, sec),
      isoDate,
      isoDateTime,
      hasTime
    };
  }

  // 2. RU Dot Date or Datetime: DD.MM.YYYY( HH:mm(:ss)?)?
  m = s.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hasTime = m[4] !== undefined;
    const hour = hasTime ? Number(m[4]) : 0;
    const min = hasTime ? Number(m[5]) : 0;
    const sec = m[6] ? Number(m[6]) : 0;
    if (!isRealCalendarDate(year, month, day, hour, min, sec)) {
      return {
        valid: false,
        isDateLike: true,
        format: hasTime ? 'RU_DOT_DATETIME' : 'RU_DOT_DATE',
        hasTime
      };
    }
    const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;
    const isoDateTime = hasTime
      ? `${isoDate} ${pad2(hour)}:${pad2(min)}:${pad2(sec)}`
      : isoDate;
    return {
      valid: true,
      isDateLike: true,
      format: hasTime ? 'RU_DOT_DATETIME' : 'RU_DOT_DATE',
      timestamp: Date.UTC(year, month - 1, day, hour, min, sec),
      isoDate,
      isoDateTime,
      hasTime
    };
  }

  // 3. YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!isRealCalendarDate(year, month, day)) {
      return { valid: false, isDateLike: true, format: 'YYYY_SLASH_DATE', hasTime: false };
    }
    const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;
    return {
      valid: true,
      isDateLike: true,
      format: 'YYYY_SLASH_DATE',
      timestamp: Date.UTC(year, month - 1, day),
      isoDate,
      isoDateTime: isoDate,
      hasTime: false
    };
  }

  // 4. DD/MM/YYYY or MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3]);

    // Prefer DD/MM/YYYY unless second > 12 and first <= 12 (US format)
    if (second > 12 && first <= 12 && isRealCalendarDate(year, first, second)) {
      const isoDate = `${year}-${pad2(first)}-${pad2(second)}`;
      return {
        valid: true,
        isDateLike: true,
        format: 'SLASH_US_DATE',
        timestamp: Date.UTC(year, first - 1, second),
        isoDate,
        isoDateTime: isoDate,
        hasTime: false
      };
    }

    if (isRealCalendarDate(year, second, first)) {
      const isoDate = `${year}-${pad2(second)}-${pad2(first)}`;
      return {
        valid: true,
        isDateLike: true,
        format: 'SLASH_EU_DATE',
        timestamp: Date.UTC(year, second - 1, first),
        isoDate,
        isoDateTime: isoDate,
        hasTime: false
      };
    }

    return { valid: false, isDateLike: true, format: 'SLASH_EU_DATE', hasTime: false };
  }

  // 5. Short DD.MM.YY
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const yy = Number(m[3]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    if (!isRealCalendarDate(year, month, day)) {
      return { valid: false, isDateLike: true, format: 'SHORT_DOT_DATE', hasTime: false };
    }
    const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;
    return {
      valid: true,
      isDateLike: true,
      format: 'SHORT_DOT_DATE',
      timestamp: Date.UTC(year, month - 1, day),
      isoDate,
      isoDateTime: isoDate,
      hasTime: false
    };
  }

  return { valid: false, isDateLike: false, hasTime: false };
}

export function isValidEmail(raw: string): boolean {
  const s = raw.trim();
  if (s.length > 254 || s.includes(' ')) return false;
  return EMAIL_STRICT_REGEX.test(s);
}

export function isEmailLike(raw: string): boolean {
  const s = raw.trim();
  return s.includes('@') || /^[^\s]+@/.test(s);
}

export type PhoneStyle =
  | 'E164_PLUS'
  | 'PLUS_PARENS'
  | 'PLUS_DASHED'
  | 'EIGHT_DASHED'
  | 'DIGITS_11'
  | 'OTHER_FORMATTED';

export interface PhoneClassification {
  valid: boolean;
  isPhoneLike: boolean;
  style?: PhoneStyle;
  digits: string;
}

export function classifyPhone(raw: string): PhoneClassification {
  const s = raw.trim();
  if (!s) return { valid: false, isPhoneLike: false, digits: '' };

  // Avoid confusing decimals, ISO dates, or emails with phones
  if (s.includes('@') || /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d+[.,]\d+$/.test(s)) {
    return { valid: false, isPhoneLike: false, digits: '' };
  }

  if (/[^0-9+\-() \u00A0.]/.test(s)) {
    return { valid: false, isPhoneLike: false, digits: '' };
  }

  const digits = s.replace(/\D/g, '');
  const hasPhoneDecorators = /[+()]/.test(s) || (s.match(/[-\s]/g)?.length ?? 0) >= 2;
  const isPhoneLike =
    hasPhoneDecorators ? digits.length >= 6 : digits.length >= 10 && digits.length <= 15;

  if (!isPhoneLike) {
    return { valid: false, isPhoneLike: false, digits };
  }

  if (digits.length < 10 || digits.length > 15) {
    return { valid: false, isPhoneLike: true, digits };
  }

  let style: PhoneStyle = 'OTHER_FORMATTED';
  if (/^\+\d{10,15}$/.test(s)) {
    style = 'E164_PLUS';
  } else if (/^\+\d[\s\u00A0]?\(\d{3,4}\)[\s\u00A0]?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/.test(s)) {
    style = 'PLUS_PARENS';
  } else if (/^\+\d+[-\s]\d+[-\s]\d+/.test(s)) {
    style = 'PLUS_DASHED';
  } else if (/^8-\d{3}-\d{3}-\d{2}-\d{2}$/.test(s)) {
    style = 'EIGHT_DASHED';
  } else if (/^[78]\d{10}$/.test(s)) {
    style = 'DIGITS_11';
  }

  return { valid: true, isPhoneLike: true, style, digits };
}

export function isBooleanToken(raw: string, allowZeroOne = false): boolean {
  const lower = raw.trim().toLowerCase();
  if (BOOLEAN_TRUE_TOKENS.has(lower) || BOOLEAN_FALSE_TOKENS.has(lower)) return true;
  if (allowZeroOne && (lower === '0' || lower === '1')) return true;
  return false;
}

export interface ParsedNumericResult {
  valid: boolean;
  value?: number;
  isInteger: boolean;
  decimalSeparator: '.' | ',' | null;
  isTextFormatted: boolean;
  hasLeadingZeroCode: boolean;
  decimalScale: number;
}

export function parseNumericValue(raw: string): ParsedNumericResult {
  const s = raw.trim();
  if (!s) {
    return {
      valid: false,
      isInteger: false,
      decimalSeparator: null,
      isTextFormatted: false,
      hasLeadingZeroCode: false,
      decimalScale: 0
    };
  }

  // Detect leading-zero codes like "00412" or "0123" (not "0" and not "0.5")
  if (/^0\d+$/.test(s)) {
    return {
      valid: false,
      isInteger: false,
      decimalSeparator: null,
      isTextFormatted: false,
      hasLeadingZeroCode: true,
      decimalScale: 0
    };
  }

  // Clean integer
  if (/^[+-]?\d+$/.test(s)) {
    const num = Number(s);
    if (Number.isFinite(num)) {
      return {
        valid: true,
        value: num,
        isInteger: true,
        decimalSeparator: null,
        isTextFormatted: false,
        hasLeadingZeroCode: false,
        decimalScale: 0
      };
    }
  }

  // Clean dot float
  if (/^[+-]?\d+\.\d+$/.test(s)) {
    const num = Number(s);
    if (Number.isFinite(num)) {
      const frac = s.split('.')[1] ?? '';
      return {
        valid: true,
        value: num,
        isInteger: false,
        decimalSeparator: '.',
        isTextFormatted: false,
        hasLeadingZeroCode: false,
        decimalScale: frac.length
      };
    }
  }

  // Comma decimal float like "12450,50"
  if (/^[+-]?\d+,\d+$/.test(s)) {
    const normalized = s.replace(',', '.');
    const num = Number(normalized);
    if (Number.isFinite(num)) {
      const frac = s.split(',')[1] ?? '';
      return {
        valid: true,
        value: num,
        isInteger: false,
        decimalSeparator: ',',
        isTextFormatted: false,
        hasLeadingZeroCode: false,
        decimalScale: frac.length
      };
    }
  }

  // Text-formatted numbers with currency symbols and/or space/NBSP/comma thousand separators:
  // Examples: "15 400 ₽", "$1,200.50", "15 400,50 руб.", "1 200 000"
  const currencyStripped = s
    .replace(/[₽$€£¥]/g, '')
    .replace(/\b(руб\.?|rub|usd|eur)\b/gi, '')
    .trim();

  if (
    currencyStripped !== s ||
    /^[+-]?\d{1,3}(?:[\s\u00A0]\d{3})+(?:[.,]\d+)?$/.test(currencyStripped) ||
    /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(currencyStripped)
  ) {
    let cleaned = currencyStripped.replace(/[\s\u00A0]/g, '');
    let decSep: '.' | ',' | null = null;

    if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(cleaned)) {
      // US thousand commas: 1,200.50 -> 1200.50
      if (cleaned.includes('.')) decSep = '.';
      cleaned = cleaned.replace(/,/g, '');
    } else if (/^[+-]?\d+,\d{1,2}$/.test(cleaned)) {
      decSep = ',';
      cleaned = cleaned.replace(',', '.');
    } else if (/^[+-]?\d+\.\d+$/.test(cleaned)) {
      decSep = '.';
    }

    if (/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) {
      const num = Number(cleaned);
      if (Number.isFinite(num)) {
        const isInt = !cleaned.includes('.');
        const scale = isInt ? 0 : (cleaned.split('.')[1]?.length ?? 0);
        return {
          valid: true,
          value: num,
          isInteger: isInt,
          decimalSeparator: decSep,
          isTextFormatted: true,
          hasLeadingZeroCode: false,
          decimalScale: scale
        };
      }
    }
  }

  return {
    valid: false,
    isInteger: false,
    decimalSeparator: null,
    isTextFormatted: false,
    hasLeadingZeroCode: false,
    decimalScale: 0
  };
}

export interface ColumnTypeInference {
  semanticType: SemanticType;
  dominantDateFormat?: DateFormatKind;
  dominantPhoneStyle?: PhoneStyle;
  dominantDecimalSeparator?: '.' | ',';
  hasMixedDecimalSeparators: boolean;
}

export function inferColumnType(header: string, values: CellValue[]): ColumnTypeInference {
  const nonMissing: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isMissingValue(v) && v !== null) {
      nonMissing.push(v.trim());
    }
  }

  const total = nonMissing.length;
  if (total === 0) {
    return { semanticType: 'string', hasMixedDecimalSeparators: false };
  }

  const headerLower = header.toLowerCase();
  const boolHeaderHint = /^(is_|has_|flag|paid|active|enabled|оплачен|актив|статус_оплат)/.test(
    headerLower
  );

  let boolCount = 0;
  let emailLikeCount = 0;
  let emailValidCount = 0;
  let dateValidCount = 0;
  let dateLikeCount = 0;
  let datetimeCount = 0;
  const dateFormatCounts = new Map<DateFormatKind, number>();

  let phoneLikeCount = 0;
  let phoneValidCount = 0;
  const phoneStyleCounts = new Map<PhoneStyle, number>();

  let numValidCount = 0;
  let intCount = 0;
  let dotCount = 0;
  let commaCount = 0;
  let leadingZeroCodeCount = 0;

  const distinctValues = new Set<string>();

  for (let i = 0; i < total; i++) {
    const s = nonMissing[i];
    distinctValues.add(s);

    if (isBooleanToken(s, boolHeaderHint)) boolCount++;

    if (isEmailLike(s)) {
      emailLikeCount++;
      if (isValidEmail(s)) emailValidCount++;
    }

    const d = parseDateValue(s);
    if (d.isDateLike) {
      dateLikeCount++;
      if (d.valid && d.format) {
        dateValidCount++;
        if (d.hasTime) datetimeCount++;
        dateFormatCounts.set(d.format, (dateFormatCounts.get(d.format) ?? 0) + 1);
      }
    }

    const p = classifyPhone(s);
    if (p.isPhoneLike) {
      phoneLikeCount++;
      if (p.valid && p.style) {
        phoneValidCount++;
        phoneStyleCounts.set(p.style, (phoneStyleCounts.get(p.style) ?? 0) + 1);
      }
    }

    const n = parseNumericValue(s);
    if (n.hasLeadingZeroCode) {
      leadingZeroCodeCount++;
    } else if (n.valid) {
      numValidCount++;
      if (n.isInteger) intCount++;
      if (n.decimalSeparator === '.') dotCount++;
      if (n.decimalSeparator === ',') commaCount++;
    }
  }

  // Priority 1: Boolean
  if (boolCount / total >= 0.85) {
    return { semanticType: 'boolean', hasMixedDecimalSeparators: false };
  }

  // Priority 2: Email
  if (
    emailLikeCount / total >= 0.6 &&
    (emailValidCount / total >= 0.5 || /mail|почт/.test(headerLower))
  ) {
    return { semanticType: 'email', hasMixedDecimalSeparators: false };
  }

  // Priority 3: Phone
  const phoneHeaderHint = /phone|tel|mobile|тел|фон/.test(headerLower);
  if (
    (phoneLikeCount / total >= 0.65 && phoneValidCount / total >= 0.45) ||
    (phoneHeaderHint && phoneLikeCount / total >= 0.4)
  ) {
    let dominantPhoneStyle: PhoneStyle | undefined;
    let maxStyleCount = -1;
    for (const [style, cnt] of phoneStyleCounts.entries()) {
      if (cnt > maxStyleCount) {
        maxStyleCount = cnt;
        dominantPhoneStyle = style;
      }
    }
    return {
      semanticType: 'phone',
      dominantPhoneStyle,
      hasMixedDecimalSeparators: false
    };
  }

  // Priority 4: Date / Datetime
  if (dateLikeCount / total >= 0.65 && dateValidCount / total >= 0.5) {
    let dominantDateFormat: DateFormatKind | undefined;
    let maxFmtCount = -1;
    for (const [fmt, cnt] of dateFormatCounts.entries()) {
      if (cnt > maxFmtCount) {
        maxFmtCount = cnt;
        dominantDateFormat = fmt;
      }
    }
    return {
      semanticType: datetimeCount > dateValidCount * 0.2 ? 'datetime' : 'date',
      dominantDateFormat,
      hasMixedDecimalSeparators: false
    };
  }

  // Priority 5: Numeric (integer / float), skip if mostly leading-zero codes
  if (leadingZeroCodeCount / total <= 0.1 && numValidCount / total >= 0.75) {
    const hasMixedDecimalSeparators = dotCount > 0 && commaCount > 0;
    const dominantDecimalSeparator: '.' | ',' | undefined =
      dotCount === 0 && commaCount === 0
        ? undefined
        : dotCount >= commaCount
          ? '.'
          : ',';

    const isPureInt = intCount === numValidCount && dotCount === 0 && commaCount === 0;
    return {
      semanticType: isPureInt ? 'integer' : 'float',
      dominantDecimalSeparator,
      hasMixedDecimalSeparators
    };
  }

  // Priority 6: Categorical (low cardinality)
  const uniqueRatio = distinctValues.size / total;
  if (
    distinctValues.size >= 1 &&
    ((distinctValues.size <= 25 && total >= 15 && uniqueRatio <= 0.5) ||
      (distinctValues.size <= 12 && uniqueRatio <= 0.45))
  ) {
    return { semanticType: 'categorical', hasMixedDecimalSeparators: false };
  }

  // Priority 7: String
  return { semanticType: 'string', hasMixedDecimalSeparators: false };
}

import chardet from 'chardet';
import iconv from 'iconv-lite';
import type { SupportedEncoding } from '../shared/types';

export interface EncodingDetectionResult {
  encoding: 'utf-8' | 'windows-1251' | 'utf-16le' | 'utf-16be' | 'koi8-r';
  confidence: number;
  hasBom: boolean;
}

const SAMPLE_LIMIT = 65536;

// Frequently occurring lowercase Cyrillic letters in Windows-1251 (о, е, а, и, н, т, с, р, в, л, к, м)
const CP1251_FREQ_BYTES = new Set([
  0xee, 0xe5, 0xe0, 0xe8, 0xed, 0xf2, 0xf1, 0xf0, 0xe2, 0xeb, 0xea, 0xec
]);

// Frequently occurring lowercase Cyrillic letters in KOI8-R (о, е, а, и, н, т, с, р, в, л, к, м)
const KOI8R_FREQ_BYTES = new Set([
  0xcf, 0xc5, 0xc1, 0xc9, 0xce, 0xd4, 0xd3, 0xd2, 0xd7, 0xcc, 0xcb, 0xcd
]);

function isStrictUtf8(slice: Uint8Array): boolean {
  // Trim trailing incomplete multi-byte UTF-8 sequence if slice hit buffer boundary
  let end = slice.length;
  if (end === SAMPLE_LIMIT) {
    let tail = end - 1;
    while (tail >= Math.max(0, end - 4) && (slice[tail] & 0xc0) === 0x80) {
      tail--;
    }
    if (tail >= 0 && slice[tail] >= 0xc0) {
      const b = slice[tail];
      const expectedLen =
        (b & 0xe0) === 0xc0 ? 2 : (b & 0xf0) === 0xe0 ? 3 : (b & 0xf8) === 0xf0 ? 4 : 1;
      if (tail + expectedLen > end) {
        end = tail;
      }
    }
  }

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(slice.subarray(0, end));
    return true;
  } catch {
    return false;
  }
}

function scoreCp1251VsKoi8r(slice: Uint8Array): { cp1251Score: number; koi8rScore: number; highByteCount: number } {
  let highByteCount = 0;
  let cp1251Letters = 0;
  let cp1251Freq = 0;
  let cp1251LowerAfterUpperOrLower = 0;
  let koi8rFreq = 0;
  let koi8rLower = 0;

  for (let i = 0; i < slice.length; i++) {
    const b = slice[i];
    if (b < 0x80) continue;
    highByteCount++;

    // Windows-1251 Russian letters: А-Я (0xC0..0xDF), а-я (0xE0..0xFF), Ё (0xA8), ё (0xB8)
    if ((b >= 0xc0 && b <= 0xff) || b === 0xa8 || b === 0xb8) {
      cp1251Letters++;
      if (CP1251_FREQ_BYTES.has(b)) cp1251Freq++;
      if (b >= 0xe0 && b <= 0xff && i > 0) {
        const prev = slice[i - 1];
        if ((prev >= 0xc0 && prev <= 0xff) || prev === 0xa8 || prev === 0xb8) {
          cp1251LowerAfterUpperOrLower++;
        }
      }
    }

    // KOI8-R lowercase letters live in 0xC0..0xDF, uppercase in 0xE0..0xFF
    if (b >= 0xc0 && b <= 0xdf) {
      koi8rLower++;
      if (KOI8R_FREQ_BYTES.has(b)) koi8rFreq++;
    }
  }

  if (highByteCount === 0) {
    return { cp1251Score: 0, koi8rScore: 0, highByteCount: 0 };
  }

  const cp1251Score =
    (cp1251Letters / highByteCount) * 0.45 +
    (cp1251Freq / highByteCount) * 0.35 +
    (cp1251LowerAfterUpperOrLower / highByteCount) * 0.2;

  const koi8rScore =
    (koi8rLower / highByteCount) * 0.5 + (koi8rFreq / highByteCount) * 0.5;

  return { cp1251Score, koi8rScore, highByteCount };
}

function normalizeChardetName(
  detected: string | null
): EncodingDetectionResult['encoding'] | null {
  if (!detected) return null;
  const lower = detected.toLowerCase();
  if (lower.includes('utf-8') || lower === 'ascii') return 'utf-8';
  if (lower.includes('1251') || lower === 'cp1251') return 'windows-1251';
  if (lower.includes('koi8-r') || lower === 'koi8') return 'koi8-r';
  if (lower.includes('utf-16le')) return 'utf-16le';
  if (lower.includes('utf-16be')) return 'utf-16be';
  return null;
}

export function detectEncoding(buffer: Uint8Array): EncodingDetectionResult {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: 'utf-8', confidence: 1, hasBom: true };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { encoding: 'utf-16le', confidence: 1, hasBom: true };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { encoding: 'utf-16be', confidence: 1, hasBom: true };
  }

  const slice = buffer.subarray(0, Math.min(buffer.length, SAMPLE_LIMIT));
  let hasHighBytes = false;
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] >= 0x80) {
      hasHighBytes = true;
      break;
    }
  }

  if (!hasHighBytes) {
    return { encoding: 'utf-8', confidence: 1, hasBom: false };
  }

  if (isStrictUtf8(slice)) {
    return { encoding: 'utf-8', confidence: 0.99, hasBom: false };
  }

  const chardetMatches = chardet.analyse(slice);
  const topChardet = chardetMatches.length > 0 ? chardetMatches[0] : null;
  const normalizedTop = normalizeChardetName(topChardet?.name ?? null);

  if (normalizedTop === 'utf-16le' || normalizedTop === 'utf-16be') {
    return {
      encoding: normalizedTop,
      confidence: (topChardet?.confidence ?? 80) / 100,
      hasBom: false
    };
  }

  const { cp1251Score, koi8rScore } = scoreCp1251VsKoi8r(slice);

  if (normalizedTop === 'windows-1251' || (cp1251Score >= 0.45 && cp1251Score >= koi8rScore)) {
    return {
      encoding: 'windows-1251',
      confidence: Math.max(0.75, Math.min(0.98, cp1251Score + 0.15)),
      hasBom: false
    };
  }

  if (normalizedTop === 'koi8-r' || koi8rScore > cp1251Score + 0.1) {
    return {
      encoding: 'koi8-r',
      confidence: Math.max(0.7, Math.min(0.95, koi8rScore + 0.1)),
      hasBom: false
    };
  }

  // Fallback for Western-like single-byte files or ambiguous Russian bytes: prefer windows-1251 if any Cyrillic pattern exists
  if (cp1251Score > 0.25) {
    return { encoding: 'windows-1251', confidence: 0.7, hasBom: false };
  }

  return {
    encoding: normalizedTop ?? 'windows-1251',
    confidence: topChardet ? topChardet.confidence / 100 : 0.5,
    hasBom: false
  };
}

export function decodeBuffer(
  buffer: Uint8Array,
  preferred: SupportedEncoding = 'auto'
): { text: string; detectedEncoding: string; usedEncoding: string } {
  const detected = detectEncoding(buffer);
  const usedEncoding = preferred === 'auto' ? detected.encoding : preferred;

  const iconvName =
    usedEncoding === 'windows-1251'
      ? 'win1251'
      : usedEncoding === 'utf-16le'
        ? 'utf16-le'
        : usedEncoding === 'utf-16be'
          ? 'utf16-be'
          : usedEncoding;

  let text = iconv.decode(Buffer.from(buffer), iconvName);
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  return {
    text,
    detectedEncoding: detected.encoding,
    usedEncoding
  };
}

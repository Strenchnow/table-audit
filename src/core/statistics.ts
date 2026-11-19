import type { HistogramBin, NumericStats, ValueFrequency } from '../shared/types';

export function computeQuantile(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function computeNumericStats(values: number[]): NumericStats {
  const count = values.length;
  if (count === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      lowerFence: 0,
      upperFence: 0,
      outlierCount: 0
    };
  }

  const sorted = Float64Array.from(values).sort();
  const min = sorted[0];
  const max = sorted[count - 1];

  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += sorted[i];
  }
  const mean = sum / count;

  let sqDiffSum = 0;
  for (let i = 0; i < count; i++) {
    const diff = sorted[i] - mean;
    sqDiffSum += diff * diff;
  }
  const stdDev = Math.sqrt(sqDiffSum / count);

  const median = computeQuantile(sorted, 0.5);
  const q1 = computeQuantile(sorted, 0.25);
  const q3 = computeQuantile(sorted, 0.75);
  const iqr = q3 - q1;

  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  let outlierCount = 0;
  if (count >= 8 && iqr > 0) {
    for (let i = 0; i < count; i++) {
      if (sorted[i] < lowerFence || sorted[i] > upperFence) {
        outlierCount++;
      }
    }
  }

  return {
    count,
    min,
    max,
    mean,
    median,
    stdDev,
    q1,
    q3,
    iqr,
    lowerFence,
    upperFence,
    outlierCount
  };
}

export function buildNumericHistogram(
  values: number[],
  lowerFence?: number,
  upperFence?: number
): HistogramBin[] {
  if (values.length === 0) return [];

  const sorted = Float64Array.from(values).sort();
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  if (min === max) {
    return [{ label: formatCompactNumber(min), count: values.length }];
  }

  // Check if extreme outliers compress main distribution
  const p02 = computeQuantile(sorted, 0.02);
  const p98 = computeQuantile(sorted, 0.98);
  const fullSpan = max - min;
  const coreSpan = p98 - p02;
  const hasExtremeTail =
    values.length >= 20 && coreSpan > 0 && fullSpan > coreSpan * 4;

  if (hasExtremeTail) {
    const binCount = 8;
    const step = coreSpan / binCount;
    const coreCounts = new Array<number>(binCount).fill(0);
    let lowOutliers = 0;
    let highOutliers = 0;

    for (let i = 0; i < sorted.length; i++) {
      const v = sorted[i];
      if (v < p02) {
        lowOutliers++;
      } else if (v > p98) {
        highOutliers++;
      } else {
        const idx = Math.min(binCount - 1, Math.floor((v - p02) / step));
        coreCounts[idx]++;
      }
    }

    const bins: HistogramBin[] = [];
    if (lowOutliers > 0) {
      bins.push({
        label: `< ${formatCompactNumber(p02)}`,
        count: lowOutliers,
        isOutlierBin: lowerFence !== undefined && min < lowerFence
      });
    }
    for (let i = 0; i < binCount; i++) {
      const a = p02 + i * step;
      const b = p02 + (i + 1) * step;
      bins.push({
        label: `${formatCompactNumber(a)}–${formatCompactNumber(b)}`,
        count: coreCounts[i]
      });
    }
    if (highOutliers > 0) {
      bins.push({
        label: `> ${formatCompactNumber(p98)}`,
        count: highOutliers,
        isOutlierBin: upperFence !== undefined && max > upperFence
      });
    }
    return bins;
  }

  const binCount = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(values.length))));
  const step = fullSpan / binCount;
  const counts = new Array<number>(binCount).fill(0);

  for (let i = 0; i < sorted.length; i++) {
    const idx = Math.min(binCount - 1, Math.floor((sorted[i] - min) / step));
    counts[idx]++;
  }

  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const a = min + i * step;
    const b = min + (i + 1) * step;
    const isOutlierBin =
      (lowerFence !== undefined && b < lowerFence) ||
      (upperFence !== undefined && a > upperFence);
    bins.push({
      label: `${formatCompactNumber(a)}–${formatCompactNumber(b)}`,
      count: counts[i],
      isOutlierBin
    });
  }
  return bins;
}

export function buildDateHistogram(timestamps: number[]): HistogramBin[] {
  if (timestamps.length === 0) return [];
  const sorted = Float64Array.from(timestamps).sort();
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const formatLabel = (ts: number, spanDays: number): string => {
    const d = new Date(ts);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return spanDays > 180 ? `${yyyy}-${mm}` : `${yyyy}-${mm}-${dd}`;
  };

  const spanDays = (max - min) / 86_400_000;
  if (min === max) {
    return [{ label: formatLabel(min, spanDays), count: timestamps.length }];
  }

  const binCount = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(timestamps.length))));
  const step = (max - min) / binCount;
  const counts = new Array<number>(binCount).fill(0);

  for (let i = 0; i < sorted.length; i++) {
    const idx = Math.min(binCount - 1, Math.floor((sorted[i] - min) / step));
    counts[idx]++;
  }

  return counts.map((count, i) => ({
    label: formatLabel(min + (i + 0.5) * step, spanDays),
    count
  }));
}

export function computeTopValues(
  freqMap: Map<string, number>,
  totalNonMissing: number,
  limit = 5
): ValueFrequency[] {
  if (totalNonMissing === 0) return [];
  const sorted = Array.from(freqMap.entries()).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, limit).map(([value, count]) => ({
    value,
    count,
    percent: Number(((count / totalNonMissing) * 100).toFixed(1))
  }));
}

import { describe, expect, it } from 'vitest';
import { generateDemoOrdersTable } from '../demoGenerator';
import { profileTable, querySessionRows } from '../profiler';
import { computeNumericStats } from '../statistics';
import type { ParsedTable } from '../../shared/types';

function makeTable(headers: string[], rows: Array<Array<string | null>>): ParsedTable {
  return {
    fileName: 'test.csv',
    fileSizeBytes: 512,
    format: 'csv',
    detectedEncoding: 'utf-8',
    usedEncoding: 'utf-8',
    headers,
    rows,
    parseTimeMs: 1
  };
}

describe('profiler, statistics, and defect detection', () => {
  it('computes exact IQR fences and identifies statistical outliers', () => {
    // Sorted: [10, 12, 13, 14, 15, 16, 17, 18, 20, 200]
    const stats = computeNumericStats([10, 12, 13, 14, 15, 16, 17, 18, 20, 200]);
    expect(stats.count).toBe(10);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(200);
    expect(stats.median).toBe(15.5);
    expect(stats.q1).toBeCloseTo(13.25, 4);
    expect(stats.q3).toBeCloseTo(17.75, 4);
    expect(stats.iqr).toBeCloseTo(4.5, 4);
    expect(stats.upperFence).toBeCloseTo(24.5, 4);
    expect(stats.outlierCount).toBe(1);
  });

  it('guards against zero-IQR false outliers', () => {
    const stats = computeNumericStats([5, 5, 5, 5, 5, 5, 5, 5, 100]);
    expect(stats.iqr).toBe(0);
    expect(stats.outlierCount).toBe(0);
  });

  it('detects duplicates, semantic types, mixed formats, invalid dates/emails, whitespace, and calculates DQ score', () => {
    const rows: Array<Array<string | null>> = [
      ['1', '2025-01-10', 'ivan@mail.ru', '+7 (999) 111-22-33', '100.50', 'Да', ' Москва'],
      ['2', '2025-01-11', 'olga@yandex.ru', '+7 (999) 222-33-44', '110.25', 'Нет', 'Казань'],
      ['3', '12.01.2025', 'bad@domain', '+79993334455', '120,75', 'Да', 'Самара'],
      ['4', '2025-02-30', 'petr@gmail.com', '+7 (999) 444-55-66', '15 400 ₽', 'Нет', 'Омск'],
      ['5', '2025-01-14', 'anna@corp.ru', '+7 (999) 555-66-77', '130.00', 'Да', 'Тула'],
      ['6', '2025-01-15', 'max@corp.ru', '+7 (999) 666-77-88', '135.00', 'Да', 'Пермь'],
      ['7', '2025-01-16', 'kate@corp.ru', '+7 (999) 777-88-99', '140.00', 'Нет', 'Уфа'],
      ['8', '2025-01-17', 'serg@corp.ru', '+7 (999) 888-99-00', '145.00', 'Да', 'Сочи'],
      ['9', '2025-01-18', 'nina@corp.ru', '+7 (999) 999-00-11', '99000.00', 'Да', 'Сочи'],
      // Exact duplicate of row 1 (index 0)
      ['1', '2025-01-10', 'ivan@mail.ru', '+7 (999) 111-22-33', '100.50', 'Да', ' Москва'],
      // Missing markers
      ['10', 'N/A', '', '-', null, 'Да', 'Томск']
    ];

    const table = makeTable(
      ['id', 'order_date', 'email', 'phone', 'amount', 'is_paid', 'city'],
      rows
    );
    const session = profileTable(table);
    const { report } = session;

    expect(report.duplicateExtraRows).toBe(1);
    expect(report.duplicateRowCount).toBe(2);
    expect(report.duplicateGroupCount).toBe(1);

    const byName = (name: string) => report.columns.find((c) => c.name === name)!;
    expect(byName('id').semanticType).toBe('integer');
    expect(byName('order_date').semanticType).toBe('date');
    expect(byName('email').semanticType).toBe('email');
    expect(byName('phone').semanticType).toBe('phone');
    expect(byName('amount').semanticType).toBe('float');
    expect(byName('is_paid').semanticType).toBe('boolean');

    expect(byName('order_date').defects.some((d) => d.type === 'invalid_date')).toBe(true);
    expect(byName('order_date').defects.some((d) => d.type === 'mixed_date_format')).toBe(true);
    expect(byName('email').defects.some((d) => d.type === 'invalid_email')).toBe(true);
    expect(byName('phone').defects.some((d) => d.type === 'inconsistent_phone')).toBe(true);
    expect(byName('amount').defects.some((d) => d.type === 'mixed_decimal_separator')).toBe(true);
    expect(byName('amount').defects.some((d) => d.type === 'outlier')).toBe(true);
    expect(byName('city').defects.some((d) => d.type === 'whitespace')).toBe(true);

    // DQ Score sanity
    expect(report.score.overall).toBeGreaterThan(0);
    expect(report.score.overall).toBeLessThan(100);
    const expectedWeighted = Number(
      (
        0.3 * report.score.completeness +
        0.25 * report.score.uniqueness +
        0.25 * report.score.validity +
        0.2 * report.score.consistency
      ).toFixed(1)
    );
    expect(report.score.overall).toBe(expectedWeighted);

    // Query filters
    const dupRows = querySessionRows(session, { filter: 'duplicates', offset: 0, limit: 50 });
    expect(dupRows.totalFiltered).toBe(2);

    const outlierRows = querySessionRows(session, { filter: 'outliers', offset: 0, limit: 50 });
    expect(outlierRows.totalFiltered).toBeGreaterThanOrEqual(1);

    const missingRows = querySessionRows(session, { filter: 'missing', offset: 0, limit: 50 });
    expect(missingRows.totalFiltered).toBe(1);

    const fmtRows = querySessionRows(session, { filter: 'format_errors', offset: 0, limit: 50 });
    expect(fmtRows.totalFiltered).toBeGreaterThanOrEqual(4);
  });

  it('profiles built-in demo dataset (1000 rows) with all defect types present', () => {
    const demo = generateDemoOrdersTable(1000);
    expect(demo.rows).toHaveLength(1000);

    const session = profileTable(demo);
    expect(session.report.rowCount).toBe(1000);
    expect(session.report.duplicateExtraRows).toBeGreaterThan(15);
    expect(session.report.missingCellsTotal).toBeGreaterThan(20);
    expect(session.report.filterCounts.outliers).toBeGreaterThan(5);
    expect(session.report.filterCounts.format_errors).toBeGreaterThan(50);
    expect(session.report.criticalIssues.length).toBeGreaterThan(3);
  });
});

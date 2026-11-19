import { describe, expect, it } from 'vitest';
import { reconcileTables } from '../reconciler';
import type { ParsedTable } from '../../shared/types';

function tbl(name: string, headers: string[], rows: Array<Array<string | null>>): ParsedTable {
  return {
    fileName: name,
    fileSizeBytes: 200,
    format: 'csv',
    detectedEncoding: 'utf-8',
    usedEncoding: 'utf-8',
    headers,
    rows,
    parseTimeMs: 1
  };
}

describe('reconcileTables', () => {
  it('finds rows only in A, only in B, identical matches, and field-level diffs', () => {
    const tableA = tbl(
      'a.csv',
      ['order_id', 'city', 'amount'],
      [
        ['1001', 'Москва', '1500'],
        ['1002', 'Казань', '2000'],
        ['1003', 'Омск', '3500'],
        [' 1004 ', 'Самара', '4000']
      ]
    );

    const tableB = tbl(
      'b.csv',
      ['order_id', 'city', 'amount'],
      [
        ['1001', 'Москва', '1500'],
        ['1002', 'Казань', '2500'],
        ['1004', 'Тула', '4000'],
        ['1005', 'Пермь', '900']
      ]
    );

    const result = reconcileTables(tableA, tableB, {
      keyColumnA: 'order_id',
      keyColumnB: 'order_id',
      compareColumns: [
        { colA: 'city', colB: 'city' },
        { colA: 'amount', colB: 'amount' }
      ],
      trimKeys: true
    });

    expect(result.summary.matchedIdentical).toBe(1);
    expect(result.summary.matchedWithDiffs).toBe(2);
    expect(result.summary.onlyInACount).toBe(1);
    expect(result.summary.onlyInBCount).toBe(1);

    expect(result.onlyInA[0].key).toBe('1003');
    expect(result.onlyInB[0].key).toBe('1005');

    const diff1002 = result.differences.find((d) => d.key === '1002')!;
    expect(diff1002.diffs).toEqual([
      { column: 'amount', valueA: '2000', valueB: '2500' }
    ]);

    const diff1004 = result.differences.find((d) => d.key === '1004')!;
    expect(diff1004.diffs).toEqual([
      { column: 'city', valueA: 'Самара', valueB: 'Тула' }
    ]);
  });
});

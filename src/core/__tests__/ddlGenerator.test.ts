import { describe, expect, it } from 'vitest';
import { generateDdl } from '../ddlGenerator';
import { profileTable } from '../profiler';
import type { ParsedTable } from '../../shared/types';

describe('generateDdl', () => {
  it('generates PostgreSQL & SQLite DDL with types, NOT NULL, PK/UNIQUE, and WARNING comments', () => {
    const table: ParsedTable = {
      fileName: 'Заказы_клиентов.csv',
      fileSizeBytes: 500,
      format: 'csv',
      detectedEncoding: 'utf-8',
      usedEncoding: 'utf-8',
      headers: ['order_id', 'email', 'Сумма заказа', 'created_at', 'is_paid'],
      rows: [
        ['1', 'a@test.ru', '100.50', '2025-01-01', 'true'],
        ['2', 'a@test.ru', '200.75', '02.01.2025', 'false'],
        ['3', 'b@test.ru', null, '2025-01-03', 'true']
      ],
      parseTimeMs: 1
    };

    const session = profileTable(table);

    const pg = generateDdl(session.report, { dialect: 'postgresql' });
    expect(pg.tableName).toBe('zakazy_klientov');
    expect(pg.sql).toContain('CREATE TABLE zakazy_klientov');
    expect(pg.sql).toContain('order_id BIGINT NOT NULL');
    expect(pg.sql).toContain('CONSTRAINT pk_zakazy_klientov PRIMARY KEY (order_id)');
    expect(pg.sql).toContain('summa_zakaza NUMERIC(12, 2)');
    expect(pg.sql).not.toContain('summa_zakaza NUMERIC(12, 2) NOT NULL');
    expect(pg.sql).toContain('created_at DATE NOT NULL');
    expect(pg.sql).toContain('is_paid BOOLEAN NOT NULL');
    // Duplicate email triggers WARNING comment
    expect(pg.sql).toContain('-- WARNING:');
    expect(pg.warnings.some((w) => w.includes('email') && w.includes('дубликатов'))).toBe(true);

    const sqlite = generateDdl(session.report, {
      dialect: 'sqlite',
      tableName: 'orders_clean'
    });
    expect(sqlite.sql).toContain('CREATE TABLE orders_clean');
    expect(sqlite.sql).toContain('order_id INTEGER NOT NULL PRIMARY KEY');
    expect(sqlite.sql).toContain('summa_zakaza REAL');
    expect(sqlite.sql).toContain('CHECK (is_paid IN (0, 1))');
  });
});

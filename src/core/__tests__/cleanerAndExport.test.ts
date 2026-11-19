import { describe, expect, it } from 'vitest';
import {
  applyCleaning,
  previewCleaning,
  serializeTableToCsv,
  serializeTableToXlsx
} from '../cleaner';
import { generateDdl } from '../ddlGenerator';
import { parseCsvBuffer, parseExcelBuffer } from '../parser';
import { profileTable } from '../profiler';
import { generateHtmlReport, generateMarkdownReport } from '../reportExporter';
import type { ParsedTable } from '../../shared/types';

describe('cleaner and report exporters', () => {
  it('previews and applies cleaning (duplicates, whitespace, ISO 8601 dates, decimal comma) and round-trips CSV/XLSX', () => {
    const table: ParsedTable = {
      fileName: 'dirty.csv',
      fileSizeBytes: 300,
      format: 'csv',
      detectedEncoding: 'utf-8',
      usedEncoding: 'utf-8',
      headers: ['id', 'order_date', 'customer', 'amount'],
      rows: [
        ['1', '12.04.2025', '  Иван Иванов ', '1200,50'],
        ['1', '12.04.2025', '  Иван Иванов ', '1200,50'],
        ['2', '2025-04-13', 'Елена\u00A0Петрова', '2500.00'],
        ['3', '14/04/2025', 'Дмитрий', '890,25']
      ],
      parseTimeMs: 1
    };

    const session = profileTable(table);
    const opts = {
      removeDuplicates: true,
      trimWhitespace: true,
      normalizeDatesIso: true,
      normalizeDecimalSeparators: true
    };

    const preview = previewCleaning(session, opts);
    expect(preview.duplicatesRemoved).toBe(1);
    expect(preview.resultingRows).toBe(3);
    expect(preview.datesNormalized).toBe(2);
    expect(preview.cellsTrimmed).toBeGreaterThanOrEqual(2);
    expect(preview.decimalsNormalized).toBe(2);

    const { table: cleaned } = applyCleaning(session, opts);
    expect(cleaned.rows).toHaveLength(3);
    expect(cleaned.rows[0]).toEqual(['1', '2025-04-12', 'Иван Иванов', '1200.5']);
    expect(cleaned.rows[1]).toEqual(['2', '2025-04-13', 'Елена Петрова', '2500.00']);
    expect(cleaned.rows[2]).toEqual(['3', '2025-04-14', 'Дмитрий', '890.25']);

    // CSV round-trip
    const csvBuf = serializeTableToCsv(cleaned);
    const reparsedCsv = parseCsvBuffer(csvBuf, 'cleaned.csv');
    expect(reparsedCsv.rows).toHaveLength(3);
    expect(reparsedCsv.rows[0][2]).toBe('Иван Иванов');

    // XLSX round-trip
    const xlsxBuf = serializeTableToXlsx(cleaned);
    const reparsedXlsx = parseExcelBuffer(xlsxBuf, 'cleaned.xlsx');
    expect(reparsedXlsx.rows).toHaveLength(3);
    expect(reparsedXlsx.rows[0][1]).toBe('2025-04-12');
  });

  it('generates standalone HTML and Markdown audit reports', () => {
    const table: ParsedTable = {
      fileName: 'sample_<test>.csv',
      fileSizeBytes: 1024,
      format: 'csv',
      detectedEncoding: 'utf-8',
      usedEncoding: 'utf-8',
      headers: ['id', 'email'],
      rows: [
        ['1', 'ok@mail.ru'],
        ['2', 'bad_email']
      ],
      parseTimeMs: 1
    };

    const session = profileTable(table);
    const ddl = generateDdl(session.report, { dialect: 'postgresql' });

    const md = generateMarkdownReport(session.report, ddl.sql);
    expect(md).toContain('# Отчет аудита качества данных');
    expect(md).toContain('CREATE TABLE');

    const html = generateHtmlReport(session.report, ddl.sql);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Data Quality Score');
    expect(html).toContain('sample_&lt;test&gt;.csv');
    expect(html).toContain('CREATE TABLE');
  });
});

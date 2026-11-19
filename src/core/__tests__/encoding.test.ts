import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import * as XLSX from 'xlsx';
import { decodeBuffer, detectEncoding } from '../encoding';
import {
  detectCsvDelimiter,
  parseCsvBuffer,
  parseExcelBuffer,
  parseJsonBuffer
} from '../parser';

describe('encoding and parsers', () => {
  it('auto-detects and decodes Russian Windows-1251 CSV buffer', () => {
    const csvText = [
      'order_id;клиент;город;сумма',
      '101;Алексей Иванов;Москва;1500.50',
      '102;Елена Петрова;Санкт-Петербург;2490.00',
      '103;Дмитрий Смирнов;Новосибирск;980.00',
      '104;Ольга Кузнецова;Екатеринбург;4100.25'
    ].join('\r\n');

    const cp1251Buf = iconv.encode(csvText, 'win1251');
    const detected = detectEncoding(cp1251Buf);
    expect(detected.encoding).toBe('windows-1251');

    const decoded = decodeBuffer(cp1251Buf, 'auto');
    expect(decoded.usedEncoding).toBe('windows-1251');
    expect(decoded.text).toContain('Алексей Иванов');
    expect(decoded.text).toContain('Санкт-Петербург');

    const parsed = parseCsvBuffer(cp1251Buf, 'orders_cp1251.csv');
    expect(parsed.detectedEncoding).toBe('windows-1251');
    expect(parsed.detectedDelimiter).toBe(';');
    expect(parsed.headers).toEqual(['order_id', 'клиент', 'город', 'сумма']);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[1][2]).toBe('Санкт-Петербург');
  });

  it('handles UTF-8 with BOM and without BOM and supports manual override', () => {
    const text = 'id,имя\n1,Тест\n';
    const utf8WithBom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(text, 'utf-8')
    ]);

    const det = detectEncoding(utf8WithBom);
    expect(det.encoding).toBe('utf-8');
    expect(det.hasBom).toBe(true);

    const parsed = parseCsvBuffer(utf8WithBom, 'bom.csv');
    expect(parsed.headers).toEqual(['id', 'имя']);
    expect(parsed.rows[0]).toEqual(['1', 'Тест']);

    const cp1251Buf = iconv.encode('id,город\n1,Казань', 'win1251');
    const forced = decodeBuffer(cp1251Buf, 'windows-1251');
    expect(forced.usedEncoding).toBe('windows-1251');
    expect(forced.text).toContain('Казань');
  });

  it('auto-detects delimiters (comma, semicolon, tab) even with commas inside quotes', () => {
    const semiCsv = 'id;name;note\n1;"Иванов, Алексей";Москва\n2;"Петрова, Елена";Казань';
    expect(detectCsvDelimiter(semiCsv)).toBe(';');

    const tabCsv = 'id\tname\tcity\n1\tИван\tМосква\n2\tАнна\tСамара';
    expect(detectCsvDelimiter(tabCsv)).toBe('\t');

    const commaCsv = 'id,name,city\n1,Иван,Москва\n2,Анна,Самара';
    expect(detectCsvDelimiter(commaCsv)).toBe(',');
  });

  it('parses multi-sheet Excel workbooks and switches sheets', () => {
    const wb = XLSX.utils.book_new();
    const sheet1 = XLSX.utils.aoa_to_sheet([
      ['id', 'city'],
      ['1', 'Москва'],
      ['2', 'Казань']
    ]);
    const sheet2 = XLSX.utils.aoa_to_sheet([
      ['code', 'region'],
      ['77', 'Центр']
    ]);
    XLSX.utils.book_append_sheet(wb, sheet1, 'Заказы');
    XLSX.utils.book_append_sheet(wb, sheet2, 'Регионы');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const first = parseExcelBuffer(buf, 'multi.xlsx');
    expect(first.sheetNames).toEqual(['Заказы', 'Регионы']);
    expect(first.activeSheet).toBe('Заказы');
    expect(first.rows).toHaveLength(2);

    const second = parseExcelBuffer(buf, 'multi.xlsx', { sheetName: 'Регионы' });
    expect(second.activeSheet).toBe('Регионы');
    expect(second.headers).toEqual(['code', 'region']);
    expect(second.rows[0]).toEqual(['77', 'Центр']);
  });

  it('parses and flattens nested JSON arrays of objects', () => {
    const json = JSON.stringify([
      {
        id: 1,
        customer: { name: 'Иван', address: { city: 'Москва' } },
        tags: ['vip', 'fast']
      },
      {
        id: 2,
        customer: { name: 'Ольга' }
      }
    ]);

    const parsed = parseJsonBuffer(Buffer.from(json, 'utf-8'), 'orders.json');
    expect(parsed.headers).toEqual(['id', 'customer.name', 'customer.address.city', 'tags']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0][2]).toBe('Москва');
    expect(parsed.rows[1][2]).toBeNull();
  });
});

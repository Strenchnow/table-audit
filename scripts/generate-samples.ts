import fs from 'node:fs/promises';
import path from 'node:path';
import iconv from 'iconv-lite';
import * as XLSX from 'xlsx';
import { generateDemoOrdersTable } from '../src/core/demoGenerator';

function escapeField(val: string | null, delim: string): string {
  if (val === null) return '';
  if (val.includes(delim) || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

async function main() {
  const samplesDir = path.resolve(process.cwd(), 'samples');
  await fs.mkdir(samplesDir, { recursive: true });

  // 1. UTF-8 CSV with ';' delimiter (~300 dirty rows)
  const utf8Table = generateDemoOrdersTable(300);
  const utf8Lines = [
    utf8Table.headers.join(';'),
    ...utf8Table.rows.map((r) => r.map((c) => escapeField(c, ';')).join(';'))
  ];
  await fs.writeFile(
    path.join(samplesDir, 'orders_dirty_utf8.csv'),
    utf8Lines.join('\r\n'),
    'utf-8'
  );

  // 2. Genuine Windows-1251 CSV with ',' delimiter (~250 dirty rows)
  const cp1251Table = generateDemoOrdersTable(250);
  const cp1251Lines = [
    cp1251Table.headers.join(','),
    ...cp1251Table.rows.map((r) => r.map((c) => escapeField(c, ',')).join(','))
  ];
  const cp1251Buf = iconv.encode(cp1251Lines.join('\r\n'), 'win1251');
  await fs.writeFile(path.join(samplesDir, 'orders_dirty_cp1251.csv'), cp1251Buf);

  // 3. Multi-sheet Excel workbook for sheet selection & A vs B reconciliation against orders_dirty_utf8.csv
  const baseRows = utf8Table.rows.map((r) => [...r]);
  // Remove ~12 rows
  const v2Rows = baseRows.filter((_row, idx) => idx % 25 !== 7);
  // Modify ~30 rows (amount, city, is_paid)
  for (let i = 0; i < v2Rows.length; i++) {
    if (i % 10 === 2) {
      v2Rows[i][7] = '19990.00'; // amount changed
    }
    if (i % 15 === 4) {
      v2Rows[i][5] = 'Екатеринбург'; // city changed
    }
    if (i % 18 === 5) {
      v2Rows[i][9] = 'true'; // is_paid changed
    }
  }
  // Add 15 new rows
  for (let k = 0; k < 15; k++) {
    v2Rows.push([
      String(200001 + k),
      '2025-11-15',
      `Новый Клиент ${k + 1}`,
      `new.client${k + 1}@company.ru`,
      `+7 (916) 555-01-${String(10 + k).padStart(2, '0')}`,
      'Москва',
      'Электроника',
      String(4500 + k * 250),
      '1',
      'true'
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ordersSheet = XLSX.utils.aoa_to_sheet([utf8Table.headers, ...v2Rows]);
  const lookupSheet = XLSX.utils.aoa_to_sheet([
    ['category_code', 'category_name', 'sla_days', 'active'],
    ['EL', 'Электроника', '2', 'true'],
    ['CL', 'Одежда', '3', 'true'],
    ['HG', 'Дом и сад', '5', 'true'],
    ['BK', 'Книги', '4', 'true'],
    ['SP', 'Спорт', '3', 'false']
  ]);

  XLSX.utils.book_append_sheet(wb, ordersSheet, 'Заказы');
  XLSX.utils.book_append_sheet(wb, lookupSheet, 'Справочник');

  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  await fs.writeFile(path.join(samplesDir, 'orders_updated_v2.xlsx'), xlsxBuf);

  console.log('Generated sample datasets in:', samplesDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

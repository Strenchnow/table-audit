import type { CellValue, ParsedTable } from '../shared/types';

function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Алексей',
  'Елена',
  'Дмитрий',
  'Ольга',
  'Сергей',
  'Наталья',
  'Иван',
  'Анна',
  'Максим',
  'Мария',
  'Андрей',
  'Татьяна'
];

const LAST_NAMES = [
  'Иванов',
  'Петрова',
  'Смирнов',
  'Кузнецова',
  'Соколов',
  'Попова',
  'Лебедев',
  'Морозова',
  'Волков',
  'Новикова'
];

const CITIES = [
  'Москва',
  'Санкт-Петербург',
  'Новосибирск',
  'Екатеринбург',
  'Казань',
  'Нижний Новгород',
  'Самара'
];

const CATEGORIES = ['Электроника', 'Одежда', 'Дом и сад', 'Книги', 'Спорт'];

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ы: 'y', э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: ''
};

function translitWord(word: string): string {
  return word
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
}

export function generateDemoOrdersTable(totalRows = 1000): ParsedTable {
  const start = performance.now();
  const rand = createMulberry32(20250412);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const headers = [
    'order_id',
    'order_date',
    'customer_name',
    'email',
    'phone',
    'city',
    'category',
    'amount',
    'quantity',
    'is_paid'
  ];

  const rows: CellValue[][] = [];
  const duplicateCount = Math.max(1, Math.round(totalRows * 0.11));
  const uniqueRowsTarget = totalRows - duplicateCount;

  for (let i = 0; i < uniqueRowsTarget; i++) {
    const orderId = String(100001 + i);
    const year = 2025;
    const month = 1 + Math.floor(rand() * 11);
    const day = 1 + Math.floor(rand() * 28);
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');

    // Mostly ISO date, ~22% RU dot format, ~8% slash, ~4% invalid calendar date, ~8% missing
    let orderDate: CellValue = `${year}-${mm}-${dd}`;
    const dateRoll = rand();
    if (dateRoll < 0.04) {
      orderDate = rand() < 0.5 ? '2025-02-30' : '31.04.2025';
    } else if (dateRoll < 0.26) {
      orderDate = `${dd}.${mm}.${year}`;
    } else if (dateRoll < 0.34) {
      orderDate = `${dd}/${mm}/${year}`;
    } else if (dateRoll < 0.42) {
      orderDate = 'N/A';
    }

    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    let customerName: CellValue = `${first} ${last}`;
    const nameRoll = rand();
    if (nameRoll < 0.22) {
      customerName = `  ${customerName} `;
    } else if (nameRoll < 0.3) {
      customerName = `${first}\u00A0${last}`;
    } else if (nameRoll < 0.38) {
      customerName = null;
    }

    const emailUser = `${translitWord(first)}.${translitWord(last)}${10 + (i % 89)}`;
    const domains = ['mail.ru', 'yandex.ru', 'gmail.com', 'company.org'];
    let email: CellValue = `${emailUser}@${pick(domains)}`;
    const emailRoll = rand();
    if (emailRoll < 0.05) {
      email = `${emailUser}@bad_domain`;
    } else if (emailRoll < 0.085) {
      email = `${emailUser}gmail.com`;
    } else if (emailRoll < 0.18) {
      email = '';
    }

    const pCode = String(900 + (i % 99)).padStart(3, '0');
    const p1 = String(100 + ((i * 7) % 899)).padStart(3, '0');
    const p2 = String(10 + ((i * 3) % 89)).padStart(2, '0');
    const p3 = String(10 + ((i * 5) % 89)).padStart(2, '0');
    let phone: CellValue = `+7 (${pCode}) ${p1}-${p2}-${p3}`;
    const phoneRoll = rand();
    if (phoneRoll < 0.16) {
      phone = `+7${pCode}${p1}${p2}${p3}`;
    } else if (phoneRoll < 0.28) {
      phone = `8-${pCode}-${p1}-${p2}-${p3}`;
    } else if (phoneRoll < 0.33) {
      phone = `+7 (${pCode}) ${p1}`;
    } else if (phoneRoll < 0.42) {
      phone = '-';
    }

    let city: CellValue = pick(CITIES);
    const cityRoll = rand();
    if (cityRoll < 0.24) city = ` ${city}  `;
    else if (cityRoll < 0.33) city = null;

    let category: CellValue = pick(CATEGORIES);
    const catRoll = rand();
    if (catRoll < 0.14) category = ` ${category} `;
    else if (catRoll < 0.22) category = null;

    // Amount: realistic baseline 800..18000 with decimal dots, ~15% commas, ~4% text currency, ~5% IQR outliers, ~8% missing
    const baseAmount = Math.round((800 + rand() * 14000) * 100) / 100;
    let amount: CellValue = baseAmount.toFixed(2);
    const amtRoll = rand();
    if (amtRoll < 0.05) {
      amount = (165000 + Math.round(rand() * 190000)).toFixed(2); // Outlier!
    } else if (amtRoll < 0.09) {
      amount = `${Math.round(baseAmount).toLocaleString('ru-RU').replace(/\s/g, ' ')} ₽`;
    } else if (amtRoll < 0.24) {
      amount = baseAmount.toFixed(2).replace('.', ',');
    } else if (amtRoll < 0.32) {
      amount = 'N/A';
    }

    let quantity: CellValue = String(1 + Math.floor(rand() * 5));
    const qtyRoll = rand();
    if (qtyRoll < 0.04) {
      quantity = String(45 + Math.floor(rand() * 40)); // Outlier
    } else if (qtyRoll < 0.11) {
      quantity = null;
    }

    const isPaid: CellValue = rand() < 0.68 ? 'true' : rand() < 0.85 ? 'false' : rand() < 0.94 ? 'Да' : 'Нет';

    rows.push([
      orderId,
      orderDate,
      customerName,
      email,
      phone,
      city,
      category,
      amount,
      quantity,
      isPaid
    ]);
  }

  // Inject exact full row duplicates
  for (let d = 0; d < duplicateCount; d++) {
    const srcIdx = Math.floor((d * uniqueRowsTarget) / duplicateCount);
    const clone = [...rows[srcIdx]];
    const insertAt = Math.min(rows.length, srcIdx + 3 + (d % 5));
    rows.splice(insertAt, 0, clone);
  }

  const approxBytes = rows.reduce(
    (acc, r) => acc + r.reduce((s, c) => s + (c ? c.length + 1 : 1), 0),
    120
  );

  return {
    fileName: 'demo_orders_1000.csv',
    fileSizeBytes: approxBytes,
    format: 'demo',
    detectedEncoding: 'utf-8',
    usedEncoding: 'utf-8',
    detectedDelimiter: ',',
    usedDelimiter: ',',
    headers,
    rows,
    parseTimeMs: Math.round(performance.now() - start)
  };
}

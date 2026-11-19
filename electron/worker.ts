import { parentPort } from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CleaningOptions,
  DdlDialect,
  DdlOptions,
  GetRowsRequest,
  ParseOptions,
  ParsedTable,
  ReconcileRequest,
  TableBMeta
} from '../src/shared/types';
import {
  applyCleaning,
  previewCleaning,
  serializeTableToCsv,
  serializeTableToXlsx
} from '../src/core/cleaner';
import { generateDdl } from '../src/core/ddlGenerator';
import { generateDemoOrdersTable } from '../src/core/demoGenerator';
import { parseFileBuffer } from '../src/core/parser';
import {
  profileTable,
  querySessionRows,
  type ProfileSession
} from '../src/core/profiler';
import { reconcileTables } from '../src/core/reconciler';
import {
  generateHtmlReport,
  generateMarkdownReport
} from '../src/core/reportExporter';

if (!parentPort) {
  throw new Error('electron/worker.ts must run inside a Node Worker Thread.');
}

interface RawFileCache {
  buffer: Uint8Array;
  fileName: string;
  filePath?: string;
}

let sessionA: ProfileSession | null = null;
let rawFileA: RawFileCache | null = null;

let tableB: ParsedTable | null = null;
let rawFileB: RawFileCache | null = null;

function emitProgress(stage: string, percent: number): void {
  parentPort?.postMessage({ type: 'progress', stage, percent });
}

function toUint8Array(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new Error('Некорректный формат буфера файла.');
}

function buildTableBMeta(t: ParsedTable): TableBMeta {
  return {
    fileName: t.fileName,
    filePath: t.filePath,
    fileSizeBytes: t.fileSizeBytes,
    format: t.format,
    detectedEncoding: t.detectedEncoding,
    usedEncoding: t.usedEncoding,
    detectedDelimiter: t.detectedDelimiter,
    usedDelimiter: t.usedDelimiter,
    sheetNames: t.sheetNames,
    activeSheet: t.activeSheet,
    rowCount: t.rows.length,
    columnCount: t.headers.length,
    headers: t.headers
  };
}

function requireSessionA(): ProfileSession {
  if (!sessionA) {
    throw new Error('Сначала загрузите основной набор данных (Таблица A).');
  }
  return sessionA;
}

function profileAndStoreA(
  buffer: Uint8Array,
  fileName: string,
  options: ParseOptions = {},
  filePath?: string
) {
  emitProgress('Чтение и парсинг файла', 10);
  rawFileA = { buffer, fileName, filePath };
  const parsed = parseFileBuffer(buffer, fileName, options, filePath);
  sessionA = profileTable(parsed, (stage, percent) => emitProgress(stage, percent));
  return sessionA.report;
}

async function handleAction(action: string, payload: Record<string, unknown>): Promise<unknown> {
  switch (action) {
    case 'loadFile': {
      const filePath = String(payload.filePath);
      const options = (payload.options as ParseOptions | undefined) ?? {};
      emitProgress('Чтение файла с диска', 5);
      const fileBuf = await fs.readFile(filePath);
      return profileAndStoreA(
        new Uint8Array(fileBuf),
        path.basename(filePath),
        options,
        filePath
      );
    }

    case 'loadBuffer': {
      const buf = toUint8Array(payload.buffer);
      const fileName = String(payload.fileName);
      const options = (payload.options as ParseOptions | undefined) ?? {};
      return profileAndStoreA(buf, fileName, options);
    }

    case 'reparse': {
      if (!rawFileA) {
        throw new Error('Нет исходного файла для повторного разбора (демо-набор не переразбирается).');
      }
      const options = (payload.options as ParseOptions | undefined) ?? {};
      return profileAndStoreA(rawFileA.buffer, rawFileA.fileName, options, rawFileA.filePath);
    }

    case 'loadDemo': {
      emitProgress('Генерация демо-датасета (~1 000 строк)', 15);
      rawFileA = null;
      const demo = generateDemoOrdersTable(1000);
      sessionA = profileTable(demo, (stage, percent) => emitProgress(stage, percent));
      return sessionA.report;
    }

    case 'getRows': {
      const session = requireSessionA();
      return querySessionRows(session, payload as unknown as GetRowsRequest);
    }

    case 'loadSecondFile': {
      const filePath = String(payload.filePath);
      const options = (payload.options as ParseOptions | undefined) ?? {};
      const fileBuf = await fs.readFile(filePath);
      const uint = new Uint8Array(fileBuf);
      const fileName = path.basename(filePath);
      rawFileB = { buffer: uint, fileName, filePath };
      tableB = parseFileBuffer(uint, fileName, options, filePath);
      return buildTableBMeta(tableB);
    }

    case 'loadSecondBuffer': {
      const uint = toUint8Array(payload.buffer);
      const fileName = String(payload.fileName);
      const options = (payload.options as ParseOptions | undefined) ?? {};
      rawFileB = { buffer: uint, fileName };
      tableB = parseFileBuffer(uint, fileName, options);
      return buildTableBMeta(tableB);
    }

    case 'reparseSecond': {
      if (!rawFileB) {
        throw new Error('Второй файл (Таблица B) еще не загружен.');
      }
      const options = (payload.options as ParseOptions | undefined) ?? {};
      tableB = parseFileBuffer(rawFileB.buffer, rawFileB.fileName, options, rawFileB.filePath);
      return buildTableBMeta(tableB);
    }

    case 'reconcile': {
      const session = requireSessionA();
      if (!tableB) {
        throw new Error('Загрузите второй файл (Таблица B) для выполнения сверки.');
      }
      return reconcileTables(
        session.table,
        tableB,
        payload as unknown as ReconcileRequest
      );
    }

    case 'generateDdl': {
      const session = requireSessionA();
      return generateDdl(session.report, payload as unknown as DdlOptions);
    }

    case 'previewClean': {
      const session = requireSessionA();
      return previewCleaning(session, payload as unknown as CleaningOptions);
    }

    case 'exportCleaned': {
      const session = requireSessionA();
      const options = payload.options as CleaningOptions;
      const format = payload.format as 'csv' | 'xlsx';
      const targetPath = String(payload.targetPath);

      const { table: cleaned } = applyCleaning(session, options);
      const outBuf =
        format === 'xlsx'
          ? serializeTableToXlsx(cleaned)
          : serializeTableToCsv(cleaned);
      await fs.writeFile(targetPath, outBuf);
      return { filePath: targetPath, rowsWritten: cleaned.rows.length };
    }

    case 'exportReport': {
      const session = requireSessionA();
      const format = payload.format as 'html' | 'md';
      const dialect = (payload.dialect as DdlDialect | undefined) ?? 'postgresql';
      const targetPath = String(payload.targetPath);
      const ddl = generateDdl(session.report, { dialect });
      const content =
        format === 'html'
          ? generateHtmlReport(session.report, ddl.sql)
          : generateMarkdownReport(session.report, ddl.sql);
      await fs.writeFile(targetPath, content, 'utf-8');
      return { filePath: targetPath };
    }

    case 'exportSql': {
      const session = requireSessionA();
      const options = payload.options as DdlOptions;
      const targetPath = String(payload.targetPath);
      const ddl = generateDdl(session.report, options);
      await fs.writeFile(targetPath, ddl.sql, 'utf-8');
      return { filePath: targetPath };
    }

    default:
      throw new Error(`Неизвестная команда worker: ${action}`);
  }
}

parentPort.on('message', async (msg: { id: number; action: string; payload: Record<string, unknown> }) => {
  try {
    const result = await handleAction(msg.action, msg.payload ?? {});
    parentPort?.postMessage({ type: 'response', id: msg.id, ok: true, result });
  } catch (err) {
    parentPort?.postMessage({
      type: 'response',
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

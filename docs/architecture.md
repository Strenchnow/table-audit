# Архитектура системы — TableAudit

## 1. Обзор архитектуры и технологический стек

Приложение построено по многопроцессной архитектуре **Electron** с жестким разделением ответственности между слоем представления, системным процессом и вычислительным воркером:

- **Renderer Process (React 18 + TypeScript + Tailwind CSS + Recharts + TanStack Virtual):** отвечает исключительно за UI, переключение тем и виртуализированный рендеринг видимой области данных.
- **Preload Bridge (`contextBridge` + `webUtils`):** предоставляет безопасный типизированный API `window.tableAudit`, скрывая прямые вызовы Node.js от браузерного контекста.
- **Main Process (Electron):** управляет жизненным циклом `BrowserWindow`, нативными диалогами выбора/сохранения файлов и проксирует задачи в выделенный `Worker Thread`.
- **Analysis Worker Thread (`worker_threads` + `src/core/`):** хранит распарсенные таблицы A/B и компактные битовые маски строк в оперативной памяти, выполняет парсинг (`papaparse`, `xlsx`, `chardet`, `iconv-lite`), профилирование, расчет IQR, сверку таблиц, генерацию DDL и экспорт файлов.

---

## 2. Компонентная схема

```mermaid
flowchart TD
    UI["Renderer Process (React + Tailwind + TanStack Virtual)"]
    PRE["Preload Bridge (contextBridge + webUtils)"]
    MAIN["Electron Main Process (BrowserWindow + Dialogs)"]
    WRK["Analysis Worker Thread (State + Bitmasks)"]
    CORE["Pure TypeScript Core (src/core/)"]

    UI -->|"window.tableAudit.*"| PRE
    PRE -->|"ipcRenderer.invoke / on"| MAIN
    MAIN -->|"postMessage (RPC)"| WRK
    WRK --> CORE

    subgraph CORE_MODULES["Модули ядра src/core/"]
        ENC["encoding.ts (chardet + iconv-lite)"]
        PRS["parser.ts (CSV / XLSX / JSON)"]
        PRF["profiler.ts + validators.ts + statistics.ts"]
        REC["reconciler.ts (A vs B diff)"]
        DDL["ddlGenerator.ts (PostgreSQL / SQLite)"]
        EXP["cleaner.ts + reportExporter.ts"]
    end

    CORE --- CORE_MODULES
```

---

## 3. Sequence-диаграмма процесса загрузки и профилирования файла

```mermaid
sequenceDiagram
    actor User as Аналитик
    participant UI as Renderer (React)
    participant Main as Main Process
    participant Worker as Worker Thread
    participant Core as Core Engine (src/core)

    User->>UI: Перетаскивает файл или нажимает "Открыть"
    UI->>Main: ipcRenderer.invoke("dataset:loadFile", filePath, options)
    Main->>Worker: postMessage({ id, action: "loadFile", payload })
    Worker-->>Main: progress("Чтение файла с диска", 5%)
    Main-->>UI: event("worker:progress", 5%)

    Worker->>Core: parseFileBuffer(buffer, fileName, options)
    Core-->>Worker: ParsedTable (headers, rows, encoding, delimiter)

    Worker-->>Main: progress("Поиск дубликатов и статистик", 45%)
    Worker->>Core: profileTable(parsedTable)
    Note over Core: Определение типов, IQR, битовые маски Uint16Array, DQ Score
    Core-->>Worker: ProfileSession (сохраняется в памяти Worker)

    Worker-->>Main: response(id, ProfileReport)
    Main-->>UI: resolve(ProfileReport)
    UI->>User: Отображает Дашборд DQ Score и навигацию

    User->>UI: Переходит в "Инспектор данных" или скроллит таблицу
    UI->>Main: ipcRenderer.invoke("dataset:getRows", { filter, offset, limit })
    Main->>Worker: postMessage({ id, action: "getRows" })
    Worker->>Core: querySessionRows(session, req)
    Core-->>Worker: GetRowsResponse (окно <= 200 строк + CellDefects)
    Worker-->>Main: response(id, GetRowsResponse)
    Main-->>UI: Отрисовка виртуальных строк (60 FPS)
```

---

## 4. IPC-контракт и оптимизация под 100 000 строк

Чтобы интерфейс оставался отзывчивым на больших файлах (до 100 000 строк × десятки столбцов):

1. **Единое хранилище в Worker Thread:** полный массив `rows` не пересылается целиком через IPC-сериализацию (Structured Clone). В UI возвращается только легкий `ProfileReport` (сводка, метрики и профили столбцов).
2. **Битовые маски строк (`Uint16Array`):** для каждой строки при профилировании вычисляется 16-битный флаг:
   - `BIT_MISSING = 1`
   - `BIT_DUPLICATE = 2`
   - `BIT_OUTLIER = 4`
   - `BIT_FORMAT_ERROR = 8`
   Это позволяет фильтровать 100 000 строк за 1–3 мс.
3. **Оконный Data Grid + `@tanstack/react-virtual`:** таблица запрашивает страницы по 200 строк (`dataset:getRows`), а дефекты ячеек (`CellDefect[]`) формируются только для видимого окна.

| IPC-канал | Направление | Назначение |
| --- | --- | --- |
| `dialog:openFile` / `dialog:saveFile` | Renderer → Main | Нативные системные диалоги выбора/сохранения |
| `dataset:loadFile` / `dataset:loadBuffer` | Renderer → Worker | Парсинг и профилирование файла |
| `dataset:reparse` | Renderer → Worker | Переразбор при смене кодировки / разделителя / листа |
| `dataset:loadDemo` | Renderer → Worker | Загрузка встроенного демо-датасета (~1 000 строк) |
| `dataset:getRows` | Renderer → Worker | Постраничная выборка строк с фильтрами и тултипами |
| `reconcile:loadSecondFile` / `reconcile:run` | Renderer → Worker | Загрузка Таблицы B и сверка A vs B |
| `ddl:generate` | Renderer → Worker | Генерация `CREATE TABLE` (PostgreSQL / SQLite) |
| `clean:preview` / `export:cleaned` | Renderer → Worker | Предпросмотр очистки и экспорт CSV / XLSX |
| `export:report` / `export:sql` | Renderer → Worker | Экспорт отчета (HTML / Markdown) и `.sql` скрипта |

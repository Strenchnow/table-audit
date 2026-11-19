import type { ProfileReport } from '../shared/types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

export function generateMarkdownReport(profile: ProfileReport, ddlSql: string): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  lines.push(`# Отчет аудита качества данных — ${profile.fileName}`);
  lines.push('');
  lines.push(`- **Дата отчета:** ${now} UTC`);
  lines.push(`- **Формат:** ${profile.format.toUpperCase()} | **Кодировка:** ${profile.usedEncoding} | **Размер:** ${formatBytes(profile.fileSizeBytes)}`);
  lines.push(`- **Объем:** ${profile.rowCount} строк × ${profile.columnCount} столбцов`);
  lines.push('');

  lines.push(`## Интегральная оценка: ${profile.score.overall}% (${profile.score.grade})`);
  lines.push('');
  lines.push('| Метрика | Значение | Вес |');
  lines.push('| --- | ---: | ---: |');
  lines.push(`| Полнота (Completeness) | ${profile.score.completeness}% | 30% |`);
  lines.push(`| Уникальность (Uniqueness) | ${profile.score.uniqueness}% | 25% |`);
  lines.push(`| Валидность форматов (Validity) | ${profile.score.validity}% | 25% |`);
  lines.push(`| Согласованность (Consistency) | ${profile.score.consistency}% | 20% |`);
  lines.push('');

  lines.push('## Ключевые KPI');
  lines.push('');
  lines.push(`- **Всего строк:** ${profile.rowCount}`);
  lines.push(`- **Столбцов:** ${profile.columnCount}`);
  lines.push(`- **Процент пропусков:** ${profile.missingPercentTotal}% (${profile.missingCellsTotal} ячеек)`);
  lines.push(`- **Полные дубликаты строк:** ${profile.duplicateExtraRows} лишних (${profile.duplicateGroupCount} групп)`);
  lines.push(`- **Всего аномалий:** ${profile.totalAnomalies}`);
  lines.push('');

  lines.push('## Критические проблемы');
  lines.push('');
  if (profile.criticalIssues.length === 0) {
    lines.push('Критических проблем не обнаружено.');
  } else {
    for (const issue of profile.criticalIssues) {
      lines.push(
        `- **[${issue.severity.toUpperCase()}]** ${issue.title} — ${issue.description} (затронуто: ${issue.affectedRows})`
      );
    }
  }
  lines.push('');

  lines.push('## Профиль столбцов');
  lines.push('');
  lines.push('| Столбец | Тип | Пропуски | Уникальных | Мин / Макс | Дефекты |');
  lines.push('| --- | --- | ---: | ---: | --- | --- |');
  for (const col of profile.columns) {
    const minMax = col.numericStats
      ? `${col.numericStats.min} / ${col.numericStats.max} (med: ${col.numericStats.median.toFixed(2)})`
      : col.dateStats
        ? `${col.dateStats.minIso} / ${col.dateStats.maxIso}`
        : '—';
    const defList =
      col.defects.length > 0
        ? col.defects.map((d) => `${d.label}: ${d.count}`).join('; ')
        : 'Нет';
    lines.push(
      `| ${col.name} | \`${col.semanticType}\` | ${col.missingCount} (${col.missingPercent}%) | ${col.uniqueCount} (${col.uniquePercent}%) | ${minMax} | ${defList} |`
    );
  }
  lines.push('');

  lines.push('## Рекомендуемая SQL-схема (DDL)');
  lines.push('');
  lines.push('```sql');
  lines.push(ddlSql);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

export function generateHtmlReport(profile: ProfileReport, ddlSql: string): string {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const scoreColor =
    profile.score.overall >= 90
      ? '#10b981'
      : profile.score.overall >= 75
        ? '#3b82f6'
        : profile.score.overall >= 55
          ? '#f59e0b'
          : '#ef4444';

  const issuesHtml =
    profile.criticalIssues.length === 0
      ? '<p class="muted">Критических проблем не обнаружено.</p>'
      : `<ul class="issue-list">${profile.criticalIssues
          .map(
            (i) =>
              `<li class="issue issue-${i.severity}"><span class="badge badge-${i.severity}">${escapeHtml(i.severity.toUpperCase())}</span><div><strong>${escapeHtml(i.title)}</strong><div class="muted">${escapeHtml(i.description)}</div></div><span class="pill">${i.affectedRows}</span></li>`
          )
          .join('')}</ul>`;

  const columnsRowsHtml = profile.columns
    .map((col) => {
      const statsStr = col.numericStats
        ? `min: ${col.numericStats.min}, max: ${col.numericStats.max}, mean: ${col.numericStats.mean.toFixed(2)}, med: ${col.numericStats.median.toFixed(2)}, IQR: ${col.numericStats.iqr.toFixed(2)}`
        : col.dateStats
          ? `${col.dateStats.minIso} .. ${col.dateStats.maxIso}`
          : col.topValues
              .slice(0, 2)
              .map((t) => `${t.value} (${t.count})`)
              .join(', ') || '—';

      const defectsStr =
        col.defects.length > 0
          ? col.defects
              .map(
                (d) =>
                  `<span class="badge badge-${d.severity}">${escapeHtml(d.label)}: ${d.count}</span>`
              )
              .join(' ')
          : '<span class="badge badge-ok">Ошибок нет</span>';

      return `<tr>
        <td><strong>${escapeHtml(col.name)}</strong></td>
        <td><code>${escapeHtml(col.semanticType)}</code></td>
        <td>${col.missingCount} (${col.missingPercent}%)</td>
        <td>${col.uniqueCount} (${col.uniquePercent}%)</td>
        <td class="mono-sm">${escapeHtml(statsStr)}</td>
        <td>${defectsStr}</td>
      </tr>`;
    })
    .join('\n');

  const metricBar = (label: string, value: number, weight: string) => `
    <div class="metric-row">
      <div class="metric-head"><span>${escapeHtml(label)} <small class="muted">(${weight})</small></span><strong>${value}%</strong></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${value}%;background:${value >= 85 ? '#10b981' : value >= 65 ? '#f59e0b' : '#ef4444'}"></div></div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TableAudit — Отчет: ${escapeHtml(profile.fileName)}</title>
<style>
  :root { --bg: #09090b; --card: #18181b; --border: #27272a; --text: #f4f4f5; --muted: #a1a1aa; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
  .container { max-width: 1120px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 24px; }
  h1 { margin: 0; font-size: 24px; }
  h2 { font-size: 18px; margin: 28px 0 12px; }
  .muted { color: var(--muted); font-size: 13px; }
  .grid-2 { display: grid; grid-template-columns: 300px 1fr; gap: 16px; margin-bottom: 20px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
  .score-box { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .score-num { font-size: 44px; font-weight: 700; color: ${scoreColor}; line-height: 1.1; }
  .kpi-val { font-size: 20px; font-weight: 700; margin-top: 4px; }
  .metric-row { margin-bottom: 12px; }
  .metric-row:last-child { margin-bottom: 0; }
  .metric-head { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; }
  .bar-bg { height: 8px; background: #27272a; border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .issue-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  .issue { display: grid; grid-template-columns: 90px 1fr auto; gap: 12px; align-items: center; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-critical { background: rgba(239,68,68,.18); color: #fca5a5; }
  .badge-warning { background: rgba(245,158,11,.18); color: #fcd34d; }
  .badge-info { background: rgba(59,130,246,.18); color: #93c5fd; }
  .badge-ok { background: rgba(16,185,129,.18); color: #6ee7b7; }
  .pill { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; background: #27272a; padding: 2px 8px; border-radius: 999px; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; font-size: 13px; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: #121215; color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
  code, pre { font-family: "JetBrains Mono", Consolas, monospace; }
  .mono-sm { font-family: "JetBrains Mono", Consolas, monospace; font-size: 12px; }
  pre { background: #111114; border: 1px solid var(--border); border-radius: 10px; padding: 16px; overflow-x: auto; font-size: 12.5px; color: #e4e4e7; }
</style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>TableAudit — Отчет качества данных</h1>
        <div class="muted">Файл: ${escapeHtml(profile.fileName)} · Формат: ${escapeHtml(profile.format.toUpperCase())} · Кодировка: ${escapeHtml(profile.usedEncoding)} · Размер: ${escapeHtml(formatBytes(profile.fileSizeBytes))}</div>
      </div>
      <div class="muted">Сформировано: ${escapeHtml(now)} UTC</div>
    </header>

    <div class="grid-2">
      <div class="card score-box">
        <div class="muted">Data Quality Score</div>
        <div class="score-num">${profile.score.overall}%</div>
        <div style="margin-top:6px;font-weight:600">${escapeHtml(profile.score.grade)}</div>
      </div>
      <div class="card">
        ${metricBar('Полнота (Completeness)', profile.score.completeness, '30%')}
        ${metricBar('Уникальность (Uniqueness)', profile.score.uniqueness, '25%')}
        ${metricBar('Валидность форматов (Validity)', profile.score.validity, '25%')}
        ${metricBar('Согласованность (Consistency)', profile.score.consistency, '20%')}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="card"><div class="muted">Всего строк</div><div class="kpi-val">${profile.rowCount}</div></div>
      <div class="card"><div class="muted">Столбцов</div><div class="kpi-val">${profile.columnCount}</div></div>
      <div class="card"><div class="muted">% пропусков</div><div class="kpi-val">${profile.missingPercentTotal}%</div></div>
      <div class="card"><div class="muted">Дубликаты</div><div class="kpi-val">${profile.duplicateExtraRows}</div></div>
      <div class="card"><div class="muted">Аномалий</div><div class="kpi-val">${profile.totalAnomalies}</div></div>
      <div class="card"><div class="muted">Размер файла</div><div class="kpi-val">${escapeHtml(formatBytes(profile.fileSizeBytes))}</div></div>
    </div>

    <h2>Критические проблемы и предупреждения</h2>
    ${issuesHtml}

    <h2>Профиль столбцов</h2>
    <table>
      <thead>
        <tr>
          <th>Столбец</th>
          <th>Тип</th>
          <th>Пропуски</th>
          <th>Уникальные</th>
          <th>Статистика</th>
          <th>Дефекты</th>
        </tr>
      </thead>
      <tbody>
        ${columnsRowsHtml}
      </tbody>
    </table>

    <h2>Рекомендуемый SQL DDL</h2>
    <pre>${escapeHtml(ddlSql)}</pre>
  </div>
</body>
</html>`;
}

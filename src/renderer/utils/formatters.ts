import type { SemanticType } from '../../shared/types';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

export function formatNum(n: number): string {
  return n.toLocaleString('ru-RU');
}

export function formatStatNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString('ru-RU');
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

export const SEMANTIC_TYPE_META: Record<
  SemanticType,
  { label: string; badgeClass: string }
> = {
  integer: {
    label: 'integer',
    badgeClass:
      'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
  },
  float: {
    label: 'float',
    badgeClass:
      'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
  },
  date: {
    label: 'date',
    badgeClass:
      'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30'
  },
  datetime: {
    label: 'datetime',
    badgeClass:
      'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
  },
  email: {
    label: 'email',
    badgeClass:
      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
  },
  phone: {
    label: 'phone',
    badgeClass:
      'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30'
  },
  boolean: {
    label: 'boolean',
    badgeClass:
      'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
  },
  categorical: {
    label: 'categorical',
    badgeClass:
      'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30'
  },
  string: {
    label: 'string',
    badgeClass:
      'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30'
  }
};

import React from 'react';
import type { DataQualityScore } from '../../shared/types';

interface DqGaugeProps {
  score: DataQualityScore;
}

export const DqGauge: React.FC<DqGaugeProps> = ({ score }) => {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score.overall));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    clamped >= 90
      ? '#10b981'
      : clamped >= 75
        ? '#3b82f6'
        : clamped >= 55
          ? '#f59e0b'
          : '#ef4444';

  const gradeBadge =
    clamped >= 90
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
      : clamped >= 75
        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30'
        : clamped >= 55
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30'
          : 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30';

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative h-36 w-36 flex items-center justify-center">
        <svg className="h-36 w-36 -rotate-90" viewBox="0 0 140 140">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-slate-200 dark:text-zinc-800"
            strokeWidth="12"
          />
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tracking-tight">
            {score.overall}%
          </span>
          <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            DQ Score
          </span>
        </div>
      </div>
      <span
        className={`mt-2 inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${gradeBadge}`}
      >
        {score.grade}
      </span>
    </div>
  );
};

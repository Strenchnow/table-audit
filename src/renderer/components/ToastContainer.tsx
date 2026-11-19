import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const icon =
          t.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          ) : t.type === 'error' ? (
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
          ) : (
            <Info className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
          );

        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 shadow-xl"
          >
            {icon}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                {t.title}
              </div>
              {t.message && (
                <div className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400 break-words">
                  {t.message}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
              aria-label="Закрыть уведомление"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

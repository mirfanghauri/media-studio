import React from 'react';
import { CheckCircle2, Activity, Clock, AlertCircle } from 'lucide-react';

export default function StatusBadge({ status }) {
  const styles = {
    completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shadow-xs',
    active: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 shadow-xs',
    waiting: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 shadow-xs',
    failed: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 shadow-xs',
  };
  const icons = {
    completed: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
    active: <Activity className="w-3.5 h-3.5 text-blue-500 animate-pulse" />,
    waiting: <Clock className="w-3.5 h-3.5 text-amber-500" />,
    failed: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${styles[status] || styles.waiting}`}>
      {icons[status] || icons.waiting}
      <span className="capitalize">{status}</span>
    </span>
  );
}

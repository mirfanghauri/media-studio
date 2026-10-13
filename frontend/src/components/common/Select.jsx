import React from 'react';
import { ChevronDown } from 'lucide-react';

export default function Select({ value, onChange, options = [], label, id, className = '' }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors cursor-pointer pr-10 shadow-xs ${className}`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
    </div>
  );
}

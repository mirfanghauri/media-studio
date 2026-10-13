import React from 'react';
import { Sparkles, ArrowRightLeft, Film, Tag, Wand2 } from 'lucide-react';

export const QUALITY_OPTIONS = [
  { value: 'low', label: 'Low', description: 'Faster generation, lower detail' },
  { value: 'medium', label: 'Medium', description: 'Balanced speed and quality' },
  { value: 'high', label: 'High', description: 'Best quality, slower generation' },
];

export const JOB_TYPES = [
  { value: 'all', label: 'All Types', icon: '📋' },
  { value: 'edit', label: 'AI Edit', icon: '✏️' },
  { value: 'generate', label: 'AI Generation', icon: '✨' },
  { value: 'convert', label: 'Conversion', icon: '🔄' },
  { value: 'slideshow', label: 'Slideshow', icon: '🎬' },
  { value: 'metadata', label: 'Metadata', icon: '🏷️' },
];

export function getJobType(job) {
  const t = job?.operation_type;
  if (t === 'generate') {
    return {
      label: 'AI Generation',
      icon: <Sparkles className="w-3 h-3" />,
      color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30'
    };
  }
  if (t === 'convert') {
    return {
      label: 'Conversion',
      icon: <ArrowRightLeft className="w-3 h-3" />,
      color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30'
    };
  }
  if (t === 'slideshow') {
    return {
      label: 'Slideshow',
      icon: <Film className="w-3 h-3" />,
      color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
    };
  }
  if (t === 'metadata') {
    return {
      label: 'Metadata',
      icon: <Tag className="w-3 h-3" />,
      color: 'bg-emerald-500/15 text-emerald-700 dark:text-[#3fa66e] border-emerald-500/30'
    };
  }
  return {
    label: 'AI Edit',
    icon: <Wand2 className="w-3 h-3" />,
    color: 'bg-[#0b6230]/15 text-[#0b6230] dark:text-[#3fa66e] border-[#0b6230]/30'
  };
}

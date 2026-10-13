import React from 'react';
import { Eye, Download, CloudUpload, RefreshCw, Clock } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { BRAND } from '../../config';
import { getCleanUrl, getDownloadFilename, triggerDownload } from '../../utils/urls';

export default function JobCard({ job, token, onRefresh, onExportWp, originalFiles, onPreview }) {
  const isWaiting = job.status === 'waiting';
  const isActive = job.status === 'active';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';

  return (
    <div className={`relative rounded-2xl border transition-all duration-500 overflow-hidden shadow-xs ${
      isCompleted ? 'border-emerald-500/30 bg-emerald-500/5' :
      isFailed ? 'border-red-500/30 bg-red-500/5' :
      isWaiting ? 'border-amber-500/30 bg-amber-500/5' :
      'border-[#0b6230]/30 bg-[#0b6230]/5'
    }`}>
      {isActive && (
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="shimmer-bar" />
        </div>
      )}
      <div className="p-4 relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            <span className="text-xs text-slate-500 truncate max-w-[160px]" title={job.original_filename}>
              {job.original_filename === 'generate' ? '✨ Text-to-Image' : job.original_filename}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">{job.model || 'gpt-image-2'}</span>
            {job.processing_mode === 'batch' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                📦 Batch
              </span>
            )}
          </div>
        </div>

        {isActive && (
          <div className="mb-3">
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full processing-bar" style={{ background: BRAND.gradient }} />
            </div>
          </div>
        )}

        {isWaiting && (
          <div className="mb-3">
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-amber-500/50 animate-pulse w-full" />
            </div>
          </div>
        )}

        {(isCompleted && (job.preview_url || job.partial_preview_url)) && (
          <div
            onClick={() => onPreview && onPreview(job)}
            className="mb-3 rounded-xl overflow-hidden border border-slate-300/50 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900 cursor-pointer group relative"
          >
            <img
              src={`${getCleanUrl(job.preview_url || job.partial_preview_url)}${job.updated_at ? `?v=${new Date(job.updated_at).getTime()}` : ''}`}
              alt="Generated"
              className="w-full object-contain max-h-48 group-hover:scale-[1.02] transition-transform duration-300"
              onError={e => {
                if (e.target.parentElement) e.target.parentElement.style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-medium backdrop-blur-[2px]">
              <Eye className="w-4 h-4" /> Preview
            </div>
          </div>
        )}

        {isActive && job.partial_preview_url && (
          <div className="mb-3 rounded-xl overflow-hidden border border-[#0b6230]/20 bg-slate-50 dark:bg-slate-900 relative">
            <div className="absolute top-2 left-2 z-10 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm" style={{ background: '#0b623080' }}>
              Preview
            </div>
            <img
              src={getCleanUrl(job.partial_preview_url)}
              alt="Partial preview"
              className="w-full object-contain max-h-48 opacity-70"
              onError={e => {
                if (e.target.parentElement) e.target.parentElement.style.display = 'none';
              }}
            />
          </div>
        )}

        {isFailed && job.error && (
          <p className="text-xs text-red-400 mb-3 bg-red-500/10 rounded-lg p-2 border border-red-500/20">
            {job.error}
          </p>
        )}

        {job.prompt && (
          <p className="text-xs text-slate-500 italic truncate mb-3" title={job.prompt}>
            "{job.prompt}"
          </p>
        )}

        {isCompleted && (job.cost > 0 || job.tokens_used > 0) && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {job.cost > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                💰 ${Number(job.cost).toFixed(4)}
                {job.processing_mode === 'batch' && <span className="text-[9px] opacity-75">(50% off)</span>}
              </span>
            )}
            {job.tokens_used > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                ⚡ {Number(job.tokens_used).toLocaleString()} tokens
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {isCompleted && job.download_url && (
            <>
              <button
                onClick={() => onPreview && onPreview(job)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 rounded-lg text-xs font-medium border border-blue-500/20 transition-all cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
              <button
                onClick={() => triggerDownload(job.download_url, job.original_filename, job.output_format)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-xs font-medium border border-emerald-500/20 transition-all cursor-pointer"
              >
                <Download className="w-3 h-3" />
                Download
              </button>
              {onExportWp && (
                <button
                  onClick={() => {
                    const downloadUrl = getCleanUrl(job.download_url);
                    fetch(downloadUrl).then(r => r.blob()).then(blob => {
                      const exportName = getDownloadFilename(job.original_filename, downloadUrl, job.output_format);
                      const newFile = new File([blob], exportName, { type: blob.type });
                      const originalFile = originalFiles?.find(f => f.name === job.original_filename);
                      if (originalFile) {
                        newFile.wpMediaId = originalFile.wpMediaId;
                        newFile.wpPostId = originalFile.wpPostId;
                      }
                      onExportWp(newFile);
                    });
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-medium border border-blue-500/20 transition-all cursor-pointer"
                  title="Push to WordPress"
                >
                  <CloudUpload className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          {isActive && (
            <button
              onClick={onRefresh}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#0b6230]/20 hover:bg-[#0b6230]/30 text-[#3fa66e] rounded-lg text-xs font-medium border border-[#0b6230]/20 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '2s' }} />
              Processing…
            </button>
          )}
          {isWaiting && (
            <button
              onClick={onRefresh}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded-lg text-xs font-medium border border-amber-500/20 transition-all cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              Waiting in queue…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

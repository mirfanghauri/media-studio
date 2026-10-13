import React, { useState } from 'react';
import { Image as ImageIcon, X, Download, CloudUpload } from 'lucide-react';
import { getCleanUrl, getDownloadFilename, triggerDownload, getJobFileSize, getJobDimension } from '../../utils/urls';

export default function ImagePreviewModal({ image, onClose, onExportWp, originalFiles }) {
  if (!image) return null;
  const [realDim, setRealDim] = useState('');
  const cleanPreviewUrl = getCleanUrl(image.preview_url || image.partial_preview_url || image.download_url || image.url);
  const cleanDownloadUrl = getCleanUrl(image.download_url || image.preview_url || image.url);
  const filename = image.original_filename || image.name || 'image';

  const displayDimension = realDim || getJobDimension(image) || image.image_size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="relative max-w-5xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2 overflow-hidden pr-4">
            <ImageIcon className="w-4 h-4 text-[#3fa66e] shrink-0" />
            <span className="text-sm font-semibold text-slate-200 truncate">{filename}</span>
            {image.model && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                {image.model}
              </span>
            )}
            {image.processing_mode === 'batch' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium shrink-0">
                📦 Batch (50% Off)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image / Video Viewport */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/50 min-h-[300px]">
          {filename.toLowerCase().endsWith('.mp4') || image.output_format?.toLowerCase() === 'mp4' || image.operation_type === 'slideshow' ? (
            <video
              src={cleanPreviewUrl}
              controls
              autoPlay
              playsInline
              className="max-h-[65vh] w-auto max-w-full rounded-lg shadow-lg border border-slate-800/50"
            />
          ) : (
            <img
              src={cleanPreviewUrl}
              alt={filename}
              className="max-h-[65vh] w-auto object-contain rounded-lg shadow-lg border border-slate-800/50"
              onLoad={e => {
                if (e.target.naturalWidth && e.target.naturalHeight) {
                  setRealDim(`${e.target.naturalWidth}x${e.target.naturalHeight}`);
                }
              }}
              onError={e => {
                e.target.onerror = null;
                if (cleanDownloadUrl && cleanDownloadUrl !== cleanPreviewUrl) {
                  e.target.src = cleanDownloadUrl;
                }
              }}
            />
          )}
        </div>

        {/* Footer / Controls */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 truncate max-w-xl">
            {image.prompt && <p className="italic text-slate-300 truncate" title={image.prompt}>"{image.prompt}"</p>}
            {displayDimension && <span className="text-[11px] text-slate-500">{displayDimension} {image.output_format ? `· ${image.output_format.toUpperCase()}` : ''}{getJobFileSize(image) ? ` · ${getJobFileSize(image)}` : ''}</span>}
            {image.metadata && (() => {
              try {
                const meta = typeof image.metadata === 'string' ? JSON.parse(image.metadata) : image.metadata;
                const costVal = meta?.cost || image.cost;
                const tokensVal = meta?.tokens_used || meta?.usage?.total_tokens || image.tokens_used;
                return (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {costVal > 0 && (
                      <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        💰 ${Number(costVal).toFixed(4)}
                        {image.processing_mode === 'batch' ? ' (50% off)' : ''}
                      </span>
                    )}
                    {tokensVal > 0 && (
                      <span className="text-[11px] text-purple-300 font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                        ⚡ {Number(tokensVal).toLocaleString()} tokens
                        {meta?.usage?.input_tokens_details?.image_tokens ? ` (${meta.usage.input_tokens_details.image_tokens} img in / ${meta.usage.output_tokens_details?.image_tokens || 0} img out)` : ''}
                      </span>
                    )}
                  </div>
                );
              } catch (_) {}
              return null;
            })()}
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              onClick={() => triggerDownload(cleanDownloadUrl, filename, image.output_format)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl text-xs font-medium border border-emerald-500/30 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Original
            </button>
            {onExportWp && (
              <button
                onClick={() => {
                  fetch(cleanDownloadUrl).then(r => r.blob()).then(blob => {
                    const exportName = getDownloadFilename(filename, cleanDownloadUrl, image.output_format);
                    const newFile = new File([blob], exportName, { type: blob.type });
                    const originalFile = originalFiles?.find(f => f.name === filename);
                    if (originalFile) {
                      newFile.wpMediaId = originalFile.wpMediaId;
                      newFile.wpPostId = originalFile.wpPostId;
                    }
                    onExportWp(newFile);
                    onClose();
                  });
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-xl text-xs font-medium border border-blue-500/30 transition-all cursor-pointer"
                title="Push to WordPress"
              >
                <CloudUpload className="w-4 h-4" />
                Push to WP
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

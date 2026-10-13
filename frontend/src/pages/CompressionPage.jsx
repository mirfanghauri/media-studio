import React, { useState, useEffect, useRef, Component, useCallback } from 'react';
import axios from 'axios';
import { 
  UploadCloud, CloudDownload, X, FileImage, 
  Loader2, Eye, Download, CloudUpload, 
  CheckCircle2, AlertCircle, SlidersHorizontal, Zap, ChevronDown,
  Layers, ArrowRight, ArrowRightLeft, Sparkles, RefreshCw, AlertTriangle,
  Link, Check, Trash2, Maximize2, ShieldCheck, Info
} from 'lucide-react';
import { API_BASE, BRAND } from '../config';
import styles from './CompressionPage.module.css';

// ─── Format Choices ─────────────────────────────────────────────────────────
const OUTPUT_FORMATS = [
  { value: 'webp', label: 'WEBP', badge: 'RECOMMENDED', description: 'Up to 80% smaller, broad web compatibility', icon: '⚡' },
  { value: 'avif', label: 'AVIF', badge: 'NEXT-GEN', description: 'Highest compression ratio, modern browser standard', icon: '🚀' },
  { value: 'jpg', label: 'JPG', badge: 'UNIVERSAL', description: 'Standard format, excellent compatibility', icon: '📷' },
  { value: 'png', label: 'PNG', badge: 'LOSSLESS', description: 'Pixel-perfect quality & transparent backgrounds', icon: '🖼️' },
];

// ─── Quality Presets ────────────────────────────────────────────────────────
const QUALITY_PRESETS = [
  { label: 'Master (90%)', value: '90', desc: 'Highest visual fidelity' },
  { label: 'Balanced (80%)', value: '80', desc: 'Ideal for websites & stores' },
  { label: 'Aggressive (65%)', value: '65', desc: 'Fast mobile load speeds' },
  { label: 'Max Savings (50%)', value: '50', desc: 'Ultra-small thumbnail weight' },
];

// ─── Resize Presets ─────────────────────────────────────────────────────────
const RESIZE_PRESETS = [
  { value: 'original', label: 'Original Dimensions (No Resize)' },
  { value: '1920x1080', label: '1920×1080 — 16:9 Full HD' },
  { value: '1600x900', label: '1600×900 — 16:9 HD' },
  { value: '1440x900', label: '1440×900 — 16:10 WXGA' },
  { value: '1080x1080', label: '1080×1080 — 1:1 Instagram Square' },
  { value: '1080x1350', label: '1080×1350 — 4:5 Instagram Portrait' },
  { value: '1080x1920', label: '1080×1920 — 9:16 Story / Reel' },
];

// ─── Utility Functions ──────────────────────────────────────────────────────
function getCleanUrl(urlPath) {
  if (!urlPath) return '';
  if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) return urlPath;
  return `${API_BASE}${urlPath.replace('/api', '')}`;
}

function getDownloadFilename(filename, url, outputFormat) {
  if (!filename || filename === 'generate') {
    let ext = outputFormat ? outputFormat.toLowerCase() : '';
    if (!ext && url) {
      const match = url.match(/\.([a-zA-Z0-9]+)(\?.*)?$/);
      if (match) ext = match[1].toLowerCase();
    }
    if (!ext) ext = 'webp';
    if (ext === 'jpeg') ext = 'jpg';
    return `compressed-${Date.now()}.${ext}`;
  }

  if (filename.toLowerCase().endsWith('.zip')) {
    return filename;
  }

  let targetExt = '';
  if (outputFormat) {
    targetExt = outputFormat.toLowerCase();
    if (targetExt === 'jpeg') targetExt = 'jpg';
  } else if (url) {
    const match = url.match(/\.([a-zA-Z0-9]+)(\?.*)?$/);
    if (match && !['download', 'preview'].includes(match[1].toLowerCase())) {
      targetExt = match[1].toLowerCase();
      if (targetExt === 'jpeg') targetExt = 'jpg';
    }
  }

  if (!targetExt) return filename;

  const lastDot = filename.lastIndexOf('.');
  if (lastDot !== -1) {
    return `${filename.substring(0, lastDot)}.${targetExt}`;
  }
  return `${filename}.${targetExt}`;
}

async function triggerDownload(url, filename, outputFormat) {
  if (!url) return;
  const cleanUrl = getCleanUrl(url);
  const finalFilename = getDownloadFilename(filename, url, outputFormat);
  const token = localStorage.getItem('ms_token') || localStorage.getItem('token') || localStorage.getItem('auth_token') || sessionStorage.getItem('token');

  let targetUrl = cleanUrl;
  if (token && !targetUrl.includes('token=')) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
  }

  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const res = await fetch(targetUrl, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = finalFilename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (e) {
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = finalFilename || 'download';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

// ─── Error Boundary ─────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CompressionPage Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-[1440px] mx-auto p-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">Something went wrong</h2>
            <p className="text-sm text-red-600 dark:text-red-300 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function CompressionPage({ 
  token, 
  onOpenWpImport, 
  onExportWp,
  setPreviewModalImage,
  wpImportedFiles 
}) {
  const [files, setFiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [pollingBatchId, setPollingBatchId] = useState(null);

  // Settings State
  const [format, setFormat] = useState('webp');
  const [compression, setCompression] = useState('80');
  const [size, setSize] = useState('original');
  const [resizeBehavior, setResizeBehavior] = useState('fit');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Drag and Drop & URL import state
  const [isDragging, setIsDragging] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  // Feedback State
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const fileInputRef = useRef(null);

  // Load Initial Settings from Server
  useEffect(() => {
    if (!token) return;
    axios.get(`${API_BASE}/images/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const s = res.data;
        if (s.default_output_format) setFormat(s.default_output_format);
        if (s.imaginary_compression_level) setCompression(String(s.imaginary_compression_level));
        if (s.converter_default_size) setSize(s.converter_default_size);
        if (s.imaginary_resize_behavior) setResizeBehavior(s.imaginary_resize_behavior);
      }).catch(console.error);
  }, [token]);

  // Handle incoming WordPress media
  useEffect(() => {
    if (wpImportedFiles?.files?.length > 0) {
      processNewFiles(wpImportedFiles.files);
    }
  }, [wpImportedFiles]);

  // Batch Job Polling Logic
  useEffect(() => {
    if (!pollingBatchId) return;
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE}/images/batch/${pollingBatchId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const batchJobs = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.jobs) ? res.data.jobs : []);
        if (!Array.isArray(batchJobs) || batchJobs.length === 0) return;

        setJobs(prev => {
          const next = [...prev];
          let allDone = true;
          for (let i = 0; i < next.length; i++) {
            const currentJob = next[i];
            if (currentJob && currentJob.id) {
              const updatedJob = batchJobs.find(j => j && j.id === currentJob.id);
              if (updatedJob) {
                let meta = updatedJob.metadata;
                if (typeof meta === 'string') {
                  try { meta = JSON.parse(meta); } catch (e) { }
                }
                updatedJob.parsedMeta = (meta && typeof meta === 'object') ? meta : null;
                next[i] = { ...currentJob, ...updatedJob, parsedMeta: updatedJob.parsedMeta };
                if (updatedJob.status === 'active' || updatedJob.status === 'waiting') allDone = false;
              } else {
                allDone = false;
              }
            }
          }
          if (allDone && next.length > 0 && next.some(j => j && j.id)) {
            setPollingBatchId(null);
            setSuccessMessage('All images converted and compressed successfully!');
            clearInterval(interval);
          }
          return next;
        });
      } catch (err) {
        console.error('Error polling batch status:', err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [pollingBatchId, token]);

  // Process incoming files, get dimensions and previews
  const processNewFiles = async (newFiles) => {
    const processed = [];
    for (const f of newFiles) {
      const url = URL.createObjectURL(f);
      const dims = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve({ w: img.width, h: img.height });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = url;
      });
      processed.push({ file: f, width: dims.w, height: dims.h, previewUrl: url });
    }
    setFiles(prev => [...prev, ...processed]);
    setJobs(prev => [...prev, ...processed.map(() => null)]);
    setError(null);
  };

  // ─── Drag & Drop Handlers ─────────────────────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles = Array.from(e.dataTransfer.files).filter(file =>
        file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|tiff?)$/i.test(file.name)
      );

      if (validFiles.length === 0) {
        setError('Please drop valid image files (JPG, PNG, WEBP, AVIF).');
        return;
      }

      processNewFiles(validFiles);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processNewFiles(Array.from(e.target.files));
    }
  };

  // ─── Import from URL ──────────────────────────────────────────────────────
  const handleImportUrl = async (e) => {
    if (e) e.preventDefault();
    const cleanUrl = imageUrl.trim();
    if (!cleanUrl || !cleanUrl.startsWith('http')) {
      setError('Please enter a valid image URL starting with http:// or https://');
      return;
    }

    setIsFetchingUrl(true);
    setError(null);

    try {
      const res = await axios.post(`${API_BASE}/images/metadata/fetch-url`, { url: cleanUrl }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const { filename, dataUrl, mimeType } = res.data;
      const blobRes = await fetch(dataUrl);
      const blob = await blobRes.blob();
      const newFile = new File([blob], filename, { type: mimeType });

      await processNewFiles([newFile]);
      setImageUrl('');
      setSuccessMessage(`Loaded "${filename}" successfully from URL.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download image from the provided URL.');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setJobs(prev => prev.filter((_, i) => i !== idx));
  };

  const clearAllFiles = () => {
    setFiles([]);
    setJobs([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Submit Batch Compression ─────────────────────────────────────────────
  const handleSubmit = async () => {
    if (files.length === 0) return;
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('images', f.file));
      formData.append('operationType', 'convert');
      formData.append('outputFormat', format);
      formData.append('imaginaryCompressionLevel', String(compression));
      formData.append('imaginaryResize', size);
      formData.append('imaginaryResizeBehavior', resizeBehavior);
      formData.append('aiProvider', 'none');
      formData.append('imageCount', '1');

      const res = await axios.post(`${API_BASE}/images/edit`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data', 
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const newJobIds = res.data.jobIds || [];
      const updatedJobs = [...jobs];
      let newJobIdx = 0;
      files.forEach((_, i) => {
        if (!updatedJobs[i] || updatedJobs[i].status === 'failed' || updatedJobs[i].status === 'completed') {
          if (newJobIds[newJobIdx]) {
            updatedJobs[i] = { id: newJobIds[newJobIdx++], status: 'waiting' };
          }
        }
      });
      setJobs(updatedJobs);
      setPollingBatchId(res.data.batchId);
    } catch (err) {
      console.error('Submission error:', err);
      setError(err.response?.data?.error || 'Failed to submit compression job. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const completedJobsCount = jobs.filter(j => j && j.status === 'completed').length;
  const totalOriginalBytes = files.reduce((acc, f) => acc + (f.file?.size || 0), 0);
  const totalOptimizedBytes = jobs.reduce((acc, j, i) => {
    if (j && j.status === 'completed') {
      const meta = j.parsedMeta || {};
      return acc + (meta.optimized_size || j.file_size || files[i]?.file?.size || 0);
    }
    return acc + (files[i]?.file?.size || 0);
  }, 0);
  const totalSavedPercent = totalOriginalBytes > 0 && completedJobsCount > 0
    ? Math.max(0, Math.round(((totalOriginalBytes - totalOptimizedBytes) / totalOriginalBytes) * 100))
    : 0;

  return (
    <div className={styles.pageContainer}>
      {/* ─── Top Executive Header ───────────────────────────────────────────── */}
      <div className={styles.headerCard}>
        <div className={styles.headerTopRow}>
          <div>
            <h1 className={styles.brandTitle}>
              <ArrowRightLeft className={styles.brandIcon} />
              Image Converter & Compression Studio
              <span className={styles.badgeStudio}>IMAGINARY ENGINE</span>
            </h1>
            <p className={styles.pageSubtitle}>
              Compress, resize, and convert high-resolution photos into modern, ultra-light formats (WEBP & AVIF) with lossless clarity and Google PageSpeed optimization.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenWpImport && (
              <button
                type="button"
                onClick={onOpenWpImport}
                className={styles.urlBtn}
                title="Import media directly from connected WordPress site"
              >
                <CloudDownload className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                <span>Import WordPress</span>
              </button>
            )}

            {files.length > 0 && (
              <button
                type="button"
                onClick={clearAllFiles}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-rose-200 dark:hover:border-rose-900"
              >
                Clear Queue ({files.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Feedback Alerts ────────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-xs font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#0b6230] dark:text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900 rounded cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Two-Column Studio Layout ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ─── Left Column (2 Cols): Dropzone, URL Import & Batch Queue ────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Section 1: Upload Box & URL Import */}
          <div className={styles.glassCard}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <UploadCloud className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  1. Add Images to Convert
                </h3>
                <p className={styles.cardSubtitle}>
                  Drag & drop multiple files, import via public URL, or select from WordPress media.
                </p>
              </div>

              {files.length > 0 && (
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {files.length} {files.length === 1 ? 'file' : 'files'} in queue
                </span>
              )}
            </div>

            {/* Dropzone */}
            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
            >
              <div className="w-12 h-12 rounded-2xl bg-[#0b6230]/10 text-[#0b6230] dark:text-[#3fa66e] flex items-center justify-center mb-3 shadow-xs">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {isDragging ? 'Drop images here to add to conversion queue...' : 'Click or Drag & Drop Photos to Compress'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Supports PNG, JPG, JPEG, WEBP, AVIF, and TIFF up to 50MB each.
              </p>
            </div>

            {/* URL Import Row */}
            <form onSubmit={handleImportUrl} className={styles.urlImportRow}>
              <div className="relative flex-1">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Or import remote image via URL (https://example.com/photo.jpg)..."
                  className={styles.urlInput}
                />
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isFetchingUrl || !imageUrl.trim()}
                className={styles.urlBtn}
              >
                {isFetchingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5" />}
                <span>{isFetchingUrl ? 'Fetching...' : 'Import URL'}</span>
              </button>
            </form>

            <input
              id="compression-file-input"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
          </div>

          {/* Section 2: Batch Processing Queue */}
          {files.length > 0 && (
            <div className={styles.glassCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>
                    <FileImage className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                    2. Conversion Queue & Results
                  </h3>
                  <p className={styles.cardSubtitle}>
                    {completedJobsCount === files.length && files.length > 0
                      ? `All ${files.length} images processed (${totalSavedPercent}% total space saved)`
                      : completedJobsCount > 0
                      ? `${completedJobsCount} of ${files.length} images converted`
                      : 'Ready for batch conversion'}
                  </p>
                </div>

                {completedJobsCount > 0 && (
                  <span className={`${styles.savingsPill} ${styles.savingsPillGreen}`}>
                    Total Saved: {totalSavedPercent}%
                  </span>
                )}
              </div>

              {/* Items List */}
              <div className={styles.queueList}>
                {files.map((f, i) => {
                  const job = jobs[i];
                  const isPending = job && (job.status === 'waiting' || job.status === 'active');
                  const isCompleted = job && job.status === 'completed';
                  const isFailed = job && job.status === 'failed';

                  const meta = job?.parsedMeta || (typeof job?.metadata === 'object' ? job?.metadata : null) || (() => {
                    try { return JSON.parse(job?.metadata); } catch (_) { return null; }
                  })();

                  let percentSaved = 0;
                  let newSize = 0;
                  if (isCompleted) {
                    const orig = meta?.original_size || f.file?.size || 0;
                    const opt = meta?.optimized_size || job?.file_size || 0;
                    if (orig > 0 && opt > 0) {
                      percentSaved = Math.round(((orig - opt) / orig) * 100);
                    }
                    newSize = opt;
                  }

                  return (
                    <div key={i} className={styles.queueCard}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={f.previewUrl}
                          alt={f.file.name}
                          className={styles.queueThumb}
                        />

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {f.file.name}
                          </p>

                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] font-semibold text-[#0b6230] dark:text-[#3fa66e] bg-[#0b6230]/10 px-1.5 py-0.5 rounded font-mono">
                              {f.width}×{f.height}
                              {isCompleted && meta?.result_width ? ` → ${meta.result_width}×${meta.result_height}` : ''}
                            </span>

                            <span className={`text-[11px] ${isCompleted && newSize > 0 ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                              {(f.file.size / 1024).toFixed(1)} KB
                            </span>

                            {isCompleted && newSize > 0 && (
                              <>
                                <span className="text-xs text-slate-400">→</span>
                                <span className="text-[11px] font-bold text-[#0b6230] dark:text-[#3fa66e]">
                                  {(newSize / 1024).toFixed(1)} KB
                                </span>
                              </>
                            )}

                            {isCompleted && (
                              percentSaved > 0 ? (
                                <span className={`${styles.savingsPill} ${styles.savingsPillGreen}`}>
                                  -{percentSaved}%
                                </span>
                              ) : percentSaved < 0 ? (
                                <span className={`${styles.savingsPill} ${styles.savingsPillAmber}`}>
                                  +{Math.abs(percentSaved)}%
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">0%</span>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons on the right */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isPending && (
                          <div className="flex items-center gap-1.5 text-xs text-[#0b6230] dark:text-[#3fa66e] font-semibold">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="hidden sm:inline">Processing...</span>
                          </div>
                        )}

                        {isCompleted && (
                          <>
                            {setPreviewModalImage && (
                              <button
                                type="button"
                                onClick={() => setPreviewModalImage({ ...job, url: job.download_url, original_filename: f.file.name })}
                                className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                title="Zoom Preview"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => triggerDownload(job.download_url, f.file.name, format)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0b6230]/10 hover:bg-[#0b6230]/20 text-[#0b6230] dark:text-[#3fa66e] text-xs font-bold transition-colors border border-[#0b6230]/20 cursor-pointer"
                              title="Download converted file"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>{(meta?.outputFormat || format).toUpperCase()}</span>
                            </button>

                            {onExportWp && (
                              <button
                                type="button"
                                onClick={() => {
                                  const cleanUrl = getCleanUrl(job.download_url);
                                  fetch(cleanUrl).then(r => r.blob()).then(blob => {
                                    const newFile = new File([blob], f.file.name.replace(/\.[^/.]+$/, "") + "." + (meta?.outputFormat || format), { type: blob.type });
                                    newFile.wpMediaId = f.file.wpMediaId;
                                    newFile.wpPostId = f.file.wpPostId;
                                    onExportWp(newFile);
                                  });
                                }}
                                className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                                title="Push to WordPress Media"
                              >
                                <CloudUpload className="w-4 h-4" />
                              </button>
                            )}

                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          </>
                        )}

                        {isFailed && (
                          <AlertCircle className="w-5 h-5 text-red-500" title={job?.error || 'Failed'} />
                        )}

                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Download All Completed as ZIP */}
              {jobs.some(j => j && j.status === 'completed') && (
                <button
                  type="button"
                  onClick={() => {
                    const batchId = jobs.find(j => j && j.status === 'completed')?.batch_id;
                    if (batchId) triggerDownload(`/images/batch/${batchId}/download`, `compressed-batch-${batchId}.zip`);
                  }}
                  className={styles.downloadAllZipBtn}
                >
                  <Download className="w-4 h-4" />
                  <span>Download All Completed as ZIP Archive</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ─── Right Column (1 Col): Compression & Format Studio Settings ───── */}
        <div className="space-y-6">

          <div className={styles.glassCard}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <SlidersHorizontal className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  Compression & Format
                </h3>
                <p className={styles.cardSubtitle}>
                  Configure output file format, compression level, and resize dimensions.
                </p>
              </div>
            </div>

            {/* Target Format Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                Target Output Format
              </label>
              <div className={styles.formatGrid}>
                {OUTPUT_FORMATS.map(fmt => {
                  const isActive = format === fmt.value;
                  return (
                    <div
                      key={fmt.value}
                      onClick={() => setFormat(fmt.value)}
                      className={`${styles.formatCard} ${isActive ? styles.formatCardActive : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base">{fmt.icon}</span>
                        <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {fmt.badge}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{fmt.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{fmt.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Compression Slider & Presets */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Compression Level / Quality
                </label>
                <span className="text-xs font-mono font-bold text-[#0b6230] dark:text-[#3fa66e] bg-[#0b6230]/10 px-2 py-0.5 rounded-md border border-[#0b6230]/20">
                  {compression}% Quality
                </span>
              </div>

              {/* Quick Presets */}
              <div className={styles.presetRow}>
                {QUALITY_PRESETS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setCompression(p.value)}
                    className={`${styles.presetBtn} ${compression === p.value ? styles.presetBtnActive : ''}`}
                    title={p.desc}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <input
                type="range"
                min="1"
                max="100"
                value={compression}
                onChange={(e) => setCompression(e.target.value)}
                className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#0b6230] mt-3"
              />

              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>Max Savings (1)</span>
                <span>Balanced (80)</span>
                <span>Max Quality (100)</span>
              </div>
            </div>

            {/* Resize Dimensions */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                Resize Dimensions
              </label>
              <div className="relative">
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors cursor-pointer pr-9 shadow-xs"
                >
                  {RESIZE_PRESETS.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* Resize Mode */}
            {size !== 'original' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Resize Mode
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {resizeBehavior === 'crop' ? 'Exact target (crops edges)' : resizeBehavior === 'stretch' ? 'Exact target (stretches)' : 'Preserves aspect ratio'}
                  </span>
                </div>
                <div className={styles.presetRow}>
                  <button
                    type="button"
                    onClick={() => setResizeBehavior('fit')}
                    className={`${styles.presetBtn} ${resizeBehavior === 'fit' ? styles.presetBtnActive : ''}`}
                    title="Fit within dimensions while preserving original aspect ratio"
                  >
                    Fit (Ratio)
                  </button>
                  <button
                    type="button"
                    onClick={() => setResizeBehavior('crop')}
                    className={`${styles.presetBtn} ${resizeBehavior === 'crop' ? styles.presetBtnActive : ''}`}
                    title="Fill exact dimensions by cropping excess edges"
                  >
                    Crop (Exact)
                  </button>
                  <button
                    type="button"
                    onClick={() => setResizeBehavior('stretch')}
                    className={`${styles.presetBtn} ${resizeBehavior === 'stretch' ? styles.presetBtnActive : ''}`}
                    title="Stretch to exact dimensions"
                  >
                    Stretch
                  </button>
                </div>
              </div>
            )}

            {/* Submit CTA Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={files.length === 0 || isSubmitting}
              className={styles.submitBtn}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Converting & Compressing Queue...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>
                    {files.length === 0
                      ? 'Add Images to Convert'
                      : `Convert ${files.length} ${files.length === 1 ? 'Image' : 'Images'} to ${format.toUpperCase()} ✨`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Export with Error Boundary ─────────────────────────────────────────────
export function CompressionPageWithErrorBoundary(props) {
  return (
    <ErrorBoundary>
      <CompressionPage {...props} />
    </ErrorBoundary>
  );
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  History, CheckCircle2, AlertCircle, Activity, RefreshCw, RotateCcw,
  Trash2, Search, X, ArrowUpDown, Download, Eye,
  ChevronRight, Image as ImageIcon, Loader2, Copy, Check, Link2,
  Play, Film, FolderArchive, LayoutGrid, Table as TableIcon,
  SlidersHorizontal, Sparkles, ExternalLink
} from 'lucide-react';

import Select from '../components/common/Select';
import StatusBadge from '../components/common/StatusBadge';
import { JOB_TYPES, getJobType } from '../utils/jobTypes';
import { API_BASE, BRAND } from '../config';
import { getCleanUrl, triggerDownload, getJobFileSize, getJobDimension, formatBrowserTime, parseDate } from '../utils/urls';
import styles from './HistoryPage.module.css';

export default function HistoryPage({ token, onPreview }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterModel, setFilterModel] = useState('all');
  const [filterMode, setFilterMode] = useState('all');
  const [copiedPromptId, setCopiedPromptId] = useState(null);
  const [copiedLinkId, setCopiedLinkId] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [cleanType, setCleanType] = useState('failed');
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'
  const [inspectJob, setInspectJob] = useState(null); // Drawer inspect item
  const [showCompare, setShowCompare] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [retryingJobIds, setRetryingJobIds] = useState(new Set());
  const itemsPerPage = viewMode === 'table' ? 30 : 24;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/images/history?limit=10000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = Array.isArray(res.data) ? res.data : (res.data?.jobs || []);
      setHistory(data);
    } catch (err) {
      console.error('History fetch error:', err);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const safeHistory = Array.isArray(history) ? history : [];

  const counts = useMemo(() => {
    const total = safeHistory.length;
    const edit = safeHistory.filter(j => (j.operation_type || 'edit') === 'edit').length;
    const generate = safeHistory.filter(j => j.operation_type === 'generate').length;
    const convert = safeHistory.filter(j => j.operation_type === 'convert').length;
    const slideshow = safeHistory.filter(j => j.operation_type === 'slideshow').length;
    const metadata = safeHistory.filter(j => j.operation_type === 'metadata').length;
    const completed = safeHistory.filter(j => j.status === 'completed').length;
    const failed = safeHistory.filter(j => j.status === 'failed').length;
    const active = safeHistory.filter(j => j.status === 'active' || j.status === 'waiting').length;
    const totalCost = safeHistory.reduce((acc, j) => acc + (Number(j.cost) || 0), 0);
    const totalTokens = safeHistory.reduce((acc, j) => acc + (Number(j.tokens_used) || 0), 0);
    return { total, edit, generate, convert, slideshow, metadata, completed, failed, active, totalCost, totalTokens };
  }, [safeHistory]);

  const PROVIDER_LABELS = {
    openai: 'OpenAI Direct',
    azure: 'Azure OpenAI',
    vertex: 'Google Vertex AI',
    bedrock: 'AWS Bedrock',
    xai: 'xAI (Grok)',
  };

  const uniqueProviders = useMemo(() => {
    const set = new Set();
    safeHistory.forEach(j => {
      if (j.ai_provider) set.add(j.ai_provider);
    });
    return Array.from(set).sort();
  }, [safeHistory]);

  const uniqueModels = useMemo(() => {
    const set = new Set();
    safeHistory.forEach(j => {
      if (j.model) set.add(j.model);
    });
    return Array.from(set).sort();
  }, [safeHistory]);

  const filtered = useMemo(() => {
    const list = safeHistory.filter(j => {
      if (filterType !== 'all') {
        const opType = j.operation_type || 'edit';
        if (opType !== filterType) return false;
      }
      if (filterStatus !== 'all') {
        if (filterStatus === 'failed' && j.status !== 'failed') return false;
        if (filterStatus === 'completed' && j.status !== 'completed') return false;
        if (filterStatus === 'active' && !['active', 'waiting'].includes(j.status)) return false;
      }
      if (filterProvider !== 'all') {
        const p = (j.ai_provider || '').toLowerCase();
        if (p !== filterProvider.toLowerCase()) return false;
      }
      if (filterModel !== 'all') {
        if ((j.model || '') !== filterModel) return false;
      }
      if (filterMode !== 'all') {
        const m = (j.processing_mode || 'realtime').toLowerCase();
        if (m !== filterMode.toLowerCase()) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const filename = (j.original_filename || '').toLowerCase();
        const prompt = (j.prompt || '').toLowerCase();
        const error = (j.error || '').toLowerCase();
        const model = (j.model || '').toLowerCase();
        const size = (j.image_size || '').toLowerCase();
        const format = (j.output_format || '').toLowerCase();
        const status = (j.status || '').toLowerCase();
        const mode = (j.processing_mode || 'realtime').toLowerCase();
        if (
          !filename.includes(q) &&
          !prompt.includes(q) &&
          !error.includes(q) &&
          !model.includes(q) &&
          !size.includes(q) &&
          !format.includes(q) &&
          !status.includes(q) &&
          !mode.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });

    if (sortBy === 'oldest') {
      return [...list].sort((a, b) => {
        const dateA = a._t || (a._t = parseDate(a.created_at)?.getTime() || 0);
        const dateB = b._t || (b._t = parseDate(b.created_at)?.getTime() || 0);
        return dateA - dateB;
      });
    }
    return list;
  }, [safeHistory, filterType, filterStatus, filterProvider, filterModel, filterMode, searchQuery, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterStatus, filterProvider, filterModel, filterMode, searchQuery, sortBy]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    return filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const allSelected = paginatedItems.length > 0 && paginatedItems.every(j => selectedIds.has(j.id));

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        paginatedItems.forEach(j => next.delete(j.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        paginatedItems.forEach(j => next.add(j.id));
        return next;
      });
    }
  };

  const downloadSelectedZip = async () => {
    if (selectedIds.size === 0) return;
    setDownloadingZip(true);
    try {
      const idList = Array.from(selectedIds);
      const res = await axios.post(`${API_BASE}/images/jobs/download-zip`, {
        ids: idList,
        jobIds: idList
      }, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `media-studio-selected-${selectedIds.size}-images.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download ZIP:', err);
      let errMsg = err.message || 'No completed jobs found.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.error) errMsg = json.error;
        } catch (_) {}
      } else if (err.response?.data?.error) {
        errMsg = err.response.data.error;
      }
      alert('Failed to download ZIP: ' + errMsg);
    } finally {
      setDownloadingZip(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected job(s)? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_BASE}/images/jobs`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { ids: Array.from(selectedIds) }
      });
      setSelectedIds(new Set());
      if (inspectJob && selectedIds.has(inspectJob.id)) setInspectJob(null);
      fetchHistory();
    } catch (err) {
      alert('Failed to delete jobs');
    }
  };

  const cleanByType = async () => {
    try {
      await axios.delete(`${API_BASE}/images/jobs/type/${cleanType}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowCleanConfirm(false);
      setSelectedIds(new Set());
      setInspectJob(null);
      fetchHistory();
    } catch (err) {
      alert('Failed to clean history');
    }
  };

  const selectedFailedCount = useMemo(() => {
    return safeHistory.filter(j => selectedIds.has(j.id) && j.status === 'failed').length;
  }, [safeHistory, selectedIds]);

  const handleRetryJob = async (job) => {
    if (!job || !job.id) return;
    setRetryingJobIds(prev => new Set(prev).add(job.id));
    try {
      await axios.post(`${API_BASE}/images/jobs/${job.id}/retry`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Mark as waiting in local state immediately so user sees responsiveness
      setHistory(prev => prev.map(item => item.id === job.id ? { ...item, status: 'waiting', error: null } : item));
      if (inspectJob && inspectJob.id === job.id) {
        setInspectJob(prev => ({ ...prev, status: 'waiting', error: null }));
      }
      setTimeout(() => {
        fetchHistory();
      }, 1200);
    } catch (err) {
      console.error('Failed to retry job:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to retry job';
      alert(`Retry Failed: ${errMsg}`);
    } finally {
      setRetryingJobIds(prev => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const handleRetrySelected = async () => {
    const failedSelected = safeHistory.filter(j => selectedIds.has(j.id) && j.status === 'failed');
    if (failedSelected.length === 0) return;
    const failedIds = failedSelected.map(j => j.id);

    setRetryingJobIds(prev => {
      const next = new Set(prev);
      failedIds.forEach(id => next.add(id));
      return next;
    });

    try {
      await axios.post(`${API_BASE}/images/jobs/retry`, { ids: failedIds }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      setHistory(prev => prev.map(item => failedIds.includes(item.id) ? { ...item, status: 'waiting', error: null } : item));
      if (inspectJob && failedIds.includes(inspectJob.id)) {
        setInspectJob(prev => ({ ...prev, status: 'waiting', error: null }));
      }
      setTimeout(() => {
        fetchHistory();
      }, 1200);
    } catch (err) {
      console.error('Failed to retry selected jobs:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to retry selected jobs';
      alert(`Retry Failed: ${errMsg}`);
    } finally {
      setRetryingJobIds(prev => {
        const next = new Set(prev);
        failedIds.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  const resetAllFilters = () => {
    setFilterType('all');
    setFilterStatus('all');
    setFilterProvider('all');
    setFilterModel('all');
    setFilterMode('all');
    setSearchQuery('');
    setSortBy('newest');
  };

  const isFiltered = filterType !== 'all' || filterStatus !== 'all' || filterProvider !== 'all' || filterModel !== 'all' || filterMode !== 'all' || searchQuery.trim().length > 0;

  const CLEAN_OPTIONS = [
    { value: 'failed', label: '❌ All Failed Jobs' },
    { value: 'edit', label: '✏️ All AI Edit Jobs' },
    { value: 'generate', label: '✨ All AI Generation Jobs' },
    { value: 'convert', label: '🔄 All Conversion Jobs' },
    { value: 'slideshow', label: '🎬 All Slideshow Jobs' },
    { value: 'metadata', label: '🏷️ All Metadata Jobs' },
  ];

  // ─── TanStack Table Columns ──────────────────────────────────────────────────
  const columns = useMemo(() => [
    {
      id: 'serial',
      header: 'S/No',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-400 dark:text-slate-500 font-medium">
          {(currentPage - 1) * itemsPerPage + row.index + 1}
        </span>
      ),
    },
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleSelectAll}
          className="rounded border-slate-300 dark:border-slate-700 accent-[#0b6230] cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.original.id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelect(row.original.id);
          }}
          className="rounded border-slate-300 dark:border-slate-700 accent-[#0b6230] cursor-pointer"
        />
      ),
    },
    {
      id: 'preview',
      header: 'Preview',
      cell: ({ row }) => {
        const job = row.original;
        const isVideo = job.operation_type === 'slideshow' || 
                        job.output_format?.toLowerCase() === 'mp4' || 
                        job.original_filename?.toLowerCase().endsWith('.mp4');
        const isZip = job.output_format?.toLowerCase() === 'zip' || 
                      job.original_filename?.toLowerCase().endsWith('.zip') ||
                      (job.result_path || '').toLowerCase().endsWith('.zip');
        const cleanUrl = getCleanUrl(job.preview_url || job.download_url);
        const cleanDownloadUrl = getCleanUrl(job.download_url || job.preview_url);

        if (!cleanUrl && !isZip) {
          return (
            <div className={styles.tableThumb}>
              <ImageIcon className="w-4 h-4 text-slate-400" />
            </div>
          );
        }

        return (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (isZip) {
                triggerDownload(cleanDownloadUrl, job.original_filename, token);
              } else if (onPreview) {
                onPreview(job);
              }
            }}
            className={styles.tableThumb}
            title={isZip ? 'Download ZIP' : 'Preview'}
          >
            {isVideo ? (
              <>
                <video
                  src={cleanUrl}
                  preload="metadata"
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 fill-white text-white" />
                </div>
              </>
            ) : isZip ? (
              <FolderArchive className="w-5 h-5 text-emerald-500" />
            ) : (
              <img
                src={cleanUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  if (cleanDownloadUrl && e.target.src !== cleanDownloadUrl) {
                    e.target.src = cleanDownloadUrl;
                  } else {
                    e.target.style.display = 'none';
                  }
                }}
              />
            )}
          </div>
        );
      },
    },
    {
      id: 'id',
      header: 'Job ID & File',
      cell: ({ row }) => {
        const job = row.original;
        const shortId = (job.id || '').substring(0, 8);
        return (
          <div className="flex flex-col gap-0.5 max-w-[200px]">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                #{shortId}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(job.id);
                  setCopiedLinkId(job.id);
                  setTimeout(() => setCopiedLinkId(null), 1500);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Copy Full ID"
              >
                {copiedLinkId === job.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <span className="text-[11px] text-slate-500 truncate" title={job.original_filename}>
              {job.original_filename || 'Untitled'}
            </span>
          </div>
        );
      },
    },
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const jobType = getJobType(row.original);
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${jobType.color}`}>
            {jobType.icon}
            <span>{jobType.label}</span>
          </span>
        );
      },
    },
    {
      id: 'provider',
      header: 'Provider / Model',
      cell: ({ row }) => {
        const job = row.original;
        const prov = (job.ai_provider || '').toLowerCase();
        const isConvert = job.operation_type === 'convert' || prov === 'none' || prov === 'local';
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
              {isConvert ? 'Local (Imaginary)' : (PROVIDER_LABELS[prov] || job.ai_provider || 'Direct')}
            </span>
            {!isConvert && job.model && (
              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                {job.model}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'mode',
      header: 'Mode',
      cell: ({ row }) => {
        const job = row.original;
        const prov = (job.ai_provider || '').toLowerCase();
        const isConvert = job.operation_type === 'convert' || prov === 'none' || prov === 'local';
        if (isConvert) {
          return <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">—</span>;
        }
        const isBatch = job.processing_mode === 'batch';
        return isBatch ? (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap"
            title="OpenAI Batch API (50% Cost Discount)"
          >
            <span>📦 Batch</span>
            <span className="text-[9px] opacity-75 font-semibold">(50% off)</span>
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 whitespace-nowrap"
            title="Real-time Execution"
          >
            <span>⚡ Live</span>
          </span>
        );
      },
    },
    {
      id: 'resolution',
      header: 'Resolution & Size',
      cell: ({ row }) => {
        const job = row.original;
        const dim = imageDimensions[job.id] || getJobDimension(job) || job.image_size || '—';
        const size = getJobFileSize(job);
        return (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="font-mono text-slate-700 dark:text-slate-300">{dim}</span>
            <span className="text-[11px] text-slate-500">
              {job.output_format?.toUpperCase() || 'FILE'}{size ? ` · ${size}` : ''}
            </span>
          </div>
        );
      },
    },
    {
      id: 'cost',
      header: 'Cost / Tokens',
      cell: ({ row }) => {
        const job = row.original;
        const cost = Number(job.cost) || 0;
        const tokens = Number(job.tokens_used) || 0;
        if (cost === 0 && tokens === 0) return <span className="text-xs text-slate-400">—</span>;
        return (
          <div className="flex flex-col gap-1">
            {cost > 0 && (
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                ${cost.toFixed(4)}
              </span>
            )}
            {tokens > 0 && (
              <span className="text-[10px] font-mono text-slate-500">
                ⚡ {tokens.toLocaleString()}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'created_at',
      header: 'Created',
      cell: ({ row }) => {
        const fullLocalTime = formatBrowserTime(row.original.created_at, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        });
        return (
          <span
            className="text-xs text-slate-500 whitespace-nowrap cursor-default"
            title={`Local Browser Time: ${fullLocalTime}`}
          >
            {formatBrowserTime(row.original.created_at)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const job = row.original;
        const isCompleted = job.status === 'completed';
        const isFailed = job.status === 'failed';
        const cleanDownloadUrl = getCleanUrl(job.download_url || job.preview_url);

        return (
          <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
            {isCompleted && cleanDownloadUrl && (
              <>
                <button
                  type="button"
                  onClick={() => onPreview && onPreview(job)}
                  className={`${styles.tableActionBtn} ${styles.actionBtnPreview}`}
                  title="Fullscreen Preview"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => triggerDownload(cleanDownloadUrl, job.original_filename, job.output_format)}
                  className={`${styles.tableActionBtn} ${styles.actionBtnDownload}`}
                  title="Download File"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const fullUrl = `${window.location.origin}${cleanDownloadUrl}`;
                    navigator.clipboard.writeText(fullUrl);
                    setCopiedLinkId(job.id);
                    setTimeout(() => setCopiedLinkId(null), 2000);
                  }}
                  className={`${styles.tableActionBtn} ${styles.actionBtnLink} ${
                    copiedLinkId === job.id ? '!bg-emerald-500/20 !text-emerald-500 !border-emerald-500/30' : ''
                  }`}
                  title={copiedLinkId === job.id ? 'Copied URL!' : 'Copy Direct Download Link'}
                >
                  {copiedLinkId === job.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Link2 className="w-4 h-4" />}
                </button>
              </>
            )}
            {/* Retry Button - Specific for failed jobs */}
            {isFailed && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetryJob(job);
                }}
                disabled={retryingJobIds.has(job.id)}
                className={`${styles.tableActionBtn} ${styles.actionBtnRetry}`}
                title={retryingJobIds.has(job.id) ? "Retrying job..." : "Retry Failed Job"}
              >
                {retryingJobIds.has(job.id) ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Copy Prompt Button */}
            {job.prompt && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(job.prompt);
                  setCopiedPromptId(job.id);
                  setTimeout(() => setCopiedPromptId(null), 2000);
                }}
                className={`${styles.tableActionBtn} ${styles.actionBtnPrompt} ${
                  copiedPromptId === job.id ? '!bg-amber-500/20 !text-amber-500 !border-amber-500/30' : ''
                }`}
                title={copiedPromptId === job.id ? 'Copied Prompt!' : 'Copy Prompt'}
              >
                {copiedPromptId === job.id ? <Check className="w-4 h-4 text-amber-500" /> : <Copy className="w-4 h-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setSelectedIds(new Set([job.id]));
                deleteSelected();
              }}
              className={`${styles.tableActionBtn} ${styles.actionBtnDelete}`}
              title="Delete Job"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ], [allSelected, selectedIds, retryingJobIds, imageDimensions, copiedLinkId, copiedPromptId, currentPage, itemsPerPage, onPreview, token]);

  const table = useReactTable({
    data: paginatedItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={styles.pageContainer}>
      {/* ─── Header & Top Statistics ────────────────────────────────────────── */}
      <div className={styles.headerCard}>
        <div>
          <h1 className={styles.brandTitle}>
            <History className={styles.brandIcon} />
            Job History & Media Assets
          </h1>
          <div className="flex items-center gap-2.5 text-xs text-slate-500 mt-1.5 flex-wrap">
            <span>{counts.total} total jobs</span>
            <span>·</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{counts.completed} completed</span>
            {counts.failed > 0 && (
              <>
                <span>·</span>
                <span
                  className="text-red-500 font-medium cursor-pointer hover:underline"
                  onClick={() => setFilterStatus('failed')}
                >
                  {counts.failed} failed
                </span>
              </>
            )}
            {counts.active > 0 && (
              <>
                <span>·</span>
                <span className="text-blue-500 font-medium">{counts.active} processing</span>
              </>
            )}
            {counts.totalCost > 0 && (
              <>
                <span>·</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  💰 Total Spend: ${counts.totalCost.toFixed(4)}
                </span>
              </>
            )}
            {counts.totalTokens > 0 && (
              <>
                <span>·</span>
                <span className="text-purple-600 dark:text-purple-400 font-medium bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                  ⚡ {counts.totalTokens.toLocaleString()} tokens
                </span>
              </>
            )}
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-[#0b6230] dark:text-[#3fa66e] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Table View"
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-800 text-[#0b6230] dark:text-[#3fa66e] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={fetchHistory}
            className={styles.btnSecondary}
            title="Refresh list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <div className="relative">
            <button
              onClick={() => setShowCleanConfirm(!showCleanConfirm)}
              className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 px-3.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clean History
            </button>
            {showCleanConfirm && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 w-72">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">Delete all jobs of selected category:</p>
                <Select value={cleanType} onChange={setCleanType} options={CLEAN_OPTIONS} />
                <div className="flex gap-2 mt-3">
                  <button onClick={cleanByType} className="flex-1 py-1.5 text-xs text-white rounded-lg font-medium bg-red-600 hover:bg-red-700 transition-colors cursor-pointer">
                    Delete All
                  </button>
                  <button onClick={() => setShowCleanConfirm(false)} className="flex-1 py-1.5 text-xs text-slate-600 dark:text-slate-400 rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Filter + Search + Selection Toolbar ────────────────────────────── */}
      <div className={styles.toolbarCard}>
        {/* Row 1: Status & Type Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">Status:</span>
            <button
              onClick={() => setFilterStatus('all')}
              className={`${styles.pillBtn} ${filterStatus === 'all' ? styles.pillBtnActive : styles.pillBtnInactive}`}
            >
              All Status
              <span className={styles.pillBadge}>{counts.total}</span>
            </button>
            <button
              onClick={() => setFilterStatus('completed')}
              className={`${styles.pillBtn} ${filterStatus === 'completed' ? styles.pillBtnActive : styles.pillBtnInactive}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
              <span className={styles.pillBadge}>{counts.completed}</span>
            </button>
            <button
              onClick={() => setFilterStatus('failed')}
              className={`${styles.pillBtn} ${
                filterStatus === 'failed'
                  ? 'bg-red-600 text-white shadow-md'
                  : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Failed Jobs
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">{counts.failed}</span>
            </button>
            {counts.active > 0 && (
              <button
                onClick={() => setFilterStatus('active')}
                className={`${styles.pillBtn} ${
                  filterStatus === 'active'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/40'
                }`}
              >
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                Processing
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">{counts.active}</span>
              </button>
            )}
          </div>

          {/* Type Filter Group */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">Type:</span>
            {JOB_TYPES.map(t => {
              const count = t.value === 'all' ? counts.total : counts[t.value] || 0;
              const isActive = filterType === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setFilterType(t.value)}
                  className={`${styles.pillBtn} ${isActive ? styles.pillBtnActive : styles.pillBtnInactive}`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  <span className={styles.pillBadge}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Search, Provider, Model, Sort & Selection */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by prompt, filename, error, model..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* By Provider */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-semibold text-[11px] uppercase tracking-wider">Provider:</span>
              <select
                value={filterProvider}
                onChange={e => setFilterProvider(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#0b6230] transition-colors cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-slate-900">All Providers</option>
                {uniqueProviders.map(p => (
                  <option key={p} value={p} className="bg-white dark:bg-slate-900">
                    {PROVIDER_LABELS[p.toLowerCase()] || p}
                  </option>
                ))}
              </select>
            </div>

            {/* By Model */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-semibold text-[11px] uppercase tracking-wider">Model:</span>
              <select
                value={filterModel}
                onChange={e => setFilterModel(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#0b6230] transition-colors cursor-pointer max-w-[170px]"
              >
                <option value="all" className="bg-white dark:bg-slate-900">All Models</option>
                {uniqueModels.map(m => (
                  <option key={m} value={m} className="bg-white dark:bg-slate-900">
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* By Mode */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-semibold text-[11px] uppercase tracking-wider">Mode:</span>
              <select
                value={filterMode}
                onChange={e => setFilterMode(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#0b6230] transition-colors cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-slate-900">All Modes</option>
                <option value="batch" className="bg-white dark:bg-slate-900">📦 Batch (50% Off)</option>
                <option value="realtime" className="bg-white dark:bg-slate-900">⚡ Live</option>
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#0b6230] transition-colors cursor-pointer"
              >
                <option value="newest" className="bg-white dark:bg-slate-900">Newest First</option>
                <option value="oldest" className="bg-white dark:bg-slate-900">Oldest First</option>
              </select>
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                {selectedFailedCount > 0 && (
                  <button
                    onClick={handleRetrySelected}
                    disabled={Array.from(selectedIds).some(id => retryingJobIds.has(id))}
                    className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 transition-all cursor-pointer shadow-xs disabled:opacity-50 font-medium"
                    title="Retry selected failed jobs"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${Array.from(selectedIds).some(id => retryingJobIds.has(id)) ? 'animate-spin' : ''}`} />
                    Retry ({selectedFailedCount})
                  </button>
                )}
                <button
                  onClick={downloadSelectedZip}
                  disabled={downloadingZip}
                  className="flex items-center gap-1.5 text-xs text-[#0b6230] dark:text-[#3fa66e] hover:bg-[#0b6230]/20 px-3 py-1.5 rounded-xl bg-[#0b6230]/10 border border-[#0b6230]/30 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Download className={`w-3.5 h-3.5 ${downloadingZip ? 'animate-bounce' : ''}`} />
                  {downloadingZip ? 'Preparing ZIP…' : `ZIP (${selectedIds.size})`}
                </button>
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-500/20 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 transition-all cursor-pointer shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete ({selectedIds.size})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Active Filters Summary Bar */}
        {isFiltered && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-200/40 dark:border-slate-800/40 text-xs text-slate-500">
            <div className="flex items-center gap-2 flex-wrap">
              <span>Showing <strong className="text-slate-800 dark:text-slate-200">{filtered.length}</strong> of {history.length} jobs</span>
              {filterStatus !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Status: {filterStatus}
                  <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setFilterStatus('all')} />
                </span>
              )}
              {filterType !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Type: {filterType}
                  <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setFilterType('all')} />
                </span>
              )}
              {filterProvider !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[#0b6230]/10 text-[#0b6230] dark:text-[#3fa66e] border border-[#0b6230]/20 font-medium">
                  Provider: {PROVIDER_LABELS[filterProvider.toLowerCase()] || filterProvider}
                  <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setFilterProvider('all')} />
                </span>
              )}
              {filterModel !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-mono">
                  Model: {filterModel}
                  <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setFilterModel('all')} />
                </span>
              )}
              {filterMode !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                  Mode: {filterMode === 'batch' ? '📦 Batch (50% Off)' : '⚡ Live'}
                  <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setFilterMode('all')} />
                </span>
              )}
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Search: "{searchQuery}"
                  <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setSearchQuery('')} />
                </span>
              )}
            </div>
            <button onClick={resetAllFilters} className="text-xs text-[#0b6230] dark:text-[#3fa66e] hover:underline font-medium cursor-pointer">
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* ─── Main Content Display (Table vs Grid) ──────────────────────────── */}
      {loading ? (
        <div className="text-center py-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <Loader2 className="w-8 h-8 animate-spin text-[#0b6230] dark:text-[#3fa66e] mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading history records…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xs">
          {filterStatus === 'failed' ? (
            <>
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-80" />
              <p className="text-slate-800 dark:text-slate-200 font-semibold text-base">No Failed Jobs</p>
              <p className="text-xs text-slate-500 mt-1">All processed jobs completed successfully with no errors.</p>
            </>
          ) : (
            <>
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
              <p className="text-slate-800 dark:text-slate-200 font-semibold text-base">
                {history.length === 0 ? 'No jobs yet' : 'No matching jobs found'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {history.length === 0
                  ? 'Head to the Studio tab to start generating or editing images.'
                  : 'Try adjusting your type, status, or search filters.'}
              </p>
              {isFiltered && (
                <button
                  onClick={resetAllFilters}
                  className="mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
            </>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* ─── TanStack High-Performance Data Table View ───────────────────── */
        <div className={styles.tableWrapper}>
          <table className={styles.dataTable}>
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => {
                const job = row.original;
                const isSelected = selectedIds.has(job.id);
                return (
                  <tr
                    key={row.id}
                    onClick={() => setInspectJob(job)}
                    className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ─── Media Grid Cards View ──────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedItems.map(job => {
            const jobType = getJobType(job);
            const isSelected = selectedIds.has(job.id);
            const isFailed = job.status === 'failed';
            const cleanUrl = getCleanUrl(job.preview_url || job.download_url);
            const cleanDownloadUrl = getCleanUrl(job.download_url || job.preview_url);
            const isVideo = job.operation_type === 'slideshow' || 
                            job.output_format?.toLowerCase() === 'mp4' || 
                            job.original_filename?.toLowerCase().endsWith('.mp4');
            const isZip = job.output_format?.toLowerCase() === 'zip' || 
                          job.original_filename?.toLowerCase().endsWith('.zip') ||
                          (job.result_path || '').toLowerCase().endsWith('.zip');

            return (
              <div
                key={job.id}
                onClick={() => setInspectJob(job)}
                className={`relative bg-white dark:bg-slate-900 border rounded-2xl overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 shadow-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#0b6230] ring-2 ring-[#0b6230]/30'
                    : isFailed
                    ? 'border-red-300 dark:border-red-900/50'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Checkbox */}
                <div className="absolute top-2.5 left-2.5 z-20" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(job.id)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 accent-[#0b6230] cursor-pointer shadow-xs"
                  />
                </div>

                {/* Media Preview Aspect Box */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isZip) {
                      triggerDownload(cleanDownloadUrl, job.original_filename, token);
                    } else if (onPreview) {
                      onPreview(job);
                    } else {
                      setInspectJob(job);
                    }
                  }}
                  className="aspect-video bg-slate-950 overflow-hidden cursor-pointer group relative border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-center"
                >
                  {isVideo ? (
                    <>
                      <video
                        src={cleanUrl}
                        preload="metadata"
                        muted
                        playsInline
                        className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300 pointer-events-none"
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/5 flex items-center justify-center transition-colors">
                        <div className="w-9 h-9 rounded-full bg-[#0b6230]/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <Play className="w-4 h-4 ml-0.5 fill-current" />
                        </div>
                      </div>
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium flex items-center gap-1">
                        <Film className="w-3 h-3 text-emerald-400" /> Video
                      </span>
                    </>
                  ) : isZip ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-900 text-slate-400">
                      <FolderArchive className="w-10 h-10 text-emerald-500/80 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-medium text-slate-300">ZIP Archive</span>
                    </div>
                  ) : cleanUrl ? (
                    <img
                      src={cleanUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                      onError={e => {
                        if (cleanDownloadUrl && e.target.src !== cleanDownloadUrl) {
                          e.target.src = cleanDownloadUrl;
                        } else {
                          e.target.parentElement.style.display = 'none';
                        }
                      }}
                    />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-600" />
                  )}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-medium backdrop-blur-[2px]">
                    {isZip ? <Download className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {isZip ? 'Download' : 'Preview'}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <StatusBadge status={job.status} />
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${jobType.color}`}>
                      {jobType.icon} {jobType.label}
                    </span>
                    {job.processing_mode === 'batch' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                        📦 Batch
                      </span>
                    )}
                    <span
                      className="ml-auto text-[10px] text-slate-500 cursor-default"
                      title={`Local Browser Time: ${formatBrowserTime(job.created_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`}
                    >
                      {formatBrowserTime(job.created_at, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate mb-1" title={job.original_filename}>
                    {job.original_filename || 'Untitled'}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate font-mono mb-2.5">
                    {job.model} · {imageDimensions[job.id] || getJobDimension(job) || job.image_size || '—'}
                  </p>

                  {/* Grid Card Quick Actions */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                    {/* Retry Action for Failed Job */}
                    {job.status === 'failed' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetryJob(job);
                        }}
                        disabled={retryingJobIds.has(job.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                        title="Retry Failed Job"
                      >
                        {retryingJobIds.has(job.id) ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Retry</span>
                      </button>
                    )}

                    {job.status === 'completed' && cleanDownloadUrl && (
                      <>
                        <button
                          type="button"
                          onClick={() => onPreview && onPreview(job)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Preview</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDownload(cleanDownloadUrl, job.original_filename, job.output_format)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-[#0b6230]/10 hover:bg-[#0b6230]/20 text-[#0b6230] dark:text-[#3fa66e] border border-[#0b6230]/30 transition-all cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Get</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const fullUrl = `${window.location.origin}${cleanDownloadUrl}`;
                            navigator.clipboard.writeText(fullUrl);
                            setCopiedLinkId(job.id);
                            setTimeout(() => setCopiedLinkId(null), 2000);
                          }}
                          className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                            copiedLinkId === job.id
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                          title="Copy direct download link"
                        >
                          {copiedLinkId === job.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Link2 className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    )}
                    {job.prompt && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(job.prompt);
                          setCopiedPromptId(job.id);
                          setTimeout(() => setCopiedPromptId(null), 2000);
                        }}
                        className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                          copiedPromptId === job.id
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                        title="Copy prompt"
                      >
                        {copiedPromptId === job.id ? <Check className="w-3.5 h-3.5 text-amber-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIds(new Set([job.id]));
                        deleteSelected();
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 dark:hover:border-red-900/30 transition-all cursor-pointer ml-auto"
                      title="Delete job"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Pagination ────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5 rotate-180 text-slate-600 dark:text-slate-400" />
          </button>
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Page {currentPage} of {totalPages} ({filtered.length} items)
          </div>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 disabled:opacity-50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
      )}

      {/* ─── Slide-out Detail Inspection Drawer ─────────────────────────────── */}
      {inspectJob && (
        <div className={styles.drawerOverlay} onClick={() => setInspectJob(null)}>
          <div className={styles.drawerPanel} onClick={e => e.stopPropagation()}>
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <StatusBadge status={inspectJob.status} />
                <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                  #{inspectJob.id?.substring(0, 10)}
                </span>
              </div>
              <button
                onClick={() => setInspectJob(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Media Preview Box */}
            <div className="p-4 flex flex-col gap-4">
              <div className="aspect-video bg-black rounded-xl overflow-hidden relative flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-inner">
                {(() => {
                  const isVideo = inspectJob.operation_type === 'slideshow' || 
                                  inspectJob.output_format?.toLowerCase() === 'mp4' || 
                                  inspectJob.original_filename?.toLowerCase().endsWith('.mp4');
                  const isZip = inspectJob.output_format?.toLowerCase() === 'zip' || 
                                inspectJob.original_filename?.toLowerCase().endsWith('.zip') ||
                                (inspectJob.result_path || '').toLowerCase().endsWith('.zip');
                  const cleanPreviewUrl = getCleanUrl(inspectJob.preview_url || inspectJob.download_url);
                  const cleanDownloadUrl = getCleanUrl(inspectJob.download_url || inspectJob.preview_url);

                  if (isVideo && cleanPreviewUrl) {
                    return (
                      <video
                        src={cleanPreviewUrl}
                        controls
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    );
                  }

                  if (isZip) {
                    return (
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                        <FolderArchive className="w-12 h-12 text-emerald-500" />
                        <span className="text-xs font-medium text-slate-300">ZIP File Package</span>
                      </div>
                    );
                  }

                  if (inspectJob.original_input_url && showCompare) {
                    return (
                      <img
                        src={getCleanUrl(inspectJob.original_input_url)}
                        alt="Original"
                        className="w-full h-full object-contain"
                      />
                    );
                  }

                  if (cleanPreviewUrl) {
                    return (
                      <img
                        src={cleanPreviewUrl}
                        alt="Output"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          if (cleanDownloadUrl && e.target.src !== cleanDownloadUrl) {
                            e.target.src = cleanDownloadUrl;
                          }
                        }}
                      />
                    );
                  }

                  return <ImageIcon className="w-10 h-10 text-slate-600" />;
                })()}

                {inspectJob.original_input_url && (
                  <div className="absolute bottom-2 left-2 z-10">
                    <button
                      onClick={() => setShowCompare(!showCompare)}
                      className="px-2.5 py-1 rounded-lg bg-black/75 text-white text-[11px] font-medium backdrop-blur-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      {showCompare ? 'Showing: Original' : 'Showing: Result'}
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons: Download, Fullscreen & Copy Link */}
              <div className="flex gap-2 flex-wrap">
                {inspectJob.download_url && (
                  <button
                    onClick={() => triggerDownload(inspectJob.download_url, inspectJob.original_filename, inspectJob.output_format)}
                    className={`flex-1 ${styles.btnPrimary}`}
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                )}
                {onPreview && inspectJob.preview_url && (
                  <button
                    onClick={() => onPreview(inspectJob)}
                    className={`flex-1 ${styles.btnSecondary}`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Fullscreen
                  </button>
                )}
                {inspectJob.download_url && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const fullUrl = `${window.location.origin}${getCleanUrl(inspectJob.download_url)}`;
                      navigator.clipboard.writeText(fullUrl);
                      setCopiedLinkId(inspectJob.id);
                      setTimeout(() => setCopiedLinkId(null), 2000);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                      copiedLinkId === inspectJob.id
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                    title="Copy direct download link"
                  >
                    {copiedLinkId === inspectJob.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Prompt Box */}
              {inspectJob.prompt && (
                <div className="bg-slate-50 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Prompt</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inspectJob.prompt);
                        setCopiedPromptId(inspectJob.id);
                        setTimeout(() => setCopiedPromptId(null), 1500);
                      }}
                      className="text-xs text-[#0b6230] dark:text-[#3fa66e] flex items-center gap-1"
                    >
                      {copiedPromptId === inspectJob.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedPromptId === inspectJob.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed italic select-text">
                    "{inspectJob.prompt}"
                  </p>
                </div>
              )}

              {/* Detailed Specs Table */}
              <div className="bg-slate-50 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-2 text-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Metadata & Parameters
                </span>
                <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                  <span className="text-slate-500">Operation Type</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">{inspectJob.operation_type || 'edit'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                  <span className="text-slate-500">AI Provider</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {inspectJob.operation_type === 'convert' || inspectJob.ai_provider === 'none' ? 'Local (Imaginary)' : (PROVIDER_LABELS[inspectJob.ai_provider?.toLowerCase()] || inspectJob.ai_provider || '—')}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                  <span className="text-slate-500">Model</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {inspectJob.operation_type === 'convert' ? '—' : (inspectJob.model || '—')}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                  <span className="text-slate-500">Processing Mode</span>
                  {inspectJob.operation_type === 'convert' || inspectJob.ai_provider === 'none' || inspectJob.ai_provider === 'local' ? (
                    <span className="text-slate-400 dark:text-slate-500 font-mono">—</span>
                  ) : inspectJob.processing_mode === 'batch' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-mono">
                      📦 Batch (50% Off)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-mono">
                      ⚡ Live
                    </span>
                  )}
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                  <span className="text-slate-500">Dimensions</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{inspectJob.image_size || getJobDimension(inspectJob) || '—'}</span>
                </div>
                {getJobFileSize(inspectJob) && (
                  <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                    <span className="text-slate-500">File Size</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{getJobFileSize(inspectJob)}</span>
                  </div>
                )}
                {Number(inspectJob.cost) > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                    <span className="text-slate-500">Estimated Cost</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">${Number(inspectJob.cost).toFixed(4)}</span>
                  </div>
                )}
                {Number(inspectJob.tokens_used) > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                    <span className="text-slate-500">Tokens</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{Number(inspectJob.tokens_used).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Created At</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {formatBrowserTime(inspectJob.created_at, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      timeZoneName: 'short',
                    })}
                  </span>
                </div>
              </div>

              {/* Failure Error Alert if Failed */}
              {inspectJob.status === 'failed' && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-left space-y-2.5">
                  <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block text-[11px]">Error Description</span>
                      <p className="mt-0.5 break-words select-text">{inspectJob.error || 'Job execution failed.'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRetryJob(inspectJob)}
                    disabled={retryingJobIds.has(inspectJob.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {retryingJobIds.has(inspectJob.id) ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{retryingJobIds.has(inspectJob.id) ? 'Retrying Job…' : 'Retry Failed Job'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

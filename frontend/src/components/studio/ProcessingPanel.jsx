import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, Activity, X, Download, Loader2 } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../../config';
import { triggerDownload } from '../../utils/urls';
import JobCard from './JobCard';

export default function ProcessingPanel({ batchId, token, onClose, onExportWp, originalFiles, onPreview }) {
  const [jobs, setJobs] = useState([]);
  const [allDone, setAllDone] = useState(false);
  const intervalRef = useRef(null);

  const fetchBatch = useCallback(async () => {
    if (!batchId || !token) return;
    try {
      const res = await axios.get(`${API_BASE}/images/batch/${batchId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.jobs) ? res.data.jobs : []);
      setJobs(data);
      const done = data.length > 0 && data.every(j => j.status === 'completed' || j.status === 'failed');
      if (done) {
        setAllDone(true);
        clearInterval(intervalRef.current);
      }
    } catch (err) {
      console.error('Batch poll error:', err);
    }
  }, [batchId, token]);

  useEffect(() => {
    if (!batchId) return;
    fetchBatch();
    intervalRef.current = setInterval(fetchBatch, 2500);
    return () => clearInterval(intervalRef.current);
  }, [batchId, fetchBatch]);

  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const completedCount = safeJobs.filter(j => j.status === 'completed').length;
  const failedCount = safeJobs.filter(j => j.status === 'failed').length;

  return (
    <div className="bg-slate-50/80 dark:bg-slate-900/80 border border-[#0b6230]/30 rounded-2xl backdrop-blur-sm overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${allDone ? 'bg-emerald-500/20' : 'bg-[#0b6230]/20'}`}>
            {allDone
              ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              : <Activity className="w-4 h-4 text-[#3fa66e] animate-pulse" />
            }
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {allDone ? 'Processing Complete' : 'Processing Images…'}
            </h4>
            <p className="text-xs text-slate-500">
              {completedCount}/{jobs.length} done
              {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {completedCount > 1 && (
        <div className="px-5 py-3 border-b border-slate-200/50 dark:border-slate-800/50 bg-slate-100/50 dark:bg-slate-950/30">
          <button
            onClick={() => triggerDownload(`/images/batch/${batchId}/download`, `batch-${batchId}.zip`)}
            className="w-full py-2.5 bg-[#0b6230]/15 hover:bg-[#0b6230]/25 text-[#3fa66e] rounded-xl text-sm font-medium transition-colors border border-[#0b6230]/30 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" /> Download all completed (ZIP)
          </button>
        </div>
      )}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto">
        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            token={token}
            onRefresh={fetchBatch}
            onExportWp={onExportWp}
            originalFiles={originalFiles}
            onPreview={onPreview}
          />
        ))}
        {jobs.length === 0 && (
          <div className="col-span-2 text-center py-8 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#3fa66e]" />
            <p className="text-sm">Loading job status…</p>
          </div>
        )}
      </div>
    </div>
  );
}

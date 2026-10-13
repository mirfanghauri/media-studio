import { API_BASE } from '../config';

export function getCleanUrl(urlPath) {
  if (!urlPath) return '';
  if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) return urlPath;
  return `${API_BASE}${urlPath.replace('/api', '')}`;
}

export function getDownloadFilename(filename, url, outputFormat) {
  if (!filename || filename === 'generate') {
    let ext = outputFormat ? outputFormat.toLowerCase() : '';
    if (!ext && url) {
      const match = url.match(/\.([a-zA-Z0-9]+)(\?.*)?$/);
      if (match) ext = match[1].toLowerCase();
    }
    if (!ext) ext = 'png';
    if (ext === 'jpeg') ext = 'jpg';
    return `generated-${Date.now()}.${ext}`;
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

export async function triggerDownload(url, filename, outputFormat) {
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

export function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes) || Number(bytes) <= 0) return null;
  const b = Number(bytes);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) {
    return `${Math.round(b / 1024)} KB`;
  }
  const mb = b / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(/\.0$/, '')} MB`;
}

export function getJobFileSize(job) {
  if (!job) return null;
  if (job.file_size) return formatFileSize(job.file_size);
  if (job.metadata) {
    try {
      const meta = typeof job.metadata === 'string' ? JSON.parse(job.metadata) : job.metadata;
      const size = meta?.optimized_size || meta?.original_size;
      if (size) return formatFileSize(size);
    } catch (_) {}
  }
  return null;
}

export function getJobDimension(job) {
  if (!job) return '';
  if (job.actual_size) return job.actual_size;
  if (job.metadata) {
    try {
      const meta = typeof job.metadata === 'string' ? JSON.parse(job.metadata) : job.metadata;
      if (meta?.result_width && meta?.result_height) {
        return `${meta.result_width}x${meta.result_height}`;
      }
    } catch (_) {}
  }
  return job.image_size || '';
}

/**
 * Safely parses any date string (including SQLite UTC timestamps without 'Z' like "2026-10-06 20:46:45")
 * into a Date object representing the true UTC moment.
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  let s = String(dateStr).trim();
  // SQLite CURRENT_TIMESTAMP is stored in UTC without 'Z': "YYYY-MM-DD HH:mm:ss"
  if (s.includes(' ') && !s.includes('Z') && !s.includes('+') && !s.includes('T')) {
    s = s.replace(' ', 'T') + 'Z';
  } else if (!s.endsWith('Z') && !s.includes('+') && s.includes('T')) {
    s = s + 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a UTC timestamp into the user's current browser local time.
 */
export function formatBrowserTime(dateStr, options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) {
  const d = parseDate(dateStr);
  if (!d) return String(dateStr || '—');
  return d.toLocaleString([], options);
}



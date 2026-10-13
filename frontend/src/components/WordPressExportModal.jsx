import React, { useState } from 'react';
import { X, CloudUpload, Loader2 } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../config';

export default function WordPressExportModal({ isOpen, onClose, onExport, fileData, originalWpMediaId, wpPostId, token }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const [replaceOriginal, setReplaceOriginal] = useState(!!originalWpMediaId);
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      // Create FormData to send to our backend proxy which handles the WP upload
      const formData = new FormData();
      formData.append('file', fileData);
      
      // Pass metadata
      if (title) formData.append('title', title);
      if (altText) formData.append('alt_text', altText);
      if (caption) formData.append('caption', caption);
      if (description) formData.append('description', description);
      
      if (wpPostId) formData.append('postId', wpPostId);
      if (replaceOriginal && originalWpMediaId) {
        formData.append('replaceMediaId', originalWpMediaId);
      }
      
      const headers = { 
        'Content-Type': 'multipart/form-data',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      await axios.post(`${API_BASE}/wordpress/media`, formData, { headers });
      
      setSuccess(true);
      if (onExport) onExport();
      
      // Auto close after success
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 2000);
      
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to push media to WordPress.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CloudUpload className="w-5 h-5 text-[#0b6230]" />
            Export to WordPress
          </h2>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 rounded-xl text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm">
              Successfully exported to WordPress!
            </div>
          )}
          
          {originalWpMediaId && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl mb-4">
              <input 
                type="checkbox" 
                id="replaceOriginal"
                checked={replaceOriginal}
                onChange={(e) => setReplaceOriginal(e.target.checked)}
                className="w-4 h-4 text-[#0b6230] rounded border-slate-300 focus:ring-[#0b6230] accent-[#0b6230]"
              />
              <label htmlFor="replaceOriginal" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                Replace original image (Deletes old media from Library)
              </label>
            </div>
          )}
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors"
                placeholder="Media Title"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Alt Text</label>
              <input 
                type="text" 
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors"
                placeholder="Alternative Text for SEO"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Caption</label>
              <input 
                type="text" 
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors"
                placeholder="Media Caption"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors resize-none"
                placeholder="Long description..."
              />
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleExport}
            disabled={loading || success}
            className="px-5 py-2 bg-[#0b6230] hover:bg-[#095628] disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium rounded-xl transition-all shadow-sm flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
            {loading ? 'Exporting...' : 'Push to WordPress'}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { X, Search, Image as ImageIcon, Loader2, CloudDownload } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../config';

export default function WordPressImportModal({ isOpen, onClose, onImport, multiple = false, token }) {
  const [types, setTypes] = useState([]);
  const [posts, setPosts] = useState([]);
  const [media, setMedia] = useState([]);
  
  const [selectedType, setSelectedType] = useState('');
  const [selectedPost, setSelectedPost] = useState('');
  const [selectedMedia, setSelectedMedia] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchTypes();
      // Reset state
      setSelectedType('');
      setSelectedPost('');
      setSelectedMedia([]);
      setPosts([]);
      setMedia([]);
    }
  }, [isOpen]);

  const getHeaders = () => token ? { Authorization: `Bearer ${token}` } : {};

  const fetchTypes = async () => {
    try {
      setLoadingTypes(true);
      const res = await axios.get(`${API_BASE}/wordpress/types`, { headers: getHeaders() });
      setTypes(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load post types.');
    } finally {
      setLoadingTypes(false);
    }
  };

  const fetchPosts = async (type) => {
    try {
      setLoadingPosts(true);
      const res = await axios.get(`${API_BASE}/wordpress/posts?type=${type}`, { headers: getHeaders() });
      setPosts(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load posts.');
    } finally {
      setLoadingPosts(false);
    }
  };

  const fetchMedia = async (postId) => {
    try {
      setLoadingMedia(true);
      const res = await axios.get(`${API_BASE}/wordpress/media?post=${postId}`, { headers: getHeaders() });
      // filter only images and videos
      const filtered = res.data.filter(m => m.mime_type.startsWith('image/') || m.mime_type.startsWith('video/'));
      setMedia(filtered);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load media.');
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleTypeChange = (e) => {
    const type = e.target.value;
    setSelectedType(type);
    setSelectedPost('');
    setPosts([]);
    setMedia([]);
    setSelectedMedia([]);
    if (type) fetchPosts(type);
  };

  const handlePostChange = (e) => {
    const postId = e.target.value;
    setSelectedPost(postId);
    setMedia([]);
    setSelectedMedia([]);
    if (postId) fetchMedia(postId);
  };

  const toggleMediaSelection = (item) => {
    if (multiple) {
      if (selectedMedia.some(m => m.id === item.id)) {
        setSelectedMedia(selectedMedia.filter(m => m.id !== item.id));
      } else {
        setSelectedMedia([...selectedMedia, item]);
      }
    } else {
      setSelectedMedia([item]);
    }
  };

  const handleImport = async () => {
    if (selectedMedia.length === 0) return;
    
    setLoading(true);
    try {
      // Fetch actual blobs for selected media
      const importedFiles = await Promise.all(selectedMedia.map(async (m) => {
        const response = await fetch(`${API_BASE}/wordpress/proxy-image?url=${encodeURIComponent(m.source_url)}`);
        const blob = await response.blob();
        // Extract original filename from URL
        const filename = m.source_url.substring(m.source_url.lastIndexOf('/') + 1);
        const file = new File([blob], filename, { type: m.mime_type });
        // Attach WP media ID to file object for export reference
        file.wpMediaId = m.id;
        file.wpPostId = selectedPost;
        return file;
      }));
      
      onImport(importedFiles);
      onClose();
    } catch (err) {
      setError('Failed to download images from WordPress.');
    } finally {
      setLoading(false);
    }
  };

  const decodeHtml = (html) => {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CloudDownload className="w-5 h-5 text-[#0b6230]" />
            Import from WordPress
          </h2>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 rounded-xl text-sm">
              {error}
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Post Type {loading && <Loader2 className="inline w-3 h-3 animate-spin ml-1 text-[#0b6230]" />}
              </label>
              <select 
                value={selectedType}
                onChange={handleTypeChange}
                disabled={loading}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 disabled:opacity-50 transition-colors"
              >
                <option value="">Select a post type...</option>
                {types.map(t => (
                  <option key={t.slug} value={t.rest_base} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{decodeHtml(t.name)}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Select Post {loadingPosts && <Loader2 className="inline w-3 h-3 animate-spin ml-1 text-[#0b6230]" />}
              </label>
              <select 
                value={selectedPost}
                onChange={handlePostChange}
                disabled={!selectedType || loadingPosts}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 disabled:opacity-50 transition-colors"
              >
                <option value="">Select a post...</option>
                {posts.map(p => (
                  <option key={p.id} value={p.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{decodeHtml(p.title)}</option>
                ))}
              </select>
            </div>
          </div>
          
          {selectedPost && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Attached Media {loadingMedia && <Loader2 className="inline w-3 h-3 animate-spin ml-1 text-[#0b6230]" />}
              </label>
              
              {media.length === 0 && !loadingMedia ? (
                <div className="text-center py-8 bg-slate-50 dark:bg-slate-950 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <ImageIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No media attached to this post.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto pr-2">
                  {media.map((item) => {
                    const isSelected = selectedMedia.some(m => m.id === item.id);
                    return (
                      <div 
                        key={item.id}
                        onClick={() => toggleMediaSelection(item)}
                        className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${isSelected ? 'border-[#0b6230] scale-95 ring-2 ring-[#0b6230]/30' : 'border-transparent hover:border-[#0b6230]/50'}`}
                      >
                        <img src={item.source_url} alt={item.title} className="w-full h-full object-cover bg-slate-100 dark:bg-slate-800" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-[#0b6230]/20 flex items-center justify-center backdrop-blur-[1px]">
                            <div className="bg-[#0b6230] text-white rounded-full p-1 shadow-lg">
                              <X className="w-4 h-4 rotate-45" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleImport}
            disabled={selectedMedia.length === 0 || loadingImport}
            className="px-5 py-2 bg-[#0b6230] hover:bg-[#095628] disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium rounded-xl transition-all shadow-sm flex items-center gap-2"
          >
            {loadingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
            {loadingImport ? 'Importing...' : `Import Selected (${selectedMedia.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

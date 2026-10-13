import React, { useState, useRef, useEffect, useCallback, Component } from 'react';
import {
  UploadCloud, Tag, FileImage, Settings, Download, Loader2,
  Save, CheckCircle2, X, CloudDownload, CloudUpload, AlertTriangle,
  RefreshCw, Camera, Sparkles, MapPin, ShieldCheck, Trash2,
  ExternalLink, Eye, Info, Layers, Link, Search, Copy, Check, Maximize2
} from 'lucide-react';
import axios from 'axios';

import WordPressImportModal from '../components/WordPressImportModal';
import WordPressExportModal from '../components/WordPressExportModal';
import { API_BASE, BRAND } from '../config';
import styles from './MetadataPage.module.css';

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
    console.error('MetadataPage Error:', error, errorInfo);
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
export default function MetadataPage({ token }) {
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // URL import state
  const [imageUrl, setImageUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  // Live EXIF Inspection State
  const [inspecting, setInspecting] = useState(false);
  const [exifData, setExifData] = useState(null);
  const [inspectError, setInspectError] = useState(null);

  // Live EXIF Inspection & Raw Registry State
  const [inspectorTab, setInspectorTab] = useState('summary'); // 'summary' | 'raw'
  const [rawCategoryFilter, setRawCategoryFilter] = useState('all');
  const [showRawModal, setShowRawModal] = useState(false);
  const [rawSearchQuery, setRawSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Helper for categorizing raw tags
  const getTagCategory = (key) => {
    const k = key.toLowerCase();
    if (k.includes('gps') || k.includes('latitude') || k.includes('longitude') || k.includes('altitude') || k.includes('dest')) return 'gps';
    if (k.includes('make') || k.includes('model') || k.includes('lens') || k.includes('focal') || k.includes('aperture') || k.includes('shutter') || k.includes('exposure') || k.includes('iso') || k.includes('flash') || k.includes('metering') || k.includes('whitebalance') || k.includes('software') || k.includes('date') || k.includes('time') || k.includes('camera')) return 'camera';
    if (k.includes('title') || k.includes('author') || k.includes('artist') || k.includes('creator') || k.includes('by-line') || k.includes('copyright') || k.includes('description') || k.includes('caption') || k.includes('keyword') || k.includes('subject') || k.includes('credit') || k.includes('license') || k.includes('rights')) return 'iptc';
    if (k.includes('width') || k.includes('height') || k.includes('size') || k.includes('dimensions') || k.includes('megapixels') || k.includes('mime') || k.includes('type') || k.includes('format') || k.includes('bits') || k.includes('resolution') || k.includes('compression') || k.includes('encoding')) return 'technical';
    if (k.includes('profile') || k.includes('color') || k.includes('matrix') || k.includes('trc') || k.includes('chromatic') || k.includes('space') || k.includes('icc')) return 'icc';
    return 'other';
  };

  const copyToClipboard = (text, key) => {
    if (text === null || text === undefined) return;
    navigator.clipboard.writeText(String(text));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const copyAllJson = () => {
    if (!exifData?.rawTags) return;
    navigator.clipboard.writeText(JSON.stringify(exifData.rawTags, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Metadata Form State
  const [metadata, setMetadata] = useState({
    Title: '',
    Author: '',
    Copyright: '',
    Keywords: '',
    Description: '',
    License: '',
    AcquireLicensePage: '',
    CreditText: '',
    DatePublished: '',
    LocationName: '',
    Latitude: '',
    Longitude: ''
  });

  // Processing & Export State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStripping, setIsStripping] = useState(false);
  const [resultUrl, setResultUrl] = useState(null);
  const [isZip, setIsZip] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [error, setError] = useState(null);

  // WordPress Modals State
  const [showWpImport, setShowWpImport] = useState(false);
  const [showWpExport, setShowWpExport] = useState(false);
  const [processedFileForWp, setProcessedFileForWp] = useState(null);

  const fileInputRef = useRef(null);

  // ─── Auto-Inspect Selected Image via API ──────────────────────────────────
  const inspectImage = useCallback(async (file) => {
    if (!file) {
      setExifData(null);
      return;
    }

    setInspecting(true);
    setInspectError(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await axios.post(`${API_BASE}/images/metadata/inspect`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      setExifData(res.data);
    } catch (err) {
      console.warn('Failed to inspect EXIF metadata:', err);
      setInspectError('Could not read EXIF data for this file.');
      setExifData(null);
    } finally {
      setInspecting(false);
    }
  }, [token]);

  // Re-inspect whenever active selected index changes
  useEffect(() => {
    if (images.length > 0 && selectedIndex >= 0 && selectedIndex < images.length) {
      inspectImage(images[selectedIndex]);
    } else {
      setExifData(null);
    }
  }, [images, selectedIndex, inspectImage]);

  // ─── File Upload Handlers ─────────────────────────────────────────────────
  const handleImageUpload = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const updatedImages = [...images, ...newFiles];
      const newPreviews = newFiles.map(file => URL.createObjectURL(file));

      setImages(updatedImages);
      setPreviews(prev => [...prev, ...newPreviews]);
      setSelectedIndex(images.length); // select the first newly added image
      setResultUrl(null);
      setError(null);
      setSuccessMessage(null);
    }
  };

  const handleWpImport = (files) => {
    setImages(prev => [...prev, ...files]);
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setPreviews(prev => [...prev, ...newPreviews]);
    setSelectedIndex(images.length);
    setResultUrl(null);
    setError(null);
    setSuccessMessage(null);
  };

  const removeImage = (index, e) => {
    if (e) e.stopPropagation();
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);

    const newPreviews = [...previews];
    newPreviews.splice(index, 1);
    setPreviews(newPreviews);

    if (selectedIndex >= newImages.length) {
      setSelectedIndex(Math.max(0, newImages.length - 1));
    }
    setResultUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearAllImages = () => {
    setImages([]);
    setPreviews([]);
    setSelectedIndex(0);
    setExifData(null);
    setResultUrl(null);
    setError(null);
    setSuccessMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
        file.type.startsWith('image/') || /\.(jpe?g|png|webp|tiff?|avif)$/i.test(file.name)
      );

      if (validFiles.length === 0) {
        setError('Please drop valid image files (JPG, PNG, WEBP, TIFF, AVIF).');
        return;
      }

      const updatedImages = [...images, ...validFiles];
      const newPreviews = validFiles.map(file => URL.createObjectURL(file));

      setImages(updatedImages);
      setPreviews(prev => [...prev, ...newPreviews]);
      setSelectedIndex(images.length);
      setResultUrl(null);
      setError(null);
      setSuccessMessage(null);
    }
  };

  // ─── Import from URL Handler ──────────────────────────────────────────────
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
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const { filename, dataUrl, mimeType } = res.data;
      const blobRes = await fetch(dataUrl);
      const blob = await blobRes.blob();
      const newFile = new File([blob], filename, { type: mimeType });

      setImages(prev => [...prev, newFile]);
      setPreviews(prev => [...prev, dataUrl]);
      setSelectedIndex(images.length);
      setImageUrl('');
      setResultUrl(null);
      setSuccessMessage(`Loaded "${filename}" from URL successfully!`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download image from the provided URL.');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // ─── Metadata Form Handlers ───────────────────────────────────────────────
  const handleMetadataChange = (e) => {
    const { name, value } = e.target;
    setMetadata(prev => ({ ...prev, [name]: value }));
  };

  // Pre-fill form from detected EXIF / IPTC data
  const handlePrefillFromExif = () => {
    if (!exifData) return;
    const { iptc, gps } = exifData;

    setMetadata(prev => ({
      ...prev,
      Title: iptc?.title || prev.Title,
      Author: iptc?.author || prev.Author,
      Copyright: iptc?.copyright || prev.Copyright,
      Keywords: iptc?.keywords || prev.Keywords,
      Description: iptc?.description || prev.Description,
      License: iptc?.license || prev.License,
      AcquireLicensePage: iptc?.acquireLicensePage || prev.AcquireLicensePage,
      CreditText: iptc?.creditText || prev.CreditText,
      DatePublished: iptc?.datePublished || prev.DatePublished,
      LocationName: iptc?.locationName || prev.LocationName,
      Latitude: gps?.latitude !== null ? String(gps.latitude) : prev.Latitude,
      Longitude: gps?.longitude !== null ? String(gps.longitude) : prev.Longitude,
    }));
  };

  // ─── Strip EXIF (Privacy Tool) ────────────────────────────────────────────
  const handleStripExif = async () => {
    if (images.length === 0) {
      setError('Please upload an image first.');
      return;
    }

    const activeImage = images[selectedIndex] || images[0];
    setIsStripping(true);
    setError(null);
    setResultUrl(null);

    const formData = new FormData();
    formData.append('image', activeImage);

    try {
      const res = await axios.post(`${API_BASE}/images/metadata/strip`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      setResultUrl(res.data.url);
      setIsZip(false);
      setSuccessMessage(`All EXIF, camera, and GPS tags were stripped successfully from "${activeImage.name}".`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to strip metadata from image.');
    } finally {
      setIsStripping(false);
    }
  };

  // ─── Inject Metadata ──────────────────────────────────────────────────────
  const handleInject = async () => {
    if (images.length === 0) {
      setError('Please select at least one image.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setResultUrl(null);
    setIsZip(false);
    setSuccessMessage(null);

    const formData = new FormData();
    images.forEach(img => {
      formData.append('image', img);
    });
    formData.append('metadata', JSON.stringify(metadata));

    try {
      const res = await axios.post(`${API_BASE}/images/metadata/inject`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      setResultUrl(res.data.url);
      setIsZip(res.data.isZip || false);
      setSuccessMessage(
        res.data.isZip
          ? `Metadata successfully injected into all ${images.length} images!`
          : `Metadata successfully embedded into ${images[0]?.name || 'image'}!`
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to inject metadata.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Prepare WordPress Export ─────────────────────────────────────────────
  const handlePrepareWpExport = async () => {
    if (!resultUrl) return;
    try {
      const res = await fetch(resultUrl);
      const blob = await res.blob();
      const activeImg = images[selectedIndex] || images[0];
      const filename = activeImg?.name ? `seo-${activeImg.name}` : 'seo-optimized-image.jpg';
      const newFile = new File([blob], filename, { type: blob.type });
      newFile.wpMediaId = activeImg?.wpMediaId;
      newFile.wpPostId = activeImg?.wpPostId;

      setProcessedFileForWp(newFile);
      setShowWpExport(true);
    } catch (err) {
      setError('Failed to load processed image for WordPress export: ' + err.message);
    }
  };

  const rawTagsList = Object.entries(exifData?.rawTags || {});
  const filteredTags = rawTagsList.filter(([key, val]) => {
    if (rawCategoryFilter !== 'all') {
      const cat = getTagCategory(key);
      if (cat !== rawCategoryFilter) return false;
    }
    if (rawSearchQuery.trim()) {
      const q = rawSearchQuery.toLowerCase();
      return key.toLowerCase().includes(q) || String(val).toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className={styles.pageContainer}>
      {/* ─── Top Executive Header ───────────────────────────────────────────── */}
      <div className={styles.headerCard}>
        <div className={styles.titleArea}>
          <h1 className={styles.brandTitle}>
            <Tag className={styles.brandIcon} />
            Image SEO & Metadata Studio
          </h1>
          <p className={styles.pageSubtitle}>
            Inspect camera & GPS tags, embed IPTC/SEO metadata, and manage copyright licensing
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className={styles.badgeDualMode}>
            <Layers className="w-3.5 h-3.5" />
            EXIF Data Viewer & Injector
          </span>
        </div>
      </div>

      {/* ─── Studio 2-Column Responsive Workspace ────────────────────────────── */}
      <div className={styles.studioGrid}>
        {/* ─── Left Column: Asset Preview & EXIF Viewer ─────────────────────── */}
        <div className="space-y-5">
          {/* Card 1: Asset Upload & Carousel */}
          <div className={styles.glassCard}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>
                  <FileImage className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  Asset Source & Batch Queue
                </h2>
                <p className={styles.cardSubtitle}>Upload JPG, PNG, WEBP, or TIFF images</p>
              </div>

              {images.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllImages}
                  className="text-xs text-red-500 hover:text-red-600 font-medium cursor-pointer"
                >
                  Clear Queue
                </button>
              )}
            </div>

            {images.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
              >
                <UploadCloud className={`w-10 h-10 mb-3 transition-transform ${isDragging ? 'text-[#0b6230] scale-110' : 'text-slate-400'}`} />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {isDragging ? 'Release to drop image files!' : 'Drop images here or click to browse'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports multiple files · JPG, PNG, WEBP, TIFF, AVIF
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Active Image Large Preview */}
                <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 aspect-video flex items-center justify-center p-2">
                  <img
                    src={previews[selectedIndex]}
                    alt={`Preview ${selectedIndex}`}
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                  <span className="absolute bottom-2 left-2 text-[10px] font-mono bg-black/70 text-slate-200 px-2 py-0.5 rounded-md backdrop-blur-xs">
                    {images[selectedIndex]?.name}
                  </span>
                </div>

                {/* Multi-Image Thumbnail Carousel with Drag & Drop */}
                <div
                  className={`${styles.thumbnailGrid} ${isDragging ? styles.dropzoneActive : ''}`}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {previews.map((prevUrl, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedIndex(idx)}
                      className={`${styles.thumbnailItem} ${selectedIndex === idx ? styles.thumbnailItemSelected : ''}`}
                    >
                      <img src={prevUrl} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => removeImage(idx, e)}
                        className={styles.thumbnailRemoveBtn}
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0b6230] flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 hover:text-[#0b6230]"
                  >
                    <UploadCloud className="w-5 h-5 mb-0.5" />
                    <span className="text-[9px] font-semibold">Add</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-500 px-1 font-medium">
                  <span>{images.length} image{images.length > 1 ? 's' : ''} queued</span>
                  <span>Active: #{selectedIndex + 1}</span>
                </div>
              </div>
            )}

            {/* Import via URL Form */}
            <form onSubmit={handleImportUrl} className={styles.urlBar}>
              <Link className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
              <input
                type="url"
                placeholder="Paste image URL (https://...)"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                className={styles.urlInput}
              />
              <button
                type="submit"
                disabled={isFetchingUrl || !imageUrl.trim()}
                className={styles.urlSubmitBtn}
              >
                {isFetchingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                <span>Import URL</span>
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowWpImport(true)}
              className="w-full py-2.2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <CloudDownload className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
              Import from WordPress Media Library
            </button>

            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
          </div>

          {/* Card 2: Live EXIF Data Viewer / Inspector */}
          <div className={styles.glassCard}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>
                  <Camera className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  EXIF Data Inspector
                </h2>
                <p className={styles.cardSubtitle}>
                  {inspecting
                    ? 'Reading embedded tags...'
                    : images.length > 0
                    ? `Inspecting: ${images[selectedIndex]?.name || 'Current Image'}`
                    : 'Upload an image to inspect embedded EXIF tags'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {inspecting && <Loader2 className="w-4 h-4 animate-spin text-[#0b6230]" />}
                {exifData && (
                  <button
                    type="button"
                    onClick={() => setShowRawModal(true)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Open Fullscreen EXIF Registry"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {inspectError && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 mb-3">
                {inspectError}
              </p>
            )}

            {exifData ? (
              <div className={styles.inspectorContainer}>
                {/* Tab Switcher: Summary vs Full Raw EXIF Registry */}
                <div className={styles.inspectorTabRow}>
                  <button
                    type="button"
                    onClick={() => setInspectorTab('summary')}
                    className={`${styles.inspectorTabBtn} ${inspectorTab === 'summary' ? styles.inspectorTabBtnActive : ''}`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Summary Specs</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInspectorTab('raw')}
                    className={`${styles.inspectorTabBtn} ${inspectorTab === 'raw' ? styles.inspectorTabBtnActive : ''}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Full EXIF Registry ({rawTagsList.length})</span>
                  </button>
                </div>

                {inspectorTab === 'summary' ? (
                  <>
                    {/* Camera & Lens Specs */}
                    <div>
                      <span className={styles.inspectorSectionTitle}>
                        <Camera className="w-3.5 h-3.5" /> Optics & Exposure
                      </span>
                      <div className={`${styles.exifGrid} mt-2`}>
                        <div className={styles.exifBadge}>
                          <span className={styles.exifBadgeLabel}>Camera</span>
                          <span className={styles.exifBadgeValue}>
                            {exifData.camera?.make || exifData.camera?.model
                              ? `${exifData.camera?.make || ''} ${exifData.camera?.model || ''}`.trim()
                              : 'Unknown / AI Gen'}
                          </span>
                        </div>
                        <div className={styles.exifBadge}>
                          <span className={styles.exifBadgeLabel}>Lens / Focal</span>
                          <span className={styles.exifBadgeValue}>
                            {exifData.camera?.lens || exifData.camera?.focalLength || 'Standard Lens'}
                          </span>
                        </div>
                        <div className={styles.exifBadge}>
                          <span className={styles.exifBadgeLabel}>Shutter / Aperture</span>
                          <span className={styles.exifBadgeValue}>
                            {exifData.camera?.shutterSpeed && exifData.camera?.aperture
                              ? `${exifData.camera.shutterSpeed} · ${exifData.camera.aperture}`
                              : exifData.camera?.aperture || exifData.camera?.shutterSpeed || 'Auto'}
                          </span>
                        </div>
                        <div className={styles.exifBadge}>
                          <span className={styles.exifBadgeLabel}>ISO Sensitivity</span>
                          <span className={styles.exifBadgeValue}>
                            {exifData.camera?.iso ? `ISO ${exifData.camera.iso}` : 'Auto ISO'}
                          </span>
                        </div>

                        {/* Extra Optics Specs if available */}
                        {exifData.camera?.exposureProgram && (
                          <div className={styles.exifBadge}>
                            <span className={styles.exifBadgeLabel}>Exposure Program</span>
                            <span className={styles.exifBadgeValue}>{exifData.camera.exposureProgram}</span>
                          </div>
                        )}
                        {exifData.camera?.meteringMode && (
                          <div className={styles.exifBadge}>
                            <span className={styles.exifBadgeLabel}>Metering Mode</span>
                            <span className={styles.exifBadgeValue}>{exifData.camera.meteringMode}</span>
                          </div>
                        )}
                        {exifData.camera?.whiteBalance && (
                          <div className={styles.exifBadge}>
                            <span className={styles.exifBadgeLabel}>White Balance</span>
                            <span className={styles.exifBadgeValue}>{exifData.camera.whiteBalance}</span>
                          </div>
                        )}
                        {exifData.camera?.flash && (
                          <div className={styles.exifBadge}>
                            <span className={styles.exifBadgeLabel}>Flash</span>
                            <span className={styles.exifBadgeValue}>{exifData.camera.flash}</span>
                          </div>
                        )}
                        {exifData.camera?.software && (
                          <div className={styles.exifBadge}>
                            <span className={styles.exifBadgeLabel}>Software</span>
                            <span className={styles.exifBadgeValue}>{exifData.camera.software}</span>
                          </div>
                        )}
                        {exifData.camera?.dateTimeOriginal && (
                          <div className={styles.exifBadge}>
                            <span className={styles.exifBadgeLabel}>Date Taken</span>
                            <span className={styles.exifBadgeValue}>{exifData.camera.dateTimeOriginal.split('T')[0] || exifData.camera.dateTimeOriginal}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Technical Dimensions & Color */}
                    <div>
                      <span className={styles.inspectorSectionTitle}>
                        <Info className="w-3.5 h-3.5" /> Technical Specs
                      </span>
                      <div className={`${styles.exifGrid} mt-2`}>
                        <div className={styles.exifBadge}>
                          <span className={styles.exifBadgeLabel}>Dimensions</span>
                          <span className={styles.exifBadgeValue}>
                            {exifData.technical?.dimensions || 'Auto'}
                          </span>
                        </div>
                        <div className={styles.exifBadge}>
                          <span className={styles.exifBadgeLabel}>Resolution</span>
                          <span className={styles.exifBadgeValue}>
                            {exifData.technical?.megapixels || 'Standard'}
                          </span>
                        </div>
                        <div className={styles.exifBadge}>
                          <span className={styles.exifBadgeLabel}>Color Profile</span>
                          <span className={styles.exifBadgeValue}>
                            {exifData.technical?.colorSpace || 'sRGB'}
                          </span>
                        </div>
                        <div className={styles.exifBadge}>
                          <span className={styles.exifBadgeLabel}>MIME / Format</span>
                          <span className={styles.exifBadgeValue}>
                            {exifData.technical?.mimeType || 'Image'}
                          </span>
                        </div>
                        {exifData.technical?.fileSize && (
                          <div className={styles.exifBadge}>
                            <span className={styles.exifBadgeLabel}>File Size</span>
                            <span className={styles.exifBadgeValue}>{exifData.technical.fileSize}</span>
                          </div>
                        )}
                        {exifData.technical?.aspectRatio && (
                          <div className={styles.exifBadge}>
                            <span className={styles.exifBadgeLabel}>Aspect Ratio</span>
                            <span className={styles.exifBadgeValue}>{exifData.technical.aspectRatio}:1</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* GPS Location */}
                    <div>
                      <span className={styles.inspectorSectionTitle}>
                        <MapPin className="w-3.5 h-3.5" /> Geotagging & GPS
                      </span>
                      <div className="mt-2">
                        <div className={styles.exifBadge}>
                          <div className="flex items-center justify-between">
                            <span className={styles.exifBadgeLabel}>GPS Coordinates</span>
                            {exifData.gps?.hasGps && (
                              <a
                                href={`https://www.google.com/maps?q=${exifData.gps.latitude},${exifData.gps.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-[#0b6230] dark:text-[#3fa66e] flex items-center gap-1 font-semibold hover:underline"
                              >
                                <span>Open in Maps</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <span className={styles.exifBadgeValue}>
                            {exifData.gps?.formattedCoords || 'No GPS Coordinates Embedded'}
                          </span>
                          {exifData.gps?.altitude && (
                            <div className="text-[11px] text-slate-500 mt-1">
                              Altitude: {exifData.gps.altitude}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Embedded IPTC & SEO Data */}
                    {(exifData.iptc?.title || exifData.iptc?.author || exifData.iptc?.copyright || exifData.iptc?.keywords || exifData.iptc?.description) && (
                      <div>
                        <span className={styles.inspectorSectionTitle}>
                          <Tag className="w-3.5 h-3.5" /> Embedded IPTC & SEO Data
                        </span>
                        <div className="mt-2 space-y-1.5">
                          {exifData.iptc?.title && (
                            <div className={styles.exifBadge}>
                              <span className={styles.exifBadgeLabel}>Title / Headline</span>
                              <span className={styles.exifBadgeValue}>{exifData.iptc.title}</span>
                            </div>
                          )}
                          {exifData.iptc?.author && (
                            <div className={styles.exifBadge}>
                              <span className={styles.exifBadgeLabel}>Author / Creator</span>
                              <span className={styles.exifBadgeValue}>{exifData.iptc.author}</span>
                            </div>
                          )}
                          {exifData.iptc?.copyright && (
                            <div className={styles.exifBadge}>
                              <span className={styles.exifBadgeLabel}>Copyright</span>
                              <span className={styles.exifBadgeValue}>{exifData.iptc.copyright}</span>
                            </div>
                          )}
                          {exifData.iptc?.keywords && (
                            <div className={styles.exifBadge}>
                              <span className={styles.exifBadgeLabel}>Keywords</span>
                              <span className={styles.exifBadgeValue}>{exifData.iptc.keywords}</span>
                            </div>
                          )}
                          {exifData.iptc?.description && (
                            <div className={styles.exifBadge}>
                              <span className={styles.exifBadgeLabel}>Description</span>
                              <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 mt-0.5">{exifData.iptc.description}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Switch to Full Raw EXIF Registry Button */}
                    <button
                      type="button"
                      onClick={() => setInspectorTab('raw')}
                      className={styles.viewAllTagsBtn}
                    >
                      <Eye className="w-4 h-4" />
                      <span>
                        Explore Full EXIF Registry ({rawTagsList.length} Embedded Tags) →
                      </span>
                    </button>
                  </>
                ) : (
                  /* Inline Raw EXIF Registry Table View */
                  <div className={styles.inlineRawContainer}>
                    {/* Search & Action Bar */}
                    <div className="flex items-center gap-2">
                      <div className={`${styles.rawSearchBar} flex-1`}>
                        <Search className="w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={rawSearchQuery}
                          onChange={(e) => setRawSearchQuery(e.target.value)}
                          placeholder="Search any tag or value..."
                          className={styles.rawSearchInput}
                        />
                        {rawSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setRawSearchQuery('')}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={copyAllJson}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-emerald-500/50 flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Copy all tags as JSON"
                      >
                        {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{copiedAll ? 'Copied' : 'JSON'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowRawModal(true)}
                        className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors cursor-pointer"
                        title="Open in Fullscreen Modal"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Category Filter Pills */}
                    <div className={styles.rawFilterRow}>
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'camera', label: 'Camera / Optics' },
                        { id: 'technical', label: 'Tech & Format' },
                        { id: 'iptc', label: 'IPTC & SEO' },
                        { id: 'gps', label: 'GPS / Location' },
                        { id: 'icc', label: 'ICC & Color' },
                        { id: 'other', label: 'Other' },
                      ].map(cat => {
                        const count = cat.id === 'all'
                          ? rawTagsList.length
                          : rawTagsList.filter(([k]) => getTagCategory(k) === cat.id).length;
                        if (count === 0 && cat.id !== 'all') return null;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setRawCategoryFilter(cat.id)}
                            className={`${styles.rawFilterPill} ${rawCategoryFilter === cat.id ? styles.rawFilterPillActive : ''}`}
                          >
                            <span>{cat.label}</span>
                            <span className="opacity-70 text-[10px]">({count})</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Scrollable Table */}
                    <div className={styles.inlineTableScroll}>
                      <table className={styles.rawTable}>
                        <thead>
                          <tr>
                            <th style={{ width: '42%' }}>Tag Property</th>
                            <th>Extracted Value</th>
                            <th style={{ width: '36px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTags.length > 0 ? (
                            filteredTags.map(([key, val]) => (
                              <tr key={key}>
                                <td className={styles.tagKeyCell}>
                                  <div className="flex flex-col">
                                    <span>{key}</span>
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal uppercase">
                                      {getTagCategory(key)}
                                    </span>
                                  </div>
                                </td>
                                <td className={styles.tagValCell}>
                                  <span>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(val, key)}
                                    className={styles.copyTagBtn}
                                    title="Copy value"
                                  >
                                    {copiedKey === key ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="text-center py-6 text-xs text-slate-400">
                                No metadata tags match "{rawSearchQuery}" in category "{rawCategoryFilter}".
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                      <span>Showing {filteredTags.length} of {rawTagsList.length} tags</span>
                      <button
                        type="button"
                        onClick={() => setInspectorTab('summary')}
                        className="text-[#0b6230] dark:text-[#3fa66e] font-semibold hover:underline cursor-pointer"
                      >
                        ← Back to Summary Specs
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick Utility Actions Bar */}
                <div className={`${styles.quickActionsBar} mt-1`}>
                  <button
                    type="button"
                    onClick={handlePrefillFromExif}
                    disabled={!exifData?.hasAnyExif}
                    className={`${styles.utilityBtn} ${styles.utilityBtnPrefill}`}
                    title="Copy existing detected tags into the editor form"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Pre-fill Form from Image
                  </button>

                  <button
                    type="button"
                    onClick={handleStripExif}
                    disabled={isStripping || images.length === 0}
                    className={`${styles.utilityBtn} ${styles.utilityBtnStrip}`}
                    title="Remove all EXIF, camera, and GPS metadata for privacy"
                  >
                    {isStripping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Strip EXIF Data
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-400">
                {images.length === 0
                  ? 'No image loaded for inspection.'
                  : inspecting
                  ? 'Analyzing file...'
                  : 'Select or upload an image to inspect its camera EXIF tags.'}
              </div>
            )}
          </div>
        </div>

        {/* ─── Right Column: EXIF & SEO Data Injector ───────────────────────── */}
        <div className="space-y-5">
          <div className={styles.glassCard}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>
                  <Save className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  EXIF & SEO Metadata Injector
                </h2>
                <p className={styles.cardSubtitle}>
                  Fill or modify metadata tags to embed into the selected or batch images
                </p>
              </div>

              {images.length > 0 && (
                <button
                  type="button"
                  onClick={handlePrefillFromExif}
                  className="text-xs text-[#0b6230] dark:text-[#3fa66e] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> Pre-fill from image
                </button>
              )}
            </div>

            {/* Section 1: Basic SEO & IPTC */}
            <div className="space-y-3.5">
              <div className={styles.formGroup}>
                <label className={styles.inputLabel} htmlFor="meta-title">
                  <span>Image Title (Headline)</span>
                  <span className="text-[10px] text-slate-400 font-normal">IPTC / DublinCore</span>
                </label>
                <input
                  id="meta-title"
                  type="text"
                  name="Title"
                  placeholder="e.g., Luxury Waterfront Villa at Sunset"
                  value={metadata.Title}
                  onChange={handleMetadataChange}
                  className={styles.textInput}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="meta-author">Author / Creator</label>
                  <input
                    id="meta-author"
                    type="text"
                    name="Author"
                    placeholder="e.g., Maxx Media Productions"
                    value={metadata.Author}
                    onChange={handleMetadataChange}
                    className={styles.textInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="meta-copyright">Copyright Notice</label>
                  <input
                    id="meta-copyright"
                    type="text"
                    name="Copyright"
                    placeholder="e.g., © 2026 Maxx Capitals. All rights reserved."
                    value={metadata.Copyright}
                    onChange={handleMetadataChange}
                    className={styles.textInput}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.inputLabel} htmlFor="meta-keywords">
                  <span>Keywords & Tags</span>
                  <span className="text-[10px] text-slate-400 font-normal">Comma-separated</span>
                </label>
                <input
                  id="meta-keywords"
                  type="text"
                  name="Keywords"
                  placeholder="real estate, architecture, interior design, modern"
                  value={metadata.Keywords}
                  onChange={handleMetadataChange}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.inputLabel} htmlFor="meta-desc">
                  <span>Description / Alt Caption</span>
                  <span className="text-[10px] text-slate-400 font-normal">Google Images Alt Text</span>
                </label>
                <textarea
                  id="meta-desc"
                  name="Description"
                  rows={3}
                  placeholder="Detailed description of the visual scene for accessibility and SEO ranking..."
                  value={metadata.Description}
                  onChange={handleMetadataChange}
                  className={`${styles.textInput} resize-none`}
                />
              </div>
            </div>

            {/* Section 2: Rights & Licensing (Google Image Search standard) */}
            <div className={styles.formSectionDivider}>
              <h3 className={styles.sectionHeading}>
                <ShieldCheck className="w-3.5 h-3.5 text-[#0b6230] dark:text-[#3fa66e]" />
                Google Image Search Rights & Licensing
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="meta-license">License URL (WebStatement)</label>
                  <input
                    id="meta-license"
                    type="url"
                    name="License"
                    placeholder="https://example.com/license"
                    value={metadata.License}
                    onChange={handleMetadataChange}
                    className={styles.textInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="meta-acquire">Acquire License Page URL</label>
                  <input
                    id="meta-acquire"
                    type="url"
                    name="AcquireLicensePage"
                    placeholder="https://example.com/buy-license"
                    value={metadata.AcquireLicensePage}
                    onChange={handleMetadataChange}
                    className={styles.textInput}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="meta-credit">Credit Attribution Text</label>
                  <input
                    id="meta-credit"
                    type="text"
                    name="CreditText"
                    placeholder="e.g., Photo by Maxx Studio"
                    value={metadata.CreditText}
                    onChange={handleMetadataChange}
                    className={styles.textInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="meta-date">Date Published / Created</label>
                  <input
                    id="meta-date"
                    type="date"
                    name="DatePublished"
                    value={metadata.DatePublished}
                    onChange={handleMetadataChange}
                    className={styles.textInput}
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Geotagging & GPS Coordinates */}
            <div className={styles.formSectionDivider}>
              <h3 className={styles.sectionHeading}>
                <MapPin className="w-3.5 h-3.5 text-[#0b6230] dark:text-[#3fa66e]" />
                Geotagging & Real-World Location
              </h3>

              <div className={styles.formGroup}>
                <label className={styles.inputLabel} htmlFor="meta-loc-name">Location / Landmark Name</label>
                <input
                  id="meta-loc-name"
                  type="text"
                  name="LocationName"
                  placeholder="e.g., Clifton, Karachi, Pakistan"
                  value={metadata.LocationName}
                  onChange={handleMetadataChange}
                  className={styles.textInput}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="meta-lat">GPS Latitude</label>
                  <input
                    id="meta-lat"
                    type="number"
                    step="any"
                    name="Latitude"
                    placeholder="24.8138"
                    value={metadata.Latitude}
                    onChange={handleMetadataChange}
                    className={styles.textInput}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.inputLabel} htmlFor="meta-lon">GPS Longitude</label>
                  <input
                    id="meta-lon"
                    type="number"
                    step="any"
                    name="Longitude"
                    placeholder="67.0305"
                    value={metadata.Longitude}
                    onChange={handleMetadataChange}
                    className={styles.textInput}
                  />
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleInject}
              disabled={isSubmitting || images.length === 0}
              className={styles.injectBtn}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Embedding EXIF & SEO Metadata...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {images.length > 1
                    ? `Inject Metadata into ${images.length} Images (Batch)`
                    : 'Inject Metadata into Image'}
                </>
              )}
            </button>
          </div>

          {/* Result Success Card */}
          {resultUrl && (
            <div className={styles.successCard}>
              <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>Process Complete!</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {successMessage || 'Your image header has been updated with the embedded metadata.'}
              </p>

              <div className={styles.successActions}>
                <a
                  href={resultUrl}
                  download
                  className={styles.downloadBtn}
                >
                  <Download className="w-4 h-4" />
                  {isZip ? 'Download ZIP Archive' : 'Download Processed Image'}
                </a>

                {!isZip && (
                  <button
                    type="button"
                    onClick={handlePrepareWpExport}
                    className={styles.wpExportBtn}
                  >
                    <CloudUpload className="w-4 h-4" />
                    Push to WordPress
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Full Raw EXIF Registry Modal ────────────────────────────────────────── */}
      {showRawModal && exifData && (
        <div className={styles.rawModalBackdrop} onClick={() => setShowRawModal(false)}>
          <div className={styles.rawModalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.rawModalHeader}>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#0b6230] dark:text-[#3fa66e]" />
                  Full EXIF & Metadata Registry
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Extracted from: {images[selectedIndex]?.name || 'Current Image'} ({rawTagsList.length} Total Tags)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyAllJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-emerald-500/50 transition-colors cursor-pointer"
                >
                  {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedAll ? 'JSON Copied' : 'Copy All JSON'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRawModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className={styles.rawModalBody}>
              {/* Search & Filter Header */}
              <div className={styles.rawSearchBar}>
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={rawSearchQuery}
                  onChange={(e) => setRawSearchQuery(e.target.value)}
                  placeholder="Filter by tag name (e.g., ISO, Focal, GPS, Artist, Exposure, Lens, Color)..."
                  className={styles.rawSearchInput}
                  autoFocus
                />
                {rawSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setRawSearchQuery('')}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Category Filter Pills */}
              <div className={styles.rawFilterRow}>
                {[
                  { id: 'all', label: 'All Tags' },
                  { id: 'camera', label: 'Camera & Optics' },
                  { id: 'technical', label: 'Tech & Format' },
                  { id: 'iptc', label: 'IPTC & SEO' },
                  { id: 'gps', label: 'GPS Coordinates' },
                  { id: 'icc', label: 'ICC Profile' },
                  { id: 'other', label: 'Other' },
                ].map(cat => {
                  const count = cat.id === 'all'
                    ? rawTagsList.length
                    : rawTagsList.filter(([k]) => getTagCategory(k) === cat.id).length;
                  if (count === 0 && cat.id !== 'all') return null;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setRawCategoryFilter(cat.id)}
                      className={`${styles.rawFilterPill} ${rawCategoryFilter === cat.id ? styles.rawFilterPillActive : ''}`}
                    >
                      <span>{cat.label}</span>
                      <span className="opacity-70 text-[10px]">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Full Modal Table */}
              <div className="overflow-y-auto flex-1 border border-slate-200 dark:border-slate-800 rounded-xl max-h-[55vh]">
                <table className={styles.rawTable}>
                  <thead>
                    <tr>
                      <th style={{ width: '35%' }}>Property Tag</th>
                      <th>Extracted Value</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTags.length > 0 ? (
                      filteredTags.map(([key, val]) => (
                        <tr key={key}>
                          <td className={styles.tagKeyCell}>
                            <div className="flex flex-col">
                              <span>{key}</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal uppercase">
                                {getTagCategory(key)}
                              </span>
                            </div>
                          </td>
                          <td className={styles.tagValCell}>
                            <span>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(val, key)}
                              className={styles.copyTagBtn}
                              title="Copy value"
                            >
                              {copiedKey === key ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="text-center py-10 text-sm text-slate-400">
                          No tags match "{rawSearchQuery}" in category "{rawCategoryFilter}".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {filteredTags.length} of {rawTagsList.length} total embedded tags</span>
              <button
                type="button"
                onClick={() => setShowRawModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                Close Registry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── WordPress Modals ────────────────────────────────────────────────── */}
      <WordPressImportModal
        isOpen={showWpImport}
        onClose={() => setShowWpImport(false)}
        onImport={handleWpImport}
        multiple={true}
        token={token}
      />

      <WordPressExportModal
        isOpen={showWpExport}
        onClose={() => setShowWpExport(false)}
        fileData={processedFileForWp || images[0]}
        originalWpMediaId={(processedFileForWp || images[0])?.wpMediaId}
        wpPostId={(processedFileForWp || images[0])?.wpPostId}
        token={token}
      />
    </div>
  );
}

// ─── Export with Error Boundary ─────────────────────────────────────────────
export function MetadataPageWithErrorBoundary(props) {
  return (
    <ErrorBoundary>
      <MetadataPage {...props} />
    </ErrorBoundary>
  );
}

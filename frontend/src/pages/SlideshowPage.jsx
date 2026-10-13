import React, { useState, useRef, useEffect, Component, useCallback } from 'react';
import { 
  UploadCloud, Film, Settings, ImagePlus, Loader2, Play, Pause, Music, 
  Layout, ArrowRight, CheckCircle2, Download, CloudDownload, CloudUpload, 
  AlertTriangle, RefreshCw, Volume2, Sparkles, Check, X, Disc3,
  ChevronLeft, ChevronRight, Trash2, Eye, Link, Sliders, Clock,
  Smartphone, Monitor, Square, Video
} from 'lucide-react';
import axios from 'axios';
import { API_BASE, BRAND, POLLING } from '../config';
import styles from './SlideshowPage.module.css';

// ─── Real Estate Sample Music Collection ────────────────────────────────────
const REAL_ESTATE_SAMPLE_TRACKS = [
  {
    id: "luxury-modern",
    title: "Luxury Modern Living",
    category: "Penthouses & Modern Villas",
    group: "luxury",
    description: "Warm piano with elegant ambient strings, ideal for luxury interior tours and architectural reveals.",
    genre: "Ambient Piano",
    duration: "2:57",
    file: "/sample-music/deliberate-thought.mp3",
    filename: "luxury-modern-deliberate-thought.mp3"
  },
  {
    id: "suburban-walkthrough",
    title: "Suburban Walkthrough",
    category: "Family Homes & Open Houses",
    group: "acoustic",
    description: "Upbeat acoustic guitar and friendly rhythm, perfect for family residences and suburban tours.",
    genre: "Acoustic Whistle",
    duration: "3:25",
    file: "/sample-music/carefree.mp3",
    filename: "suburban-walkthrough-carefree.mp3"
  },
  {
    id: "penthouse-lounge",
    title: "High-Rise Penthouse Lounge",
    category: "Luxury Condos & City Living",
    group: "jazz",
    description: "Sophisticated chillout lounge with electric Rhodes piano for high-rise condos and skyline views.",
    genre: "Chill Lounge",
    duration: "5:07",
    file: "/sample-music/airport-lounge.mp3",
    filename: "penthouse-lounge-airport.mp3"
  },
  {
    id: "prestige-lobby",
    title: "Prestige Hotel & Foyer",
    category: "Grand Entrances & Suites",
    group: "jazz",
    description: "Upscale cocktail jazz with vibraphone and double bass for grand lobbies and executive suites.",
    genre: "Upscale Jazz",
    duration: "3:13",
    file: "/sample-music/lobby-time.mp3",
    filename: "prestige-lobby-time.mp3"
  },
  {
    id: "beachfront-villa",
    title: "Resort & Beachfront Villa",
    category: "Coastal Estates & Sunny Patios",
    group: "acoustic",
    description: "Warm Brazilian bossa nova with nylon acoustic guitar for coastal properties, terraces, and pools.",
    genre: "Bossa Nova",
    duration: "4:43",
    file: "/sample-music/bossa-antigua.mp3",
    filename: "beachfront-villa-bossa.mp3"
  },
  {
    id: "drone-architectural",
    title: "Architectural Drone Showcase",
    category: "Aerial Flyovers & Large Grounds",
    group: "cinematic",
    description: "Inspiring ambient neo-classical piano and strings providing scale for breathtaking drone footage.",
    genre: "Neo-Classical",
    duration: "5:50",
    file: "/sample-music/silver-blue-light.mp3",
    filename: "drone-architectural-silver.mp3"
  },
  {
    id: "smart-home",
    title: "Future Smart Home",
    category: "Modern Minimalist Architecture",
    group: "luxury",
    description: "Futuristic ambient pad pulses tailored for high-tech smart homes and sleek modern design.",
    genre: "Atmospheric Pad",
    duration: "3:04",
    file: "/sample-music/floating-cities.mp3",
    filename: "smart-home-floating-cities.mp3"
  },
  {
    id: "heritage-estate",
    title: "Grand Heritage Estate",
    category: "Historic Mansions & Flagship Estates",
    group: "cinematic",
    description: "Cinematic piano with an emotional orchestral build for prestigious historic properties and manors.",
    genre: "Cinematic Orchestral",
    duration: "11:58",
    file: "/sample-music/perspectives.mp3",
    filename: "heritage-estate-perspectives.mp3"
  },
  {
    id: "community-family",
    title: "Community & Garden Tour",
    category: "Neighborhoods & Outdoor Living",
    group: "acoustic",
    description: "Breezy folk acoustic guitar and mandolin evoking friendly neighborhood vibes, parks, and lush gardens.",
    genre: "Folk Acoustic",
    duration: "3:55",
    file: "/sample-music/life-of-riley.mp3",
    filename: "community-tour-life-of-riley.mp3"
  },
  {
    id: "sunlit-open-house",
    title: "Sunlit Open House",
    category: "Bright Interiors & Sunlit Spaces",
    group: "acoustic",
    description: "Gentle acoustic melody and piano with an uplifting feel matching bright, sunlit living rooms.",
    genre: "Gentle Acoustic",
    duration: "6:03",
    file: "/sample-music/wholesome.mp3",
    filename: "sunlit-open-house-wholesome.mp3"
  }
];

// ─── Aspect Ratios Config ───────────────────────────────────────────────────
const ASPECT_RATIOS = [
  { id: '1920:1080', label: '16:9 Landscape', sub: '1080p Full HD (YouTube / TV)', icon: Monitor },
  { id: '1280:720', label: '16:9 Landscape', sub: '720p HD (Fast Render)', icon: Monitor },
  { id: '1080:1920', label: '9:16 Vertical', sub: 'Shorts, Reels & TikTok', icon: Smartphone },
  { id: '720:720', label: '1:1 Square', sub: 'Square Post (Instagram)', icon: Square },
];

// ─── Transitions Config ─────────────────────────────────────────────────────
const TRANSITIONS = [
  { id: 'fade', label: 'Crossfade', desc: 'Smooth dissolve blend between slides' },
  { id: 'pan_zoom', label: 'Ken Burns', desc: 'Cinematic pan & zoom slow motion' },
  { id: 'slide', label: 'Directional Slide', desc: 'Smooth horizontal glide transition' },
  { id: 'wipe', label: 'Wipe / Swipe', desc: 'Linear directional wipe effect' },
  { id: 'push', label: 'Push Motion', desc: 'Outgoing slide pushed by incoming' },
  { id: 'zoom', label: 'Zoom Scale', desc: 'Dynamic scale in & scale out' },
  { id: 'cut', label: 'Direct Cut', desc: 'Instant switch with zero transition' },
  { id: 'pixelate', label: 'Dissolve / Blur', desc: 'Soft pixelated fade effect' },
];

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
    console.error('SlideshowPage Error:', error, errorInfo);
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
export default function SlideshowPage({ token, onOpenWpImport, onExportWp, wpImported }) {
  // Slides & Images State
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  // Audio & Music State
  const [music, setMusic] = useState(null);
  const [musicSource, setMusicSource] = useState('sample'); // 'sample' | 'custom' | 'none'
  const [musicFilter, setMusicFilter] = useState('all');
  const [selectedSampleTrack, setSelectedSampleTrack] = useState(REAL_ESTATE_SAMPLE_TRACKS[0]);
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef(null);

  // Video Settings State
  const [duration, setDuration] = useState(3.5);
  const [transition, setTransition] = useState('fade');
  const [resolution, setResolution] = useState('1920:1080');
  const [text, setText] = useState('');

  // Processing & Job Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // 'waiting' | 'active' | 'completed' | 'failed'
  const [jobResult, setJobResult] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const fileInputRef = useRef(null);
  const musicInputRef = useRef(null);
  const intervalRef = useRef(null);

  // ─── Handle WordPress Import ──────────────────────────────────────────────
  useEffect(() => {
    if (wpImported?.files?.length > 0) {
      const newFiles = wpImported.files.map(f => f.file || f);
      const newUrls = newFiles.map(f => URL.createObjectURL(f));
      setImages(prev => [...prev, ...newFiles]);
      setPreviews(prev => [...prev, ...newUrls]);
    }
  }, [wpImported]);

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
        setError('Please drop valid image files (JPG, PNG, WEBP, TIFF).');
        return;
      }

      const newUrls = validFiles.map(file => URL.createObjectURL(file));
      setImages(prev => [...prev, ...validFiles]);
      setPreviews(prev => [...prev, ...newUrls]);
      setError(null);
    }
  };

  const handleImageUpload = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const newUrls = newFiles.map(file => URL.createObjectURL(file));
      setImages(prev => [...prev, ...newFiles]);
      setPreviews(prev => [...prev, ...newUrls]);
      setError(null);
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

      setImages(prev => [...prev, newFile]);
      setPreviews(prev => [...prev, dataUrl]);
      setImageUrl('');
      setSuccessMessage(`Loaded "${filename}" into slide sequence.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download image from the provided URL.');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // ─── Slide Reordering & Deletion ──────────────────────────────────────────
  const moveSlideLeft = (index, e) => {
    if (e) e.stopPropagation();
    if (index <= 0) return;
    setImages(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
    setPreviews(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const moveSlideRight = (index, e) => {
    if (e) e.stopPropagation();
    if (index >= images.length - 1) return;
    setImages(prev => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
    setPreviews(prev => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const removeSlide = (index, e) => {
    if (e) e.stopPropagation();
    setImages(prev => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
    setPreviews(prev => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const clearAllSlides = () => {
    setImages([]);
    setPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Audio Playback Handlers ──────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch (_) {}
    }
    setPlayingTrackId(null);
    setAudioProgress(0);
    setAudioCurrentTime(0);
  }, []);

  const togglePlaySample = async (track, e) => {
    if (e) e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (playingTrackId === track.id) {
      if (audio.paused) {
        try {
          await audio.play();
        } catch (err) {
          if (err.name !== 'AbortError') console.warn('Audio resume error:', err);
        }
      } else {
        audio.pause();
        setPlayingTrackId(null);
      }
    } else {
      audio.pause();
      setPlayingTrackId(track.id);
      audio.src = track.file;
      audio.currentTime = 0;
      try {
        await audio.play();
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Audio playback error:', err);
        setPlayingTrackId(null);
      }
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      const dur = audioRef.current.duration || 1;
      setAudioCurrentTime(cur);
      setAudioDuration(dur);
      setAudioProgress((cur / dur) * 100);
    }
  };

  const handleAudioEnded = () => {
    setPlayingTrackId(null);
    setAudioProgress(0);
    setAudioCurrentTime(0);
  };

  const selectSampleTrack = (track) => {
    if (selectedSampleTrack?.id === track.id && musicSource === 'sample') {
      setSelectedSampleTrack(null);
      setMusicSource('none');
      stopAudio();
    } else {
      setSelectedSampleTrack(track);
      setMusicSource('sample');
      setMusic(null);
      if (musicInputRef.current) musicInputRef.current.value = '';
    }
  };

  const handleMusicUpload = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setMusic(e.target.files[0]);
      setMusicSource('custom');
      stopAudio();
    }
  };

  const removeCustomMusic = () => {
    setMusic(null);
    if (musicInputRef.current) musicInputRef.current.value = '';
    setMusicSource('none');
    stopAudio();
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ─── Generate Slideshow Job Submission ────────────────────────────────────
  const handleSubmit = async () => {
    if (images.length === 0) {
      setError('Please add at least one image to create a video slideshow.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    setJobId(null);
    setJobStatus(null);
    setJobResult(null);

    const formData = new FormData();
    images.forEach(img => formData.append('images', img));

    // Handle music attachment
    if (musicSource === 'custom' && music) {
      formData.append('music', music);
    } else if (musicSource === 'sample' && selectedSampleTrack) {
      try {
        const audioRes = await fetch(selectedSampleTrack.file);
        const audioBlob = await audioRes.blob();
        formData.append('music', audioBlob, selectedSampleTrack.filename);
      } catch (audioErr) {
        console.warn('Failed to load sample audio blob:', audioErr);
      }
    }

    formData.append('duration', String(duration));
    formData.append('transition', transition);
    formData.append('resolution', resolution);
    if (text) formData.append('text', text);
    formData.append('skipAI', 'true');

    try {
      const res = await axios.post(`${API_BASE}/images-to-video`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      setJobId(res.data.jobId);
      setJobStatus('waiting');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit video rendering job.');
      setIsSubmitting(false);
    }
  };

  const fetchJobStatus = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await axios.get(`${API_BASE}/jobs/${jobId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setJobStatus(res.data.state);

      if (res.data.state === 'completed' || res.data.state === 'failed') {
        clearInterval(intervalRef.current);
        setIsSubmitting(false);

        if (res.data.state === 'completed') {
          try {
            const resultRes = await axios.get(`${API_BASE}/jobs/${jobId}/result`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            setJobResult(resultRes.data);
            setSuccessMessage('Slideshow video rendered successfully!');
          } catch (e) {
            console.error('Failed to fetch job result payload:', e);
          }
        } else {
          setError('Video rendering job failed. Please try with different images or settings.');
        }
      }
    } catch (err) {
      console.error('Failed to poll job status:', err);
    }
  }, [jobId, token]);

  useEffect(() => {
    if (jobId && (jobStatus === 'waiting' || jobStatus === 'active')) {
      intervalRef.current = setInterval(fetchJobStatus, POLLING.jobStatus);
    }
    return () => clearInterval(intervalRef.current);
  }, [jobId, jobStatus, fetchJobStatus]);

  // Duration calculation
  const totalDurationSecs = Math.round(images.length * Number(duration));
  const totalMins = Math.floor(totalDurationSecs / 60);
  const totalSecsRemaining = totalDurationSecs % 60;
  const formattedTotalRuntime = images.length > 0
    ? `${totalMins > 0 ? `${totalMins}m ` : ''}${totalSecsRemaining}s`
    : '0s';

  // Filter sample tracks by group
  const filteredSampleTracks = REAL_ESTATE_SAMPLE_TRACKS.filter(t => {
    if (musicFilter === 'all') return true;
    return t.group === musicFilter;
  });

  return (
    <div className={styles.pageContainer}>
      {/* Hidden Audio Player for Sample Preview */}
      <audio 
        ref={audioRef}
        onTimeUpdate={handleAudioTimeUpdate}
        onEnded={handleAudioEnded}
        className="hidden"
      />

      {/* ─── Top Executive Header ───────────────────────────────────────────── */}
      <div className={styles.headerCard}>
        <div className={styles.headerTopRow}>
          <div>
            <h1 className={styles.brandTitle}>
              <Film className={styles.brandIcon} />
              Video Slideshow Studio
              <span className={styles.badgeStudio}>PRO REEL CREATOR</span>
            </h1>
            <p className={styles.pageSubtitle}>
              Transform property photos into cinematic video walkthroughs with curated real estate soundtracks, Ken Burns effects, and social-ready aspect ratios.
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

            {images.length > 0 && (
              <button
                type="button"
                onClick={clearAllSlides}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-rose-200 dark:hover:border-rose-900"
              >
                Clear All ({images.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Messages & Feedback ────────────────────────────────────────────── */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-xs font-medium flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
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

      {/* ─── Main Two-Column Studio Layout ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ─── Left Column (2 Cols): Upload, Slide Reel & Audio Studio ──────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Section 1: Upload Images & Slide Sequence */}
          <div className={styles.glassCard}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <ImagePlus className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  1. Slide Sequence & Imagery
                </h3>
                <p className={styles.cardSubtitle}>
                  Add photos, reorder slide positions, and arrange the flow of your video walkthrough.
                </p>
              </div>

              {images.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {images.length} {images.length === 1 ? 'Slide' : 'Slides'}
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className={styles.durationPill}>
                    <Clock className="w-3 h-3" />
                    Est. {formattedTotalRuntime}
                  </span>
                </div>
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
                {isDragging ? 'Drop images here to add to slideshow...' : 'Click or Drag & Drop Photos Here'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Upload JPG, PNG, WEBP, or TIFF. Rearrange slides easily below.
              </p>
            </div>

            {/* URL Import Row */}
            <form onSubmit={handleImportUrl} className={styles.urlImportRow}>
              <div className="relative flex-1">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Or paste remote image URL (https://example.com/photo.jpg)..."
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
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageUpload}
            />

            {/* Horizontal Slide Reel */}
            {images.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Slide Timeline ({images.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Use arrows on hover to reorder sequence
                  </span>
                </div>

                <div className={styles.reelScroll}>
                  {images.map((img, idx) => (
                    <div key={idx} className={styles.slideCard}>
                      <img
                        src={previews[idx] || URL.createObjectURL(img)}
                        alt={`Slide ${idx + 1}`}
                        className={styles.slideImg}
                      />
                      
                      <span className={styles.slideIndexBadge}>
                        #{idx + 1}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => removeSlide(idx, e)}
                        className={styles.slideDeleteBtn}
                        title="Remove slide"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>

                      <div className={styles.slideCardControls}>
                        <button
                          type="button"
                          onClick={(e) => moveSlideLeft(idx, e)}
                          disabled={idx === 0}
                          className={styles.slideControlBtn}
                          title="Move earlier"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => moveSlideRight(idx, e)}
                          disabled={idx === images.length - 1}
                          className={styles.slideControlBtn}
                          title="Move later"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Background Music & Audio Experience */}
          <div className={styles.glassCard}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <Music className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  2. Audio Soundtrack
                </h3>
                <p className={styles.cardSubtitle}>
                  Choose from our curated real estate music collection, upload custom music, or create a silent video.
                </p>
              </div>

              {/* Music Source Tabs */}
              <div className={styles.musicTabs}>
                <button
                  type="button"
                  onClick={() => {
                    setMusicSource('sample');
                    if (!selectedSampleTrack) setSelectedSampleTrack(REAL_ESTATE_SAMPLE_TRACKS[0]);
                  }}
                  className={`${styles.musicTabBtn} ${musicSource === 'sample' ? styles.musicTabBtnActive : ''}`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Curated Library</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopAudio();
                    setMusicSource('custom');
                  }}
                  className={`${styles.musicTabBtn} ${musicSource === 'custom' ? styles.musicTabBtnActive : ''}`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Custom Track</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMusicSource('none');
                    setSelectedSampleTrack(null);
                    removeCustomMusic();
                  }}
                  className={`${styles.musicTabBtn} ${musicSource === 'none' ? styles.musicTabBtnActive : ''}`}
                >
                  <span>Mute / None</span>
                </button>
              </div>
            </div>

            {/* Currently Active / Playing Music Banner */}
            {musicSource === 'sample' && selectedSampleTrack && (
              <div className={styles.activeTrackBanner}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#0b6230] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                    <Disc3 className={`w-5 h-5 ${playingTrackId === selectedSampleTrack.id ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {selectedSampleTrack.title}
                      </span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#0b6230]/10 text-[#0b6230] dark:text-[#3fa66e]">
                        Selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {selectedSampleTrack.category} • {selectedSampleTrack.duration}
                      </p>
                      {playingTrackId === selectedSampleTrack.id && (
                        <div className={styles.equalizer}>
                          <div className={styles.equalizerBar} />
                          <div className={styles.equalizerBar} />
                          <div className={styles.equalizerBar} />
                          <div className={styles.equalizerBar} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => togglePlaySample(selectedSampleTrack, e)}
                    className="px-3 py-1.5 rounded-lg bg-[#0b6230] hover:bg-[#095628] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    {playingTrackId === selectedSampleTrack.id ? (
                      <>
                        <Pause className="w-3.5 h-3.5" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" /> Preview
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      stopAudio();
                      setSelectedSampleTrack(null);
                      setMusicSource('none');
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                    title="Remove Track"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Custom Track Active Banner */}
            {musicSource === 'custom' && music && (
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 shadow-xs">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 bg-[#0b6230]/10 rounded-xl flex items-center justify-center flex-shrink-0 text-[#0b6230] dark:text-[#3fa66e]">
                    <Music className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{music.name}</p>
                    <p className="text-[11px] text-slate-500">{(music.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeCustomMusic}
                  className="text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-3 py-1.5 rounded-lg transition-colors border border-rose-200 dark:border-rose-900/60 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            )}

            {/* TAB CONTENT 1: Curated Real Estate Music Library */}
            {musicSource === 'sample' && (
              <div className="space-y-3">
                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {[
                    { id: 'all', label: 'All Tracks' },
                    { id: 'luxury', label: 'Luxury & Modern' },
                    { id: 'acoustic', label: 'Acoustic & Family' },
                    { id: 'jazz', label: 'Lounge & Jazz' },
                    { id: 'cinematic', label: 'Drone & Cinematic' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMusicFilter(tab.id)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        musicFilter === tab.id
                          ? 'bg-[#0b6230] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Track Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredSampleTracks.map((track) => {
                    const isSelected = selectedSampleTrack?.id === track.id;
                    const isPlaying = playingTrackId === track.id;

                    return (
                      <div
                        key={track.id}
                        onClick={() => selectSampleTrack(track)}
                        className={`${styles.trackCard} ${isSelected ? styles.trackCardSelected : ''}`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {track.category}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {track.duration}
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {track.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                            {track.description}
                          </p>
                        </div>

                        {/* Player Action Row */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => togglePlaySample(track, e)}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                                isPlaying
                                  ? 'bg-[#0b6230] text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-[#0b6230] hover:text-white'
                              }`}
                              title={isPlaying ? 'Pause' : 'Preview'}
                            >
                              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                            </button>

                            {isPlaying ? (
                              <div className="flex items-center gap-1 text-[10px] font-mono text-[#0b6230] dark:text-[#3fa66e] font-semibold">
                                <span>{formatTime(audioCurrentTime)}</span>
                                <span>/</span>
                                <span>{track.duration}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                {track.genre}
                              </span>
                            )}
                          </div>

                          <div>
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0b6230] dark:text-[#3fa66e] bg-emerald-100/60 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                                <Check className="w-3 h-3" /> Selected
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectSampleTrack(track);
                                }}
                                className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-[#0b6230] dark:hover:text-[#3fa66e] px-2 py-1 rounded transition-colors cursor-pointer"
                              >
                                Select Track
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar when Playing */}
                        {isPlaying && (
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
                            <div 
                              className="bg-[#0b6230] h-full transition-all duration-150" 
                              style={{ width: `${audioProgress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: Custom Audio Upload */}
            {musicSource === 'custom' && (
              <div>
                <div 
                  onClick={() => musicInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0b6230] rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/60 dark:bg-slate-950/60 text-center"
                >
                  <Music className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {music ? `Selected: ${music.name}` : 'Click to Upload Custom Audio File'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">Supports MP3, WAV, AAC, M4A up to 100MB</p>
                </div>
                <input 
                  type="file" 
                  accept="audio/*" 
                  className="hidden" 
                  ref={musicInputRef} 
                  onChange={handleMusicUpload} 
                />
              </div>
            )}

            {/* TAB CONTENT 3: Silent Mode */}
            {musicSource === 'none' && (
              <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/40 dark:bg-slate-950/40">
                <Volume2 className="w-6 h-6 text-slate-400 mx-auto mb-2 opacity-50" />
                <p className="text-xs text-slate-500 font-medium">Silent Video Mode (No background music will be rendered)</p>
                <button
                  type="button"
                  onClick={() => {
                    setMusicSource('sample');
                    setSelectedSampleTrack(REAL_ESTATE_SAMPLE_TRACKS[0]);
                  }}
                  className="mt-2 text-xs font-semibold text-[#0b6230] dark:text-[#3fa66e] hover:underline cursor-pointer"
                >
                  Browse Real Estate Soundtracks →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Right Column (1 Col): Settings, Durations & Render ───────────── */}
        <div className="space-y-6">

          {/* Settings Card */}
          <div className={styles.glassCard}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <Sliders className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  Video Format & Effects
                </h3>
                <p className={styles.cardSubtitle}>
                  Choose resolution, transitions, and timing.
                </p>
              </div>
            </div>

            {/* Aspect Ratio & Resolution Grid */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                Output Format & Aspect Ratio
              </label>
              <div className={styles.ratioGrid}>
                {ASPECT_RATIOS.map(ratio => {
                  const Icon = ratio.icon;
                  const isActive = resolution === ratio.id;
                  return (
                    <div
                      key={ratio.id}
                      onClick={() => setResolution(ratio.id)}
                      className={`${styles.ratioCard} ${isActive ? styles.ratioCardActive : ''}`}
                    >
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-[#0b6230] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{ratio.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{ratio.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Slide Duration Slider & Calculator */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Slide Duration ({duration}s per photo)
                </label>
                <span className={styles.durationPill}>
                  Total: {formattedTotalRuntime}
                </span>
              </div>

              <input
                type="range"
                min="1"
                max="12"
                step="0.5"
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#0b6230]"
              />

              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                <span>1s (Snappy)</span>
                <span>3.5s (Recommended)</span>
                <span>12s (Slow Pan)</span>
              </div>
            </div>

            {/* Transition Selector Grid */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                Visual Transition Effect
              </label>
              <div className={styles.transitionGrid}>
                {TRANSITIONS.map(t => {
                  const isActive = transition === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setTransition(t.id)}
                      className={`${styles.transitionCard} ${isActive ? styles.transitionCardActive : ''}`}
                    >
                      <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between">
                        <span>{t.label}</span>
                        {isActive && <Check className="w-3 h-3 text-[#0b6230] dark:text-[#3fa66e]" />}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                        {t.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Text Overlay */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Property Title Overlay (Optional)
              </label>
              <input
                type="text"
                maxLength={80}
                placeholder="e.g. 1420 Ocean Boulevard — Luxury Suite"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className={styles.urlInput}
              />
              <p className="text-[10px] text-slate-400 mt-1 text-right">
                {text.length}/80 characters
              </p>
            </div>

            {/* Submit CTA Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || images.length === 0}
              className={styles.submitBtn}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Encoding Video Walkthrough...</span>
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  <span>Generate Video Slideshow ✨</span>
                </>
              )}
            </button>
          </div>

          {/* Job Progress & Output Video Player Card */}
          {jobId && (
            <div className={styles.glassCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>
                    {jobStatus === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : jobStatus === 'failed' ? (
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-[#0b6230] animate-spin" />
                    )}
                    Render Engine Status: <span className="capitalize">{jobStatus || 'Queued'}</span>
                  </h3>
                  <p className={styles.cardSubtitle}>
                    {jobStatus === 'completed'
                      ? 'MP4 video successfully encoded and ready for download.'
                      : jobStatus === 'failed'
                      ? 'Encoding encountered an issue.'
                      : 'Processing frames with FFmpeg and audio sync...'}
                  </p>
                </div>
              </div>

              {/* Progress Shimmer Bar */}
              {(jobStatus === 'waiting' || jobStatus === 'active') && (
                <div className="space-y-2">
                  <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                    <div className="h-full bg-gradient-to-r from-[#0b6230] to-emerald-400 animate-pulse w-full" />
                  </div>
                  <p className="text-[11px] text-slate-500 text-center animate-pulse">
                    Rendering {images.length} slides with {transition} transition at {resolution}...
                  </p>
                </div>
              )}

              {/* Finished Video Player */}
              {jobStatus === 'completed' && (() => {
                const downloadUrl = jobResult?.videoUrl || (jobId ? `${API_BASE}/jobs/${jobId}/download` : null);

                return (
                  <div className="space-y-3.5">
                    {downloadUrl && (
                      <div className={styles.videoFrame}>
                        <video
                          src={downloadUrl}
                          controls
                          playsInline
                          autoPlay
                          className="w-full max-h-[300px] object-contain mx-auto"
                        />
                      </div>
                    )}

                    {downloadUrl && (
                      <div className="space-y-2">
                        <a
                          href={`${downloadUrl}?download=true`}
                          download={`slideshow_${jobId}.mp4`}
                          className={styles.downloadBtn}
                        >
                          <Download className="w-4 h-4" />
                          <span>Download MP4 Video</span>
                        </a>

                        {onExportWp && (
                          <button
                            type="button"
                            onClick={() => {
                              fetch(downloadUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                                .then(r => r.blob())
                                .then(blob => {
                                  const newFile = new File([blob], `slideshow-${jobId}.mp4`, { type: 'video/mp4' });
                                  onExportWp(newFile);
                                });
                            }}
                            className={styles.wpPushBtn}
                          >
                            <CloudUpload className="w-4 h-4" />
                            <span>Push Video to WordPress Media</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Export with Error Boundary ─────────────────────────────────────────────
export function SlideshowPageWithErrorBoundary(props) {
  return (
    <ErrorBoundary>
      <SlideshowPage {...props} />
    </ErrorBoundary>
  );
}

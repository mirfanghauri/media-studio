import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles, Wand2, ImagePlus, ArrowRightLeft, Film, Tag,
  History, SlidersHorizontal, Settings, Sun, Moon, Monitor,
  AlertCircle, LogOut, Loader2
} from 'lucide-react';
import axios from 'axios';

import StudioPage from './pages/StudioPage';
import CompressionPage from './pages/CompressionPage';
import SlideshowPage from './pages/SlideshowPage';
import MetadataPage from './pages/MetadataPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';

import WordPressImportModal from './components/WordPressImportModal';
import WordPressExportModal from './components/WordPressExportModal';
import ImagePreviewModal from './components/studio/ImagePreviewModal';
import { API_BASE, BRAND } from './config';

const VALID_TABS = ['studio', 'compression', 'slideshow', 'metadata', 'history', 'settings'];

function getTabFromLocation(location) {
  if (!location) return 'studio';
  const pathPart = location.pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase();
  if (pathPart && VALID_TABS.includes(pathPart)) {
    return pathPart;
  }
  const hashPart = location.hash.replace(/^#\/?/, '').split('/')[0]?.toLowerCase();
  if (hashPart && VALID_TABS.includes(hashPart)) {
    return hashPart;
  }
  return 'studio';
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [token, setToken] = useState(() => localStorage.getItem('ms_token'));
  const activeTab = getTabFromLocation(location);

  const setActiveTab = useCallback((tabId) => {
    const targetPath = tabId === 'studio' ? '/' : `/${tabId}`;
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  }, [location.pathname, navigate]);
  const [theme, setTheme] = useState(() => localStorage.getItem('ms_theme') || 'dark');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [providersMap, setProvidersMap] = useState({});
  const [modelsMap, setModelsMap] = useState({});

  // Lightbox preview modal state
  const [previewModalImage, setPreviewModalImage] = useState(null);

  // WordPress Import/Export state
  const [showWpImport, setShowWpImport] = useState(false);
  const [wpImportTarget, setWpImportTarget] = useState(null); // 'studio' | 'compression' | 'slideshow'
  const [showWpExport, setShowWpExport] = useState(false);
  const [wpExportFileData, setWpExportFileData] = useState(null);
  const [slideshowWpFiles, setSlideshowWpFiles] = useState(null);
  const [compressionWpFiles, setCompressionWpFiles] = useState(null);

  // Theme application
  useEffect(() => {
    localStorage.setItem('ms_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    }
  }, [theme]);

  // Load provider and model registry
  const loadProviders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE}/settings/providers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProvidersMap(res.data.providers || {});
      setModelsMap(res.data.models || {});
      setConfigLoaded(true);
    } catch (err) {
      console.error('Failed to load providers:', err);
      setConfigLoaded(true);
      if (err.response?.status === 401) {
        localStorage.removeItem('ms_token');
        setToken(null);
      }
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadProviders();
    }
  }, [token, activeTab, loadProviders]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { password });
      localStorage.setItem('ms_token', res.data.token);
      setToken(res.data.token);
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Invalid admin password');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('ms_token');
    setToken(null);
    setConfigLoaded(false);
  };

  const handleWpImport = (importedFiles) => {
    if (wpImportTarget === 'compression') {
      setCompressionWpFiles({ ts: Date.now(), files: importedFiles });
    } else if (wpImportTarget === 'slideshow') {
      setSlideshowWpFiles({ ts: Date.now(), files: importedFiles });
    }
  };

  // ─── Login Screen ───────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full animate-fade-in">
          <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
            <div className="flex flex-col items-center mb-8">
              <div className="p-4 rounded-2xl border border-[#0b6230]/40 mb-4 bg-[#0b6230]/15 shadow-inner">
                <Sparkles className="w-9 h-9 text-[#3fa66e]" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Media Studio AI
              </h1>
              <p className="text-slate-400 text-xs mt-1.5 font-medium text-center">
                High-Performance Generative Image & Asset Platform
              </p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2" htmlFor="login-password">
                  Admin Master Key
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-[#0b6230] focus:ring-2 focus:ring-[#0b6230]/40 transition-all text-sm placeholder-slate-500 shadow-inner"
                  placeholder="Enter administrator password…"
                  required
                />
              </div>
              {loginError && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}
              <button
                type="submit"
                className="w-full py-3.5 text-white rounded-xl font-bold text-sm shadow-lg hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
                style={{ background: BRAND.gradient }}
              >
                Sign In to Studio
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading Configuration ──────────────────────────────────────────────────
  if (!configLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-slate-950">
        <Loader2 className="w-10 h-10 animate-spin text-[#0b6230] dark:text-[#3fa66e] mb-3" />
        <p className="text-sm font-medium text-slate-500">Initializing Media Studio…</p>
      </div>
    );
  }

  // ─── Main Tabs Config ───────────────────────────────────────────────────────
  const TABS = [
    { id: 'studio', icon: <ImagePlus className="w-4 h-4" />, label: 'Studio' },
    { id: 'compression', icon: <ArrowRightLeft className="w-4 h-4" />, label: 'Converter & Compression' },
    { id: 'slideshow', icon: <Film className="w-4 h-4" />, label: 'Video Slideshow' },
    { id: 'metadata', icon: <Tag className="w-4 h-4" />, label: 'EXIF & Metadata' },
    { id: 'history', icon: <History className="w-4 h-4" />, label: 'History' },
    { id: 'settings', icon: <SlidersHorizontal className="w-4 h-4" />, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* ─── Modern Navbar ──────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 backdrop-blur-md bg-white/90 dark:bg-slate-950/90 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('studio')}>
              <div className="p-2 rounded-xl border border-[#0b6230]/30 bg-[#0b6230]/10 text-[#0b6230] dark:text-[#3fa66e] shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <span
                className="font-extrabold text-lg tracking-tight hidden sm:inline-block"
                style={{ background: BRAND.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                Media Studio AI
              </span>
            </div>

            {/* Nav Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto py-1">
              {TABS.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`nav-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'text-white shadow-md'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                    style={isActive ? { background: BRAND.primary } : {}}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Actions: Theme Toggle & Logout */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (theme === 'system') setTheme('light');
                  else if (theme === 'light') setTheme('dark');
                  else setTheme('system');
                }}
                title={`Current Theme: ${theme}`}
                className="p-2 rounded-xl text-slate-500 hover:text-[#0b6230] dark:hover:text-[#3fa66e] hover:bg-slate-100 dark:hover:bg-slate-900 transition-all cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
              >
                {theme === 'system' ? <Monitor className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all cursor-pointer border border-transparent hover:border-red-200 dark:hover:border-red-900/30"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Page Viewport ──────────────────────────────────────────────────── */}
      <main className="flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'studio' && (
          <StudioPage
            token={token}
            providersMap={providersMap}
            modelsMap={modelsMap}
            onNavigateTab={setActiveTab}
            onOpenWpImport={(target) => {
              setWpImportTarget(target);
              setShowWpImport(true);
            }}
            onExportWp={(file) => {
              setWpExportFileData(file);
              setShowWpExport(true);
            }}
            onPreview={setPreviewModalImage}
          />
        )}

        {activeTab === 'compression' && (
          <CompressionPage
            token={token}
            onOpenWpImport={() => {
              setWpImportTarget('compression');
              setShowWpImport(true);
            }}
            onExportWp={(file) => {
              setWpExportFileData(file);
              setShowWpExport(true);
            }}
            setPreviewModalImage={setPreviewModalImage}
            wpImportedFiles={compressionWpFiles}
          />
        )}

        {activeTab === 'slideshow' && (
          <SlideshowPage
            token={token}
            onOpenWpImport={() => {
              setWpImportTarget('slideshow');
              setShowWpImport(true);
            }}
            onExportWp={(file) => {
              setWpExportFileData(file);
              setShowWpExport(true);
            }}
            wpImported={slideshowWpFiles}
          />
        )}

        {activeTab === 'metadata' && (
          <MetadataPage token={token} />
        )}

        {activeTab === 'history' && (
          <HistoryPage
            token={token}
            onPreview={setPreviewModalImage}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage token={token} />
        )}
      </main>

      {/* ─── Global Modals ──────────────────────────────────────────────────── */}
      {previewModalImage && (
        <ImagePreviewModal
          image={previewModalImage}
          onClose={() => setPreviewModalImage(null)}
          onExportWp={(file) => {
            setWpExportFileData(file);
            setShowWpExport(true);
          }}
        />
      )}

      {showWpImport && (
        <WordPressImportModal
          isOpen={showWpImport}
          onClose={() => setShowWpImport(false)}
          onImport={handleWpImport}
          token={token}
        />
      )}

      {showWpExport && (
        <WordPressExportModal
          isOpen={showWpExport}
          onClose={() => {
            setShowWpExport(false);
            setWpExportFileData(null);
          }}
          fileData={wpExportFileData}
          token={token}
        />
      )}

      {/* ─── Clean Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 bg-white/50 dark:bg-slate-950/50">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} Media Studio AI · Multi-Provider Vision & Asset Engine</p>
          <p className="font-mono text-[11px] text-slate-400">OpenAI · Azure · Vertex AI · xAI</p>
        </div>
      </footer>
    </div>
  );
}

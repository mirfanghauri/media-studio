import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Save, CheckCircle2, Cpu, Palette, RotateCcw,
  Settings as SettingsIcon, SlidersHorizontal, Zap,
  Loader2, AlertTriangle, ImagePlus, UploadCloud,
  Video, Film, Globe, Layers, KeyRound, Sparkles,
  ChevronRight, ArrowRight, ShieldCheck, Check
} from 'lucide-react';
import Select from '../components/common/Select';
import { OUTPUT_FORMATS, QUALITY_OPTIONS } from '../constants/formats';
import { API_BASE, BRAND } from '../config';
import styles from './SettingsPage.module.css';

export default function SettingsPage({ token }) {
  const [settings, setSettings] = useState({
    default_ai_provider: 'azure',
    default_model: 'gpt-image-2',
    default_image_size: '1920x1088',
    default_output_format: 'png',
    default_quality: 'high',
    default_prompt_template: '',
    converter_default_size: 'original',
    imaginary_compression_type: 'lossy',
    imaginary_compression_level: '85',
    imaginary_resize_behavior: 'fit',
    brand_logo_path: '',
    brand_logo_position: 'bottom-right',
    brand_logo_size: '15',
    brand_logo_opacity: '85',
    brand_logo_enabled: 'false',
    azure_api_key: '',
    azure_endpoint: '',
    azure_api_version: '2025-04-01-preview',
    azure_agent_model: 'gpt-5.4-mini',
    azure_image_model: 'gpt-image-2',
    vertex_project_id: '',
    vertex_location: 'global',
    vertex_sa_key: '',
    openai_api_key: '',
    openai_base_url: 'https://api.openai.com/v1',
    openai_image_model: 'gpt-image-2',
    openai_vision_model: 'gpt-4o-mini',
    openai_text_model: 'gpt-4o-mini',
    xai_api_key: '',
    xai_base_url: 'https://api.x.ai/v1',
    xai_image_model: 'grok-imagine-image-2.0',
    aws_access_key_id: '',
    aws_secret_access_key: '',
    aws_region: 'us-east-1',
    bedrock_model: 'anthropic.claude-3-haiku-20240307-v1:0',
    video_ai_provider: 'openai',
    video_whisper_model: 'base',
    video_frames_per_second: '1',
    video_max_frames: '30',
    video_cleanup_after_processing: 'true',
    vertex_video_model: 'gemini-2.5-flash',
    video_metadata_prompt_template: '',
    custom_models: '[]',
    wp_url: '',
    wp_username: '',
    wp_password: '',
  });

  const [activeTab, setActiveTab] = useState('providers'); // 'providers' | 'general' | 'video' | 'compression' | 'branding' | 'wordpress'
  const [modelsMap, setModelsMap] = useState({});
  const [providersMap, setProvidersMap] = useState({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState({});
  const [testingProvider, setTestingProvider] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsRes, provRes] = await Promise.all([
          axios.get(`${API_BASE}/images/settings`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_BASE}/settings/providers`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setSettings(prev => ({ ...prev, ...settingsRes.data }));
        if (provRes.data) {
          setProvidersMap(provRes.data.providers || {});
          setModelsMap(provRes.data.models || {});
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    if (token) load();
  }, [token]);

  const handleTestProvider = async (providerKey) => {
    setTestingProvider(prev => ({ ...prev, [providerKey]: true }));
    setTestResults(prev => ({ ...prev, [providerKey]: null }));
    try {
      const res = await axios.post(`${API_BASE}/images/settings/test-provider`, {
        provider: providerKey,
        credentials: settings
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      setTestResults(prev => ({ ...prev, [providerKey]: res.data }));
    } catch (err) {
      const errRes = err.response?.data?.error || err.message || 'Connection test failed';
      setTestResults(prev => ({ ...prev, [providerKey]: { success: false, error: errRes } }));
    } finally {
      setTestingProvider(prev => ({ ...prev, [providerKey]: false }));
    }
  };

  const handleSave = async () => {
    try {
      await axios.post(`${API_BASE}/images/settings`, settings, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const handleLogoUpload = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const form = new FormData();
    form.append('logo', file);
    try {
      const res = await axios.post(`${API_BASE}/images/logo/upload`, form, {
        headers: { Authorization: `Bearer ${token}` }
      });
      update('brand_logo_path', res.data.path);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to upload logo');
    }
  };

  const handleLogoDelete = async () => {
    try {
      await axios.delete(`${API_BASE}/images/logo/upload`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      update('brand_logo_path', '');
    } catch (err) {
      console.error('Failed to delete logo:', err);
    }
  };

  const update = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  const NAV_ITEMS = [
    { id: 'providers', label: 'AI Cloud Credentials', icon: <KeyRound className="w-4 h-4" />, count: '5' },
    { id: 'general', label: 'Generation Defaults', icon: <Cpu className="w-4 h-4" /> },
    { id: 'video', label: 'Video & Audio Pipeline', icon: <Video className="w-4 h-4" /> },
    { id: 'compression', label: 'Image Compression', icon: <SlidersHorizontal className="w-4 h-4" /> },
    { id: 'branding', label: 'Watermark Branding', icon: <ImagePlus className="w-4 h-4" /> },
    { id: 'wordpress', label: 'WordPress Integration', icon: <Globe className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#0b6230]" />
      </div>
    );
  }

  return (
    <div className={styles.settingsContainer}>
      {/* ─── Top Executive Header ───────────────────────────────────────────── */}
      <div className={styles.headerCard}>
        <div>
          <h1 className={styles.brandTitle}>
            <SettingsIcon className={styles.brandIcon} />
            Studio Configuration & Cloud Credentials
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your AI model keys, video transcription pipelines, default presets, and watermark overlays
          </p>
        </div>
        <button
          onClick={handleSave}
          className={`${styles.saveBtn} ${saved ? styles.saveBtnSaved : ''}`}
        >
          {saved ? (
            <>
              <CheckCircle2 className="w-4 h-4" /> Saved Changes
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Configuration
            </>
          )}
        </button>
      </div>

      {/* ─── Split Layout: Left Navigation Rail + Right Workspace ────────────── */}
      <div className={styles.layoutSplit}>
        {/* Left Sub-Navigation Rail */}
        <aside className={styles.sidebarNav}>
          <div className={styles.sidebarHeading}>Configuration</div>
          {NAV_ITEMS.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`${styles.navItemBtn} ${isActive ? styles.navItemBtnActive : ''}`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.count && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Right Workspace Area */}
        <div className={styles.workspaceArea}>
          {/* ─── TAB 1: AI Cloud Credentials ─────────────────────────────────── */}
          {activeTab === 'providers' && (
            <div className="space-y-6">
              <div className={styles.glassCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>
                      <KeyRound className="w-5 h-5 text-[#0b6230] dark:text-[#3fa66e]" />
                      Multi-Provider Cloud Credentials
                    </h2>
                    <p className={styles.cardSubtitle}>Configure endpoints, authentication tokens, and models for each generative provider</p>
                  </div>
                  <span className={styles.statusPillActive}>
                    <ShieldCheck className="w-3.5 h-3.5" /> 5 Providers Supported
                  </span>
                </div>

                <div className={styles.providersGrid}>
                  {/* OpenAI Card */}
                  <div className={styles.providerCard}>
                    <div className={styles.providerCardHeader}>
                      <div className={styles.providerTitle}>
                        <div className={styles.providerLogo}>🤖</div>
                        <div>
                          <h3 className="text-sm font-semibold">OpenAI Direct</h3>
                          <span className="text-[11px] text-slate-500">Official API & Whisper Engine</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestProvider('openai')}
                        disabled={testingProvider.openai}
                        className={styles.testBtn}
                      >
                        {testingProvider.openai ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Test Connection
                      </button>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>API Key</label>
                      <input
                        type="password"
                        placeholder="sk-proj-..."
                        value={settings.openai_api_key || ''}
                        onChange={e => update('openai_api_key', e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Base URL</label>
                      <input
                        type="text"
                        placeholder="https://api.openai.com/v1"
                        value={settings.openai_base_url || ''}
                        onChange={e => update('openai_base_url', e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Vision Model</label>
                        <input
                          type="text"
                          placeholder="gpt-4o-mini"
                          value={settings.openai_vision_model || ''}
                          onChange={e => update('openai_vision_model', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Text Model</label>
                        <input
                          type="text"
                          placeholder="gpt-4o-mini"
                          value={settings.openai_text_model || ''}
                          onChange={e => update('openai_text_model', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                    </div>

                    {testResults.openai && (
                      <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                        testResults.openai.success
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                      }`}>
                        {testResults.openai.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />}
                        <span className="font-medium">{testResults.openai.message || testResults.openai.error}</span>
                      </div>
                    )}
                  </div>

                  {/* Azure OpenAI Card */}
                  <div className={styles.providerCard}>
                    <div className={styles.providerCardHeader}>
                      <div className={styles.providerTitle}>
                        <div className={styles.providerLogo}>☁️</div>
                        <div>
                          <h3 className="text-sm font-semibold">Azure OpenAI</h3>
                          <span className="text-[11px] text-slate-500">Enterprise Dedicated Endpoints</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestProvider('azure')}
                        disabled={testingProvider.azure}
                        className={styles.testBtn}
                      >
                        {testingProvider.azure ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Test Connection
                      </button>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Azure Resource Endpoint</label>
                      <input
                        type="text"
                        placeholder="https://my-resource.openai.azure.com/"
                        value={settings.azure_endpoint || ''}
                        onChange={e => update('azure_endpoint', e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Azure API Key</label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••"
                        value={settings.azure_api_key || ''}
                        onChange={e => update('azure_api_key', e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Image Model / Deployment</label>
                        <input
                          type="text"
                          placeholder="gpt-image-2"
                          value={settings.azure_image_model || ''}
                          onChange={e => update('azure_image_model', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Agent / Video Model</label>
                        <input
                          type="text"
                          placeholder="gpt-5.4-mini"
                          value={settings.azure_agent_model || ''}
                          onChange={e => update('azure_agent_model', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>API Version</label>
                        <input
                          type="text"
                          placeholder="2025-04-01-preview"
                          value={settings.azure_api_version || ''}
                          onChange={e => update('azure_api_version', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                    </div>

                    {testResults.azure && (
                      <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                        testResults.azure.success
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                      }`}>
                        {testResults.azure.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />}
                        <span className="font-medium">{testResults.azure.message || testResults.azure.error}</span>
                      </div>
                    )}
                  </div>

                  {/* xAI Grok Imagine Card */}
                  <div className={styles.providerCard}>
                    <div className={styles.providerCardHeader}>
                      <div className={styles.providerTitle}>
                        <div className={styles.providerLogo}>⚡</div>
                        <div>
                          <h3 className="text-sm font-semibold">xAI (Grok Imagine)</h3>
                          <span className="text-[11px] text-slate-500">Image Generation & Inpainting</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestProvider('xai')}
                        disabled={testingProvider.xai}
                        className={styles.testBtn}
                      >
                        {testingProvider.xai ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Test Connection
                      </button>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>xAI API Key</label>
                      <input
                        type="password"
                        placeholder="xai-..."
                        value={settings.xai_api_key || ''}
                        onChange={e => update('xai_api_key', e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Base URL</label>
                      <input
                        type="text"
                        placeholder="https://api.x.ai/v1"
                        value={settings.xai_base_url || ''}
                        onChange={e => update('xai_base_url', e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Default Image Model</label>
                      <input
                        type="text"
                        placeholder="grok-imagine-image-2.0"
                        value={settings.xai_image_model || ''}
                        onChange={e => update('xai_image_model', e.target.value)}
                        className={styles.textInput}
                      />
                      <span className="text-[11px] text-slate-500">
                        Default: <code className="font-mono text-[#0b6230] dark:text-[#3fa66e]">grok-imagine-image-2.0</code> ($0.04/img)
                      </span>
                    </div>

                    {testResults.xai && (
                      <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                        testResults.xai.success
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                      }`}>
                        {testResults.xai.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />}
                        <span className="font-medium">{testResults.xai.message || testResults.xai.error}</span>
                      </div>
                    )}
                  </div>

                  {/* Google Vertex AI Card */}
                  <div className={styles.providerCard}>
                    <div className={styles.providerCardHeader}>
                      <div className={styles.providerTitle}>
                        <div className={styles.providerLogo}>🔮</div>
                        <div>
                          <h3 className="text-sm font-semibold">Google Vertex AI</h3>
                          <span className="text-[11px] text-slate-500">Gemini 2.5 Flash & Vision Metadata</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestProvider('vertex')}
                        disabled={testingProvider.vertex}
                        className={styles.testBtn}
                      >
                        {testingProvider.vertex ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Test Connection
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>GCP Project ID</label>
                        <input
                          type="text"
                          placeholder="my-gcp-project"
                          value={settings.vertex_project_id || ''}
                          onChange={e => update('vertex_project_id', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Location Region</label>
                        <input
                          type="text"
                          placeholder="global"
                          value={settings.vertex_location || ''}
                          onChange={e => update('vertex_location', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Service Account Key (Base64 / JSON)</label>
                      <textarea
                        placeholder="{...}"
                        rows="2"
                        value={settings.vertex_sa_key || ''}
                        onChange={e => update('vertex_sa_key', e.target.value)}
                        className={`${styles.textInput} font-mono text-[11px] resize-none`}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Gemini Model ID</label>
                      <input
                        type="text"
                        placeholder="gemini-2.5-flash"
                        value={settings.vertex_video_model || ''}
                        onChange={e => update('vertex_video_model', e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    {testResults.vertex && (
                      <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                        testResults.vertex.success
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                      }`}>
                        {testResults.vertex.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />}
                        <span className="font-medium">{testResults.vertex.message || testResults.vertex.error}</span>
                      </div>
                    )}
                  </div>

                  {/* AWS Bedrock Card */}
                  <div className={styles.providerCard}>
                    <div className={styles.providerCardHeader}>
                      <div className={styles.providerTitle}>
                        <div className={styles.providerLogo}>📦</div>
                        <div>
                          <h3 className="text-sm font-semibold">AWS Bedrock</h3>
                          <span className="text-[11px] text-slate-500">Claude 3 Haiku & Titan Multimodal</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestProvider('bedrock')}
                        disabled={testingProvider.bedrock}
                        className={styles.testBtn}
                      >
                        {testingProvider.bedrock ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Test Connection
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Access Key ID</label>
                        <input
                          type="text"
                          placeholder="AKIA..."
                          value={settings.aws_access_key_id || ''}
                          onChange={e => update('aws_access_key_id', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Secret Key</label>
                        <input
                          type="password"
                          placeholder="••••••••••••••••"
                          value={settings.aws_secret_access_key || ''}
                          onChange={e => update('aws_secret_access_key', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Region</label>
                        <input
                          type="text"
                          placeholder="us-east-1"
                          value={settings.aws_region || ''}
                          onChange={e => update('aws_region', e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Model ARN / ID</label>
                      <input
                        type="text"
                        placeholder="anthropic.claude-3-haiku-20240307-v1:0"
                        value={settings.bedrock_model || ''}
                        onChange={e => update('bedrock_model', e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    {testResults.bedrock && (
                      <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                        testResults.bedrock.success
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                      }`}>
                        {testResults.bedrock.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />}
                        <span className="font-medium">{testResults.bedrock.message || testResults.bedrock.error}</span>
                      </div>
                    )}
                  </div>

                  {/* Custom Models JSON Card */}
                  <div className={styles.providerCard}>
                    <div className={styles.providerCardHeader}>
                      <div className={styles.providerTitle}>
                        <div className={styles.providerLogo}>
                          <Layers className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Custom Models (JSON)</h3>
                          <span className="text-[11px] text-slate-500">Inject dynamic model schemas</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Model Registry Definition</label>
                      <textarea
                        value={settings.custom_models}
                        onChange={e => update('custom_models', e.target.value)}
                        className={`${styles.textInput} font-mono text-[11px] h-36 resize-none`}
                        placeholder='[ { "id": "custom-model", "provider": "openai", "label": "Custom Model", "sizes": [] } ]'
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 2: Generation Defaults ──────────────────────────────────── */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className={styles.glassCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>
                      <Cpu className="w-5 h-5 text-[#0b6230] dark:text-[#3fa66e]" />
                      Default Generation Presets
                    </h2>
                    <p className={styles.cardSubtitle}>Initial settings populated when opening Studio or Quick Editor</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="setting-provider">Default AI Provider</label>
                    <Select
                      id="setting-provider"
                      value={settings.default_ai_provider || 'openai'}
                      onChange={v => {
                        update('default_ai_provider', v);
                        const firstModel = Object.keys(modelsMap).find(k => modelsMap[k].provider === v);
                        if (firstModel) update('default_model', firstModel);
                      }}
                      options={[
                        { value: 'openai', label: 'OpenAI Direct' },
                        { value: 'azure', label: 'Azure OpenAI' },
                        { value: 'vertex', label: 'Google Vertex AI' },
                      ]}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="setting-model">Default Model</label>
                    <Select
                      id="setting-model"
                      value={settings.default_model}
                      onChange={v => update('default_model', v)}
                      options={
                        Object.entries(modelsMap)
                          .filter(([_, m]) => m.provider === (settings.default_ai_provider || 'openai'))
                          .map(([key, m]) => ({ value: key, label: `${m.label} (${m.badge || m.provider})` }))
                      }
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="setting-image-size">Default Image Size</label>
                    <Select
                      id="setting-image-size"
                      value={settings.default_image_size || '1920x1088'}
                      onChange={v => update('default_image_size', v)}
                      options={modelsMap[settings.default_model]?.sizes || modelsMap['gpt-image-2']?.sizes || []}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="setting-quality">Default Quality</label>
                    <Select
                      id="setting-quality"
                      value={settings.default_quality}
                      onChange={v => update('default_quality', v)}
                      options={QUALITY_OPTIONS.map(q => ({ value: q.value, label: q.label }))}
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <label className={styles.inputLabel}>Default Output Format</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1.5">
                    {OUTPUT_FORMATS.map(fmt => {
                      const isSelected = settings.default_output_format === fmt.value;
                      return (
                        <button
                          key={fmt.value}
                          type="button"
                          onClick={() => update('default_output_format', fmt.value)}
                          className={`${styles.formatTile} ${isSelected ? styles.formatTileSelected : ''}`}
                        >
                          <span className="text-2xl mb-1">{fmt.icon}</span>
                          <span className="text-xs font-semibold">{fmt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Prompt Template */}
              <div className={styles.glassCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>
                      <Palette className="w-5 h-5 text-[#0b6230] dark:text-[#3fa66e]" />
                      Universal Prompt Enhancement Template
                    </h2>
                    <p className={styles.cardSubtitle}>Automatically prepended to image prompts to enforce studio aesthetic</p>
                  </div>
                </div>
                <textarea
                  id="setting-prompt-template"
                  rows={3}
                  value={settings.default_prompt_template}
                  onChange={e => update('default_prompt_template', e.target.value)}
                  placeholder="e.g., 'Ultra-realistic, 8K HDR, dramatic lighting' — leave blank to disable"
                  className={styles.textInput}
                />
                {settings.default_prompt_template && (
                  <button
                    type="button"
                    onClick={() => update('default_prompt_template', '')}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 transition-all cursor-pointer self-start"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Clear template
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB 3: Video & Audio Pipeline ───────────────────────────────── */}
          {activeTab === 'video' && (
            <div className="space-y-6">
              <div className={styles.glassCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>
                      <Video className="w-5 h-5 text-[#0b6230] dark:text-[#3fa66e]" />
                      Video & Audio Processing Pipeline
                    </h2>
                    <p className={styles.cardSubtitle}>Configure Whisper STT audio transcription and Gemini SEO metadata extraction</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="setting-video-provider">Video AI Provider</label>
                    <Select
                      id="setting-video-provider"
                      value={settings.video_ai_provider || 'openai'}
                      onChange={v => update('video_ai_provider', v)}
                      options={[
                        { value: 'openai', label: 'OpenAI Direct' },
                        { value: 'azure', label: 'Azure OpenAI' },
                        { value: 'vertex', label: 'Google Vertex AI (Gemini)' },
                        { value: 'bedrock', label: 'AWS Bedrock' },
                      ]}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="setting-whisper-model">Whisper STT Model</label>
                    <Select
                      id="setting-whisper-model"
                      value={settings.video_whisper_model || 'base'}
                      onChange={v => update('video_whisper_model', v)}
                      options={[
                        { value: 'tiny', label: 'Tiny (~39M params)' },
                        { value: 'base', label: 'Base (~74M params)' },
                        { value: 'small', label: 'Small (~244M params)' },
                        { value: 'medium', label: 'Medium (~769M params)' },
                        { value: 'large-v3', label: 'Large-v3 (~1550M params)' },
                      ]}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="setting-video-fps">Extraction Rate (FPS)</label>
                    <input
                      id="setting-video-fps"
                      type="number"
                      min="0.2"
                      max="10"
                      step="0.5"
                      value={settings.video_frames_per_second || '1'}
                      onChange={e => update('video_frames_per_second', e.target.value)}
                      className={styles.textInput}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="setting-video-max-frames">Max Frame Samples</label>
                    <input
                      id="setting-video-max-frames"
                      type="number"
                      min="5"
                      max="300"
                      step="5"
                      value={settings.video_max_frames || '30'}
                      onChange={e => update('video_max_frames', e.target.value)}
                      className={styles.textInput}
                    />
                  </div>
                </div>

                {/* Video Prompt Template */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className={styles.inputLabel} htmlFor="setting-video-prompt">
                      Video SEO & Multimodal Prompt Template
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Use <code className="font-mono text-[#0b6230] dark:text-[#3fa66e] bg-[#0b6230]/10 px-1.5 py-0.5 rounded">{"{transcript}"}</code> placeholder
                    </span>
                  </div>
                  <textarea
                    id="setting-video-prompt"
                    rows={5}
                    value={settings.video_metadata_prompt_template || ''}
                    onChange={e => update('video_metadata_prompt_template', e.target.value)}
                    placeholder="You are a YouTube SEO expert. Analyze this video content and generate optimized YouTube metadata... (leave blank to use default YouTube SEO prompt)"
                    className={`${styles.textInput} font-mono text-xs resize-none`}
                  />
                  {settings.video_metadata_prompt_template && (
                    <button
                      type="button"
                      onClick={() => update('video_metadata_prompt_template', '')}
                      className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset to default YouTube SEO template
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Auto-delete temporary frames after processing</p>
                    <p className="text-[11px] text-slate-500">Cleans up extracted JPG frames and temporary JSON transcripts to conserve storage</p>
                  </div>
                  <div className={styles.segmentedControl}>
                    {['true', 'false'].map(val => {
                      const isActive = (settings.video_cleanup_after_processing || 'true') === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => update('video_cleanup_after_processing', val)}
                          className={`${styles.segmentedBtn} ${isActive ? styles.segmentedBtnActive : ''}`}
                        >
                          {val === 'true' ? 'Enabled' : 'Disabled'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 4: Image Compression (Imaginary) ───────────────────────── */}
          {activeTab === 'compression' && (
            <div className="space-y-6">
              <div className={styles.glassCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>
                      <SlidersHorizontal className="w-5 h-5 text-[#0b6230] dark:text-[#3fa66e]" />
                      High-Performance Image Compression (Imaginary)
                    </h2>
                    <p className={styles.cardSubtitle}>Server-side image pipeline options and compression levels</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel}>Compression Mode</label>
                    <div className={styles.segmentedControl}>
                      {['lossy', 'lossless'].map(type => {
                        const isActive = settings.imaginary_compression_type === type;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => update('imaginary_compression_type', type)}
                            className={`${styles.segmentedBtn} ${isActive ? styles.segmentedBtnActive : ''}`}
                          >
                            {type}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel}>Resize Behavior</label>
                    <Select
                      id="setting-resize"
                      value={settings.imaginary_resize_behavior}
                      onChange={v => update('imaginary_resize_behavior', v)}
                      options={[
                        { value: 'fit', label: 'Fit (preserve aspect ratio)' },
                        { value: 'crop', label: 'Crop (fill target area)' },
                        { value: 'stretch', label: 'Stretch (exact dimensions)' },
                      ]}
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <label className={styles.inputLabel} htmlFor="compression-slider">
                      Compression Factor
                    </label>
                    <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
                      {settings.imaginary_compression_level}%
                    </span>
                  </div>
                  <input
                    id="compression-slider"
                    type="range"
                    min="1"
                    max="100"
                    value={settings.imaginary_compression_level}
                    onChange={e => update('imaginary_compression_level', e.target.value)}
                    className={styles.slider3d}
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-medium">
                    <span>Maximum Quality (1)</span>
                    <span>Maximum Compression (100)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 5: Brand Logo Watermark ────────────────────────────────── */}
          {activeTab === 'branding' && (
            <div className="space-y-6">
              <div className={styles.glassCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>
                      <ImagePlus className="w-5 h-5 text-[#0b6230] dark:text-[#3fa66e]" />
                      Brand Logo Watermark Overlay
                    </h2>
                    <p className={styles.cardSubtitle}>Overlay your organization's logo onto generated or compressed assets</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-semibold">
                      {settings.brand_logo_enabled === 'true' ? 'Active' : 'Disabled'}
                    </span>
                    <button
                      type="button"
                      onClick={() => update('brand_logo_enabled', settings.brand_logo_enabled === 'true' ? 'false' : 'true')}
                      className={`${styles.toggleSwitch} ${settings.brand_logo_enabled === 'true' ? styles.toggleSwitchActive : ''}`}
                    >
                      <span className={`${styles.toggleThumb} ${settings.brand_logo_enabled === 'true' ? styles.toggleThumbActive : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="space-y-3">
                    <label className={styles.inputLabel}>Watermark Asset</label>
                    {settings.brand_logo_path ? (
                      <div className="relative group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 overflow-hidden aspect-video flex items-center justify-center p-4">
                        <img
                          src={`${API_BASE}/images/logo/serve?t=${Date.now()}`}
                          alt="Brand Logo"
                          className="max-w-full max-h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-xs">
                          <button
                            type="button"
                            onClick={() => document.getElementById('logo-upload').click()}
                            className="px-3.5 py-1.5 text-white text-xs font-medium rounded-lg bg-[#0b6230] hover:bg-[#0e773a] shadow-lg cursor-pointer"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={handleLogoDelete}
                            className="px-3.5 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs font-medium rounded-lg border border-red-500/30 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => document.getElementById('logo-upload').click()}
                        className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0b6230] bg-slate-50 dark:bg-slate-950 aspect-video flex flex-col items-center justify-center cursor-pointer transition-colors text-slate-500 hover:text-[#0b6230] dark:hover:text-[#3fa66e]"
                      >
                        <UploadCloud className="w-8 h-8 mb-2 opacity-60" />
                        <span className="text-xs font-medium">Upload Transparent PNG or SVG Logo</span>
                      </div>
                    )}
                    <input id="logo-upload" type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden" onChange={handleLogoUpload} />
                  </div>

                  <div className="space-y-4">
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel}>Position</label>
                      <Select
                        id="setting-logo-position"
                        value={settings.brand_logo_position}
                        onChange={v => update('brand_logo_position', v)}
                        options={[
                          { value: 'bottom-right', label: 'Bottom Right' },
                          { value: 'bottom-left', label: 'Bottom Left' },
                          { value: 'top-right', label: 'Top Right' },
                          { value: 'top-left', label: 'Top Left' },
                          { value: 'center', label: 'Center' },
                        ]}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={styles.inputLabel}>Scale Size (Width %)</label>
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-300 font-semibold">{settings.brand_logo_size}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        value={settings.brand_logo_size}
                        onChange={e => update('brand_logo_size', e.target.value)}
                        className={styles.slider3d}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={styles.inputLabel}>Opacity Transparency</label>
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-300 font-semibold">{settings.brand_logo_opacity}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={settings.brand_logo_opacity}
                        onChange={e => update('brand_logo_opacity', e.target.value)}
                        className={styles.slider3d}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 6: WordPress Integration ────────────────────────────────── */}
          {activeTab === 'wordpress' && (
            <div className="space-y-6">
              <div className={styles.glassCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>
                      <Globe className="w-5 h-5 text-[#0b6230] dark:text-[#3fa66e]" />
                      WordPress Media Integration
                    </h2>
                    <p className={styles.cardSubtitle}>Sync and publish generated images directly to your WordPress media library</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className={styles.formGroup}>
                    <label className={styles.inputLabel} htmlFor="setting-wp-url">Site URL</label>
                    <input
                      id="setting-wp-url"
                      type="url"
                      value={settings.wp_url || ''}
                      onChange={e => update('wp_url', e.target.value)}
                      placeholder="https://maxxcapitals.com"
                      className={styles.textInput}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="setting-wp-username">Administrator Username</label>
                      <input
                        id="setting-wp-username"
                        type="text"
                        value={settings.wp_username || ''}
                        onChange={e => update('wp_username', e.target.value)}
                        placeholder="admin"
                        className={styles.textInput}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.inputLabel} htmlFor="setting-wp-password">Application Password</label>
                      <input
                        id="setting-wp-password"
                        type="password"
                        value={settings.wp_password || ''}
                        onChange={e => update('wp_password', e.target.value)}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className={styles.textInput}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

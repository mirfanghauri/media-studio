import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Wand2, Sparkles, UploadCloud, CloudDownload, Image as ImageIcon,
  SlidersHorizontal, Cpu, Zap, Loader2, X
} from 'lucide-react';
import Select from '../components/common/Select';
import ProcessingPanel from '../components/studio/ProcessingPanel';
import { OUTPUT_FORMATS, QUALITY_OPTIONS } from '../constants/formats';
import { API_BASE, BRAND } from '../config';

export default function StudioPage({
  token,
  providersMap = {},
  modelsMap = {},
  onNavigateTab,
  onOpenWpImport,
  onExportWp,
  onPreview
}) {
  const [files, setFiles] = useState([]);
  const [operationType, setOperationType] = useState('edit'); // 'edit' | 'generate'
  const [aiProvider, setAiProvider] = useState('openai');
  const [model, setModel] = useState('gpt-image-2');
  const [imageSize, setImageSize] = useState('1920x1088');
  const [outputFormat, setOutputFormat] = useState('png');
  const [quality, setQuality] = useState('high');
  const [applyLogo, setApplyLogo] = useState(true);
  const [processingMode, setProcessingMode] = useState('batch'); // default 'batch' (50% Off) for openai gpt-image-2
  const [isBatchPrompt, setIsBatchPrompt] = useState(true);
  const [batchPrompt, setBatchPrompt] = useState('');
  const [individualPrompts, setIndividualPrompts] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Batch status panel
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [showProcessing, setShowProcessing] = useState(false);
  const [processingFiles, setProcessingFiles] = useState([]);

  // Load defaults from settings
  useEffect(() => {
    if (!token) return;
    axios.get(`${API_BASE}/images/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const s = res.data;
        if (s.default_ai_provider) setAiProvider(s.default_ai_provider);
        if (s.default_model) setModel(s.default_model);
        if (s.default_image_size) setImageSize(s.default_image_size);
        if (s.default_output_format) setOutputFormat(s.default_output_format);
        if (s.default_quality) setQuality(s.default_quality);
        if (s.brand_logo_enabled) setApplyLogo(s.brand_logo_enabled === 'true');
        const effectiveProvider = s.default_ai_provider || 'openai';
        const effectiveModel = s.default_model || 'gpt-image-2';
        if (effectiveProvider === 'openai' && effectiveModel === 'gpt-image-2') {
          setProcessingMode('batch');
        }
      })
      .catch(err => {
        console.warn('Failed to load studio defaults:', err);
      });
  }, [token]);

  // Ensure selected provider is configured
  useEffect(() => {
    if (Object.keys(providersMap).length > 0) {
      const current = providersMap[aiProvider];
      if (current && current.configured === false) {
        const firstConfigured = Object.keys(providersMap).find(k => providersMap[k].configured !== false);
        if (firstConfigured) {
          setAiProvider(firstConfigured);
          const firstModel = Object.keys(modelsMap).find(k => modelsMap[k].provider === firstConfigured);
          if (firstModel) setModel(firstModel);
        }
      }
    }
  }, [providersMap, aiProvider, modelsMap]);

  // Default to batch processing (50% Off) for OpenAI gpt-image-2, or realtime for other providers
  useEffect(() => {
    if (aiProvider === 'openai' && model === 'gpt-image-2') {
      setProcessingMode('batch');
    } else if (aiProvider !== 'openai') {
      setProcessingMode('realtime');
    }
  }, [aiProvider, model]);

  // Adjust size if current size isn't supported by selected model
  useEffect(() => {
    const validSizes = modelsMap[model]?.sizes?.map(s => s.value) || [];
    if (validSizes.length > 0 && !validSizes.includes(imageSize)) {
      setImageSize(validSizes[0]);
    }
  }, [model, modelsMap, imageSize]);

  const handleFileChange = (e) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files)]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setIndividualPrompts(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (operationType === 'edit' && files.length === 0) return;
    if (operationType === 'generate' && !batchPrompt.trim()) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      if (operationType === 'edit') {
        files.forEach(file => formData.append('images', file));
      }
      formData.append('aiProvider', aiProvider);
      formData.append('processingMode', processingMode);
      formData.append('model', model);
      formData.append('imageSize', imageSize);
      formData.append('outputFormat', outputFormat);
      formData.append('quality', quality);
      formData.append('imageCount', '1');
      formData.append('operationType', operationType);
      formData.append('isBatchPrompt', String(isBatchPrompt));
      formData.append('applyLogo', String(applyLogo));

      if (isBatchPrompt || operationType === 'generate') {
        formData.append('batchPrompt', batchPrompt);
      } else {
        files.forEach((_, idx) => formData.append(`prompt_${idx}`, individualPrompts[idx] || ''));
      }

      const res = await axios.post(`${API_BASE}/images/edit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
      });

      setActiveBatchId(res.data.batchId);
      setShowProcessing(true);
      setProcessingFiles(files);
      setFiles([]);
      setBatchPrompt('');
      setIndividualPrompts({});
    } catch (err) {
      const msg = err.response?.data?.error || 'Submission failed. Please check network logs.';
      console.error('Submit error:', err);
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = operationType === 'generate'
    ? batchPrompt.trim().length > 0 && !isSubmitting
    : files.length > 0 && !isSubmitting;

  const selectedModel = modelsMap[model] || modelsMap['gpt-image-2'] || { sizes: [] };

  return (
    <div className="space-y-6 page-enter pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Wand2 className="w-6 h-6 text-[#0b6230] dark:text-[#3fa66e]" />
            AI Image Studio
          </h1>
          <p className="text-sm text-slate-500 mt-1">High-fidelity generative creation, inpainting transformations, and batch pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          {processingMode === 'batch' ? (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              📦 Batch API Active (50% Off)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
              ⚡ Real-Time Active
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Canvas & Upload Area */}
        <div className="lg:col-span-8 space-y-5">
          {/* Operation Mode Switcher */}
          <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 gap-1.5 shadow-xs">
            <button
              id="mode-edit"
              onClick={() => setOperationType('edit')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                operationType === 'edit'
                  ? 'text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
              style={operationType === 'edit' ? { background: BRAND.gradient } : {}}
            >
              <Wand2 className="w-4 h-4" /> Edit & Transform Image
            </button>
            <button
              id="mode-generate"
              onClick={() => setOperationType('generate')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                operationType === 'generate'
                  ? 'text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
              style={operationType === 'generate' ? { background: BRAND.gradient } : {}}
            >
              <Sparkles className="w-4 h-4" /> Generate from Text
            </button>
          </div>

          {/* Edit Mode: Upload & WordPress Import */}
          {operationType === 'edit' && (
            <>
              <div
                className="bg-white dark:bg-slate-900/60 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0b6230] dark:hover:border-[#3fa66e] rounded-2xl p-8 cursor-pointer transition-all group shadow-xs text-center"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input').click()}
              >
                <input id="file-input" type="file" className="hidden" multiple accept="image/*" onChange={handleFileChange} />
                <div className="flex flex-col items-center">
                  <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-[#0b6230]/15 transition-colors mb-3">
                    <UploadCloud className="w-8 h-8 text-slate-500 dark:text-slate-400 group-hover:text-[#0b6230] dark:group-hover:text-[#3fa66e] transition-colors" />
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-200 font-semibold">Drop image files here or click to browse</p>
                  <p className="text-xs text-slate-500 mt-1">Supports PNG, JPG, WEBP up to 50MB per file</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => onOpenWpImport && onOpenWpImport('studio')}
                  className="flex-1 py-2.5 px-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer shadow-xs"
                >
                  <CloudDownload className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  Import Media from WordPress
                </button>

                <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs gap-3">
                  <div className="text-left">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Brand Logo Watermark</span>
                    <span className="text-[10px] text-slate-500">Apply brand watermark</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setApplyLogo(!applyLogo)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${applyLogo ? 'bg-[#0b6230]' : 'bg-slate-300 dark:bg-slate-700'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${applyLogo ? 'translate-x-4.5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Active Batch Processing Panel */}
          {showProcessing && activeBatchId && (
            <ProcessingPanel
              batchId={activeBatchId}
              token={token}
              onClose={() => setShowProcessing(false)}
              originalFiles={processingFiles}
              onExportWp={onExportWp}
              onPreview={onPreview}
            />
          )}

          {/* Generate Mode: Text Prompt Box */}
          {operationType === 'generate' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-3">
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                Creative Text Prompt
              </label>
              <textarea
                id="generate-prompt"
                rows={5}
                value={batchPrompt}
                onChange={e => setBatchPrompt(e.target.value)}
                placeholder="Describe the image you want to create in vivid detail (subject, lighting, atmosphere, style, camera angle, resolution)..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors resize-none placeholder-slate-400 dark:placeholder-slate-500 shadow-inner"
              />
            </div>
          )}

          {/* Edit Mode: Selected Images list */}
          {files.length > 0 && operationType === 'edit' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                  Uploaded Images ({files.length})
                </h3>
                <div className="flex bg-slate-50 dark:bg-slate-950 rounded-xl p-0.5 border border-slate-200 dark:border-slate-800">
                  <button
                    id="prompt-batch"
                    type="button"
                    onClick={() => setIsBatchPrompt(true)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      isBatchPrompt ? 'text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    style={isBatchPrompt ? { background: BRAND.primary } : {}}
                  >
                    Batch Prompt
                  </button>
                  <button
                    id="prompt-individual"
                    type="button"
                    onClick={() => setIsBatchPrompt(false)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      !isBatchPrompt ? 'text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    style={!isBatchPrompt ? { background: BRAND.primary } : {}}
                  >
                    Individual
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex gap-3 items-start p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                  >
                    <div className="w-16 h-16 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                      <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                        <button
                          onClick={() => removeFile(idx)}
                          className="ml-2 p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      {!isBatchPrompt && (
                        <input
                          type="text"
                          id={`prompt-file-${idx}`}
                          placeholder="Describe specific edit instructions for this image…"
                          value={individualPrompts[idx] || ''}
                          onChange={e => setIndividualPrompts(prev => ({ ...prev, [idx]: e.target.value }))}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Generation Controls */}
        <div className="lg:col-span-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sticky top-20 space-y-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#0b6230] dark:text-[#3fa66e]" />
                Generation Controls
              </h3>
            </div>

            {/* AI Provider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">AI Provider</label>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('settings')}
                    className="text-[11px] text-[#3fa66e] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Manage Keys ⚙️
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                {Object.entries(providersMap).map(([key, p]) => {
                  const isConfigured = p.configured !== false;
                  const isSelected = aiProvider === key;
                  return (
                    <button
                      key={key}
                      id={`provider-${key}`}
                      type="button"
                      disabled={!isConfigured}
                      onClick={() => {
                        if (!isConfigured) return;
                        setAiProvider(key);
                        const firstModel = Object.keys(modelsMap).find(k => modelsMap[k].provider === key);
                        if (firstModel) setModel(firstModel);
                      }}
                      title={!isConfigured ? `${p.label} has no API key configured. Click 'Manage Keys' or configure in Settings.` : p.description}
                      className={`relative py-2 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-between gap-1.5 ${
                        !isConfigured
                          ? 'opacity-40 cursor-not-allowed bg-slate-100/60 dark:bg-slate-900/30 text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-slate-800'
                          : isSelected
                            ? 'text-white shadow-xs cursor-pointer'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer'
                      }`}
                      style={isSelected && isConfigured ? { background: BRAND.primary } : {}}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span>{p.icon}</span>
                        <span className="truncate">{p.label}</span>
                      </div>
                      {!isConfigured && (
                        <span className="shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300/80 dark:border-slate-700">
                          No Key
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <hr className="border-slate-200 dark:border-slate-800" />

            {/* AI Model List */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">AI Model</label>
              <div className="space-y-2">
                {Object.entries(modelsMap)
                  .filter(([_, meta]) => meta.provider === aiProvider)
                  .map(([key, meta]) => (
                    <button
                      key={key}
                      id={`model-${key}`}
                      type="button"
                      onClick={() => setModel(key)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        model === key
                          ? 'border-[#0b6230] bg-[#0b6230]/10 ring-1 ring-[#0b6230]/30'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <Cpu className={`w-4 h-4 mt-0.5 shrink-0 ${model === key ? 'text-[#0b6230] dark:text-[#3fa66e]' : 'text-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${model === key ? 'text-[#0b6230] dark:text-[#3fa66e]' : 'text-slate-800 dark:text-slate-200'}`}>{meta.label}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${meta.badgeColor || '#0b6230'}20`, color: meta.badgeColor || '#0b6230' }}>
                            {meta.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{meta.description}</p>
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            <hr className="border-slate-200 dark:border-slate-800" />

            {/* Image Size */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2" htmlFor="size-select">Target Resolution</label>
              <Select id="size-select" value={imageSize} onChange={setImageSize} options={selectedModel.sizes || []} />
            </div>

            {/* Output Format */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Output Format</label>
              <div className="grid grid-cols-4 gap-1.5">
                {OUTPUT_FORMATS.map(fmt => (
                  <button
                    key={fmt.value}
                    id={`format-${fmt.value}`}
                    type="button"
                    onClick={() => setOutputFormat(fmt.value)}
                    title={fmt.description}
                    className={`flex flex-col items-center py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                      outputFormat === fmt.value
                        ? 'border-[#0b6230] bg-[#0b6230]/15 text-[#0b6230] dark:text-[#3fa66e] ring-1 ring-[#0b6230]/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <span className="text-base">{fmt.icon}</span>
                    <span className="text-[10px] font-bold mt-0.5">{fmt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Quality Preset</label>
              <div className="flex bg-slate-50 dark:bg-slate-950 rounded-xl p-1 border border-slate-200 dark:border-slate-800 gap-1">
                {QUALITY_OPTIONS.map(q => (
                  <button
                    key={q.value}
                    id={`quality-${q.value}`}
                    type="button"
                    onClick={() => setQuality(q.value)}
                    title={q.description}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      quality === q.value ? 'text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    style={quality === q.value ? { background: BRAND.primary } : {}}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Processing Mode (Real-Time vs Batch API) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Processing Mode</label>
                {processingMode === 'batch' && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    💰 50% Off Cost
                  </span>
                )}
              </div>
              <div className="flex bg-slate-50 dark:bg-slate-950 rounded-xl p-1 border border-slate-200 dark:border-slate-800 gap-1">
                <button
                  type="button"
                  id="mode-realtime"
                  onClick={() => setProcessingMode('realtime')}
                  title="Real-Time: Immediate generation via direct provider endpoints"
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    processingMode === 'realtime'
                      ? 'text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  style={processingMode === 'realtime' ? { background: BRAND.primary } : {}}
                >
                  ⚡ Real-Time
                </button>
                <button
                  type="button"
                  id="mode-batch"
                  onClick={() => setProcessingMode('batch')}
                  title="Batch API: Asynchronous execution with 50% cost savings (OpenAI /v1/batches)"
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    processingMode === 'batch'
                      ? 'text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  style={processingMode === 'batch' ? { background: BRAND.primary } : {}}
                >
                  📦 Batch API (50% Off)
                </button>
              </div>
              {processingMode === 'batch' && (
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                  Leverages asynchronous Batch API processing for 50% token cost discount.
                </p>
              )}
            </div>

            {/* Master Prompt for Batch Edit */}
            {operationType === 'edit' && isBatchPrompt && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2" htmlFor="batch-prompt">
                  Master Prompt
                </label>
                <textarea
                  id="batch-prompt"
                  rows={3}
                  value={batchPrompt}
                  onChange={e => setBatchPrompt(e.target.value)}
                  placeholder="e.g., Transform into a high-end luxury editorial look with natural rim lighting…"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#0b6230] focus:ring-1 focus:ring-[#0b6230]/40 transition-colors resize-none shadow-inner"
                />
              </div>
            )}

            {/* Submit Button */}
            <button
              id="btn-generate-magic"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-3.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer hover:opacity-95"
              style={canSubmit ? { background: BRAND.gradient } : { background: '#94a3b8' }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Queuing Job…
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-yellow-300" /> Execute Generation
                </>
              )}
            </button>

            {operationType === 'generate' && !batchPrompt.trim() && (
              <p className="text-[10px] text-slate-500 text-center">Enter a prompt above to generate an image</p>
            )}
            {operationType === 'edit' && files.length === 0 && (
              <p className="text-[10px] text-slate-500 text-center">Upload at least one image to transform</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Frontend Configuration
 * 
 * Centralized configuration for API endpoints and environment-specific settings.
 * Uses Vite environment variables for build-time configuration.
 */

// API Base URL - can be overridden via VITE_API_BASE environment variable
// Default to '/api' for same-origin requests (proxy mode)
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Brand colors and styling
export const BRAND = {
  primary: '#0b6230',
  light: '#3fa66e',
  gradient: 'linear-gradient(135deg, #0b6230, #3fa66e)',
};

// Feature flags (can be set via environment variables)
export const FEATURES = {
  enableWordPress: import.meta.env.VITE_ENABLE_WORDPRESS !== 'false',
  enableBatchProcessing: import.meta.env.VITE_ENABLE_BATCH !== 'false',
  maxImageCount: parseInt(import.meta.env.VITE_MAX_IMAGE_COUNT || '100', 10),
  maxFileSize: parseInt(import.meta.env.VITE_MAX_FILE_SIZE || '104857600', 10), // 100MB default
};

// API endpoints
export const ENDPOINTS = {
  // Image processing
  imageEdit: `${API_BASE}/images/edit`,
  imageGenerate: `${API_BASE}/images/generate`,
  imageBatch: `${API_BASE}/images/batch`,
  imageMetadataInject: `${API_BASE}/images/metadata/inject`,
  enhancePrompt: `${API_BASE}/images/enhance-prompt`,
  
  // Video processing
  imagesToVideo: `${API_BASE}/images-to-video`,
  
  // Job management
  jobStatus: (jobId) => `${API_BASE}/jobs/${jobId}`,
  jobResult: (jobId) => `${API_BASE}/jobs/${jobId}/result`,
  
  // Settings
  settings: `${API_BASE}/settings`,
  
  // WordPress integration
  wpMedia: `${API_BASE}/wp/media`,
  wpPosts: `${API_BASE}/wp/posts`,
};

// Polling intervals (in milliseconds)
export const POLLING = {
  jobStatus: 2500, // 2.5 seconds
  maxAttempts: 120, // 5 minutes max (120 * 2.5s)
};

export default {
  API_BASE,
  BRAND,
  FEATURES,
  ENDPOINTS,
  POLLING,
};

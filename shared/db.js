"use strict";

/**
 * Shared Database Module for Media Studio
 * 
 * This module provides a centralized database initialization and connection
 * management for both API and Worker services.
 * 
 * Features:
 * - Single source of truth for schema
 * - Automatic migrations
 * - Default settings seeding
 * - WAL mode for performance
 */

const Database = require("better-sqlite3");
const path = require("path");

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, "..", "storage");
const dbPath = path.join(STORAGE_PATH, "media_studio.sqlite");

let db = null;

/**
 * Get or create database connection
 * Initializes schema, runs migrations, and seeds default settings
 * 
 * @returns {Database} SQLite database instance
 */
function getDb() {
  if (db) return db;
  
  db = new Database(dbPath);
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  
  // Initialize core tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_jobs (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      status TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      ai_provider TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model TEXT DEFAULT 'gpt-image-2',
      image_size TEXT DEFAULT '1024x1024',
      output_format TEXT DEFAULT 'png',
      quality TEXT DEFAULT 'high',
      image_count INTEGER DEFAULT 1,
      operation_type TEXT DEFAULT 'edit',
      processing_mode TEXT DEFAULT 'realtime',
      cost REAL DEFAULT 0.0,
      tokens_used INTEGER DEFAULT 0,
      result_path TEXT,
      error TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe migration: add new columns to existing tables if they don't exist
  const existingColumns = db.pragma('table_info(image_jobs)').map(c => c.name);
  const newColumns = [
    { name: 'model', def: "TEXT DEFAULT 'gpt-image-2'" },
    { name: 'image_size', def: "TEXT DEFAULT '1024x1024'" },
    { name: 'output_format', def: "TEXT DEFAULT 'png'" },
    { name: 'quality', def: "TEXT DEFAULT 'high'" },
    { name: 'image_count', def: "INTEGER DEFAULT 1" },
    { name: 'operation_type', def: "TEXT DEFAULT 'edit'" },
    { name: 'processing_mode', def: "TEXT DEFAULT 'realtime'" },
    { name: 'cost', def: "REAL DEFAULT 0.0" },
    { name: 'tokens_used', def: "INTEGER DEFAULT 0" },
  ];

  for (const col of newColumns) {
    if (!existingColumns.includes(col.name)) {
      try {
        db.exec(`ALTER TABLE image_jobs ADD COLUMN ${col.name} ${col.def}`);
      } catch (e) {
        // Column may already exist in concurrent environments; safe to ignore
      }
    }
  }

  // Seed default settings if not present
  const defaultSettings = {
    default_ai_provider: 'azure',
    default_model: 'gpt-image-2',
    default_image_size: '1920x1088',
    default_output_format: 'png',
    default_quality: 'high',
    default_prompt_template: '',
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
    custom_models: '[]',
    video_ai_provider: 'openai',
    video_whisper_model: 'base',
    video_frames_per_second: '1',
    video_max_frames: '30',
    video_cleanup_after_processing: 'true',
    vertex_video_model: 'gemini-2.5-flash',
    video_metadata_prompt_template: `You are a YouTube SEO expert. Analyze this video content and generate optimized YouTube metadata.

VIDEO TRANSCRIPT:
{transcript}

Based on the transcript and the provided video frames, generate:

1. **Title**: A compelling, click-worthy title (max 100 chars). Include primary keyword naturally.
2. **Description**: SEO-optimized description (300-500 words) with:
   - Hook in first 2 lines (shown before "Show More")
   - Key timestamps if applicable
   - Relevant keywords naturally woven in
   - Call to action
3. **Tags**: 15-25 relevant tags, mix of broad and specific
4. **Category**: Best YouTube category
5. **Thumbnail Text**: Suggested text overlay for thumbnail (max 5 words)

Respond in this exact JSON format:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", ...],
  "category": "...",
  "thumbnailText": "...",
  "hashtags": ["#tag1", "#tag2", "#tag3"]
}

Respond ONLY with valid JSON, no markdown or extra text.`,
    // WordPress integration settings
    wp_url: '',
    wp_username: '',
    wp_password: '',
  };

  const upsert = db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  for (const [key, value] of Object.entries(defaultSettings)) {
    upsert.run(key, value);
  }

  // Auto-migrate any existing credentials/configs from process.env to app_settings if not already set
  const envToSettingMap = {
    AZURE_OPENAI_ENDPOINT: "azure_endpoint",
    AZURE_OPENAI_API_KEY: "azure_api_key",
    AZURE_OPENAI_API_VERSION: "azure_api_version",
    AZURE_OPENAI_IMAGE_GENERATION_MODEL: "default_model",
    GOOGLE_VERTEX_PROJECT_ID: "vertex_project_id",
    GOOGLE_VERTEX_LOCATION: "vertex_location",
    OPENAI_API_KEY: "openai_api_key",
    OPENAI_BASE_URL: "openai_base_url",
    OPENAI_IMAGE_DEFAULT_MODEL: "openai_image_model",
    XAI_BASE_URL: "xai_base_url",
    XAI_IMAGE_DEFAULT_MODEL: "xai_image_model",
    BEDROCK_MODEL: "bedrock_model",
    AI_PROVIDER: "video_ai_provider",
    WHISPER_MODEL: "video_whisper_model",
    FRAMES_PER_SECOND: "video_frames_per_second",
    MAX_FRAMES: "video_max_frames",
    CLEANUP_AFTER_PROCESSING: "video_cleanup_after_processing",
  };

  const updateSettingStmt = db.prepare(`
    UPDATE app_settings SET value = ?, updated_at = CURRENT_TIMESTAMP
    WHERE key = ? AND (value IS NULL OR value = '')
  `);

  for (const [envKey, settingKey] of Object.entries(envToSettingMap)) {
    if (process.env[envKey] && process.env[envKey].trim() !== "") {
      updateSettingStmt.run(process.env[envKey].trim(), settingKey);
    }
  }

  return db;
}

/**
 * Close database connection (useful for testing/cleanup)
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };

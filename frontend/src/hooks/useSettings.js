import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';

export function useSettings(token) {
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
    vertex_location: '',
    vertex_sa_key: '',
    openai_api_key: '',
    openai_base_url: 'https://api.openai.com/v1',
    xai_api_key: '',
    xai_base_url: 'https://api.x.ai/v1',
    xai_image_model: 'grok-imagine-image-2.0',
    aws_access_key_id: '',
    aws_secret_access_key: '',
    aws_region: 'us-east-1',
    custom_models: '[]',
  });

  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [providers, setProviders] = useState({});
  const [models, setModels] = useState({});
  const [testResults, setTestResults] = useState({});
  const [testingProvider, setTestingProvider] = useState({});

  const fetchSettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE}/images/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(prev => ({ ...prev, ...res.data }));
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchProviders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE}/settings/providers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.providers) setProviders(res.data.providers);
      if (res.data.models) setModels(res.data.models);
    } catch (err) {
      console.error('Failed to load providers:', err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchSettings();
      fetchProviders();
    }
  }, [token, fetchSettings, fetchProviders]);

  const updateSetting = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  const saveSettings = async (customSettings) => {
    try {
      const payload = customSettings || settings;
      await axios.post(`${API_BASE}/images/settings`, payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      fetchProviders();
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      return false;
    }
  };

  const testProvider = async (providerKey) => {
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

  return {
    settings,
    setSettings,
    updateSetting,
    saveSettings,
    loading,
    saved,
    providers,
    models,
    testResults,
    testingProvider,
    testProvider,
    refreshSettings: fetchSettings,
    refreshProviders: fetchProviders
  };
}

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';

export function useJobPolling({ jobId, batchId, token, interval = 2500, enabled = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    if (!token || (!jobId && !batchId)) return;
    try {
      const endpoint = batchId
        ? `${API_BASE}/images/batch/${batchId}`
        : `${API_BASE}/images/job/${jobId}`;
      const res = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
      
      let done = false;
      if (batchId) {
        done = Array.isArray(res.data) && res.data.length > 0 && res.data.every(j => j.status === 'completed' || j.status === 'failed');
      } else {
        done = res.data?.status === 'completed' || res.data?.status === 'failed';
      }
      
      if (done) {
        setIsCompleted(true);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } catch (err) {
      setError(err);
    }
  }, [jobId, batchId, token]);

  useEffect(() => {
    if (!enabled || (!jobId && !batchId)) return;
    setLoading(true);
    poll().finally(() => setLoading(false));

    timerRef.current = setInterval(poll, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [jobId, batchId, token, interval, enabled, poll]);

  return { data, loading, error, isCompleted, refetch: poll };
}

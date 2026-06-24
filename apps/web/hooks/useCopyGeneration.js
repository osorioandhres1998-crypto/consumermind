/**
 * HOOK DE COPY STUDIO — ConsumerMind
 * ------------------------------------------------------------
 * Genera copy o ángulos creativos a partir de un análisis previo de
 * Strategy (reutiliza los sesgos ya detectados, no los recalcula).
 *
 * Uso:
 *   const { generate, loading, result, error } = useCopyGeneration();
 *   await generate({ analysisId, mode: 'copy' | 'angles' });
 */

'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export function useCopyGeneration() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const generate = useCallback(async ({ analysisId, mode = 'copy' }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/copy-studio/generate', {
        method: 'POST',
        body: JSON.stringify({ analysisId, mode }),
      });
      setResult(data); // { id, createdAt, mode, result }
      return data;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, result, error };
}

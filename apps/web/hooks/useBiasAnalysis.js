/**
 * HOOK DE FRONTEND (Next.js / React) — ConsumerMind
 * ------------------------------------------------------------
 * Reemplaza la llamada directa a la API de Claude (la del prototipo)
 * por una llamada al backend de ConsumerMind. Así la API key vive
 * solo en el servidor, el resultado queda persistido en el workspace,
 * y Copy Studio puede reutilizarlo después.
 *
 * Uso:
 *   const { analyze, loading, result, error } = useBiasAnalysis();
 *   await analyze({ product, customer, price, channel });
 */

'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';

export function useBiasAnalysis() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const analyze = useCallback(async (input) => {
    setLoading(true);
    setError(null);
    try {
      // apiFetch añade las cabeceras de tenant y normaliza errores.
      const data = await apiFetch('/api/strategy/analyze', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setResult(data.result);
      return data; // { id, createdAt, result }
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { analyze, loading, result, error };
}

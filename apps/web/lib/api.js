// Cliente HTTP hacia el backend de ConsumerMind.
// Inyecta las cabeceras de tenant (mientras no hay auth real) y normaliza
// el manejo de errores. Nunca llama a api.anthropic.com directo (CLAUDE.md).
import { DEMO_WORKSPACE_ID, DEMO_USER_ID } from './tenant';

export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-workspace-id': DEMO_WORKSPACE_ID,
      'x-user-id': DEMO_USER_ID,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let msg = 'Error en la solicitud.';
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch (_) { /* respuesta sin JSON */ }
    throw new Error(msg);
  }
  return res.json();
}

// Atajos usados por Copy Studio para reutilizar análisis de Strategy.
export const listStrategyAnalyses = () => apiFetch('/api/strategy/analyses');
export const getAnalysis = (id) => apiFetch(`/api/strategy/analyses/${id}`);

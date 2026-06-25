// Cliente HTTP del navegador. Llama a /api/... (mismo origen). El proxy
// server-side de Next adjunta el JWT del backend (ver app/api/[...path]/route.js);
// el navegador nunca ve el token ni la API key de Claude.

export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
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

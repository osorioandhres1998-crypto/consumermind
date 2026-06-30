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
  if (res.status === 204) return null; // sin cuerpo (p. ej. DELETE)
  return res.json();
}

// Atajos usados por Copy Studio para reutilizar análisis de Strategy.
export const listStrategyAnalyses = () => apiFetch('/api/strategy/analyses');
export const getAnalysis = (id) => apiFetch(`/api/strategy/analyses/${id}`);

// Proyectos: la unidad central del master-tool.
export const listProjects = () => apiFetch('/api/projects');
export const getProject = (id) => apiFetch(`/api/projects/${id}`);
export const createProject = (body) =>
  apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(body) });
export const updateProject = (id, body) =>
  apiFetch(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteProject = (id) =>
  apiFetch(`/api/projects/${id}`, { method: 'DELETE' });

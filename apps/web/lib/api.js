// Cliente HTTP del navegador. Llama a /api/... (mismo origen). El proxy
// server-side de Next adjunta el JWT del backend (ver app/api/[...path]/route.js);
// el navegador nunca ve el token ni la API key de Claude.

export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  if (!res.ok) {
    let msg = `Error en la solicitud (${res.status}).`;
    try {
      const j = await res.json();
      // Node usa { error }, FastAPI (Validator) usa { detail }.
      msg = j.error || j.detail || msg;
      if (typeof msg !== 'string') msg = JSON.stringify(msg);
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

// Snapshots de métricas mensuales (N1-A) y tendencias (N1-B).
export const saveMetricsSnapshot = (body) =>
  apiFetch('/api/metrics/snapshots', { method: 'POST', body: JSON.stringify(body) });
export const listMetricsSnapshots = (projectId) =>
  apiFetch(`/api/metrics/snapshots/${projectId}`);
export const getProjectTimeline = (projectId) =>
  apiFetch(`/api/metrics/timeline/${projectId}`);

// Copiloto IA del proyecto (N2-A).
export const askCopilot = (projectId, question) =>
  apiFetch('/api/copilot/ask', { method: 'POST', body: JSON.stringify({ projectId, question }) });

// Experimentos A/B (N2-B).
export const listExperiments = (projectId) => apiFetch(`/api/experiments/${projectId}`);
export const createExperiment = (projectId, body) =>
  apiFetch(`/api/experiments/${projectId}`, { method: 'POST', body: JSON.stringify(body) });
export const updateExperiment = (projectId, expId, body) =>
  apiFetch(`/api/experiments/${projectId}/${expId}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteExperiment = (projectId, expId) =>
  apiFetch(`/api/experiments/${projectId}/${expId}`, { method: 'DELETE' });

// Equipo, roles e invitaciones (N3-A) + marca blanca del PDF (N3-B).
export const getTeamOverview = () => apiFetch('/api/team/overview');
export const createInvitation = (role) =>
  apiFetch('/api/team/invitations', { method: 'POST', body: JSON.stringify({ role }) });
export const revokeInvitation = (id) =>
  apiFetch(`/api/team/invitations/${id}`, { method: 'DELETE' });
export const removeMember = (id) =>
  apiFetch(`/api/team/members/${id}`, { method: 'DELETE' });
export const updateBranding = (brandName, brandColor) =>
  apiFetch('/api/team/branding', { method: 'PATCH', body: JSON.stringify({ brandName, brandColor }) });

/**
 * MÓDULO LANDING ANALYZER — servicio
 * ------------------------------------------------------------
 * Orquesta: descarga (o recibe HTML pegado) → motor de reglas →
 * persiste en `analyses` con module='landing' (mismo patrón que Strategy).
 */

const { fetchLanding } = require('./fetcher');
const { analyzeHtml } = require('./engine');
const { fetchVitals } = require('./psi');

/**
 * Analiza una landing y guarda el resultado en el workspace.
 * @param {object} args
 * @param {object} args.db           client de pg del request (tenant fijado)
 * @param {string} args.workspaceId
 * @param {string} args.userId
 * @param {string|null} args.projectId
 * @param {string} args.url          URL a analizar
 * @param {string} [args.html]       HTML pegado (fallback para sitios con render JS)
 */
async function analyzeAndStore({ db, workspaceId, userId, projectId = null, url, html }) {
  let ctx = { url };
  let content = html;

  if (!content) {
    // Descarga del HTML y consulta de Core Web Vitals reales en paralelo
    // (N1-C): fetchVitals nunca lanza — si PageSpeed falla, ctx.vitals
    // queda null y el motor se degrada al proxy de peso HTML.
    const [fetched, vitals] = await Promise.all([
      fetchLanding(url), // este sí puede lanzar con .code (URL inválida, 403, etc.)
      fetchVitals(url),
    ]);
    content = fetched.html;
    ctx = { url: fetched.finalUrl, bytes: fetched.bytes, vitals };
  } else {
    ctx.pasted = true; // HTML pegado: sin URL pública, no aplica PageSpeed
  }

  const result = analyzeHtml(content, ctx);

  const { rows } = await db.query(
    `INSERT INTO analyses
       (workspace_id, created_by, project_id, module, input, result)
     VALUES ($1, $2, $3, 'landing', $4, $5)
     RETURNING id, created_at`,
    [
      workspaceId,
      userId,
      projectId,
      JSON.stringify({ url, pasted: !!html }),
      JSON.stringify(result),
    ]
  );

  return { id: rows[0].id, createdAt: rows[0].created_at, result };
}

module.exports = { analyzeAndStore };

/**
 * MÓDULO STRATEGY — ConsumerMind
 * ------------------------------------------------------------
 * Orquesta el análisis de sesgos: llama al motor compartido,
 * persiste el resultado en PostgreSQL (multi-tenant por workspace)
 * y lo deja disponible para que Copy Studio lo consuma después.
 *
 * NOTA: cada función recibe `db` = el client del request (con la
 * transacción + SET LOCAL app.workspace_id ya activos, ver
 * api/middleware/workspace.js). No usamos el pool global aquí para
 * que la RLS se aplique sobre la MISMA conexión del tenant.
 */

const { runAnalysis } = require('../../engine');

/**
 * Analiza los sesgos de un caso y lo guarda en el workspace.
 * @param {object} args
 * @param {object} args.db           client de pg del request (tenant fijado)
 * @param {string} args.workspaceId  tenant
 * @param {string} args.userId       autor del análisis
 * @param {object} args.input        { product, customer, price, channel }
 */
async function analyzeAndStore({ db, workspaceId, userId, input }) {
  const { data, usage } = await runAnalysis('bias_analysis', input);

  const { rows } = await db.query(
    `INSERT INTO analyses
       (workspace_id, created_by, module, input, result, tokens_in, tokens_cached)
     VALUES ($1, $2, 'strategy', $3, $4, $5, $6)
     RETURNING id, created_at`,
    [
      workspaceId,
      userId,
      JSON.stringify(input),
      JSON.stringify(data),
      usage?.input_tokens ?? null,
      usage?.cache_read_input_tokens ?? null,
    ]
  );

  return { id: rows[0].id, createdAt: rows[0].created_at, result: data };
}

/** Lista análisis previos del workspace (alimenta Copy Studio). */
async function listAnalyses({ db, workspaceId, limit = 20 }) {
  const { rows } = await db.query(
    `SELECT id, input, result, created_at
       FROM analyses
      WHERE workspace_id = $1 AND module = 'strategy'
      ORDER BY created_at DESC
      LIMIT $2`,
    [workspaceId, limit]
  );
  return rows;
}

/** Recupera un análisis puntual (usado por Copy Studio como entrada). */
async function getAnalysis({ db, workspaceId, analysisId }) {
  const { rows } = await db.query(
    `SELECT id, input, result FROM analyses
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, analysisId]
  );
  return rows[0] || null;
}

module.exports = { analyzeAndStore, listAnalyses, getAnalysis };

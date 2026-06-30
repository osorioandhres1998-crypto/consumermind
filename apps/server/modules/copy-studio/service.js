/**
 * MÓDULO COPY STUDIO — ConsumerMind
 * ------------------------------------------------------------
 * Consume un análisis de Strategy (los sesgos ya detectados) y
 * genera copy o ángulos creativos que activan ESOS mismos sesgos.
 * El resultado se persiste en `analyses` con module='copy_studio'
 * (decisión: los activos de copy se guardan en el historial).
 *
 * La psicología NO se recalcula: Strategy la produjo, Copy Studio
 * la reutiliza vía el registro en `analyses` (núcleo compartido).
 */

const { runAnalysis } = require('../../engine');

const MODE_TO_TASK = {
  copy: 'copy_generation',
  angles: 'creative_angles',
};

/** Carga el análisis fuente (de Strategy) dentro del tenant. */
async function loadSource({ db, workspaceId, analysisId }) {
  const { rows } = await db.query(
    `SELECT id, input, result FROM analyses
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, analysisId]
  );
  return rows[0] || null;
}

/** Carga el análisis de Strategy más reciente de un proyecto (flujo por proyecto). */
async function loadLatestStrategyForProject({ db, workspaceId, projectId }) {
  const { rows } = await db.query(
    `SELECT id, input, result FROM analyses
      WHERE workspace_id = $1 AND project_id = $2 AND module = 'strategy'
      ORDER BY created_at DESC
      LIMIT 1`,
    [workspaceId, projectId]
  );
  return rows[0] || null;
}

/**
 * Genera copy/ángulos a partir de un análisis y lo guarda.
 * @param {object} args
 * @param {object} args.db           client de pg del request (tenant fijado)
 * @param {string} args.workspaceId
 * @param {string} args.userId
 * @param {string} args.analysisId   id del análisis de Strategy a reutilizar
 * @param {'copy'|'angles'} args.mode
 */
async function generateAndStore({ db, workspaceId, userId, analysisId, projectId = null, mode = 'copy' }) {
  const taskKey = MODE_TO_TASK[mode];
  if (!taskKey) throw new Error(`Modo de Copy Studio desconocido: ${mode}`);

  // Flujo por proyecto: si no se da analysisId pero sí projectId, usa el
  // análisis de Strategy más reciente de ese proyecto.
  let source = null;
  if (analysisId) {
    source = await loadSource({ db, workspaceId, analysisId });
  } else if (projectId) {
    source = await loadLatestStrategyForProject({ db, workspaceId, projectId });
  }
  if (!source) {
    const err = new Error('Análisis de origen no encontrado.');
    err.code = 'SOURCE_NOT_FOUND';
    throw err;
  }

  // input original (product, customer, price, channel) + sesgos detectados
  const biases = source.result?.biases || [];
  const input = { ...source.input, biases };

  const { data, usage } = await runAnalysis(taskKey, input);

  const { rows } = await db.query(
    `INSERT INTO analyses
       (workspace_id, created_by, project_id, module, input, result, tokens_in, tokens_cached)
     VALUES ($1, $2, $3, 'copy_studio', $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      workspaceId,
      userId,
      projectId,
      JSON.stringify({ source_analysis_id: source.id, mode, ...source.input }),
      JSON.stringify(data),
      usage?.input_tokens ?? null,
      usage?.cache_read_input_tokens ?? null,
    ]
  );

  return { id: rows[0].id, createdAt: rows[0].created_at, mode, result: data };
}

/** Historial de activos de copy del workspace. */
async function listCopy({ db, workspaceId, limit = 20 }) {
  const { rows } = await db.query(
    `SELECT id, input, result, created_at
       FROM analyses
      WHERE workspace_id = $1 AND module = 'copy_studio'
      ORDER BY created_at DESC
      LIMIT $2`,
    [workspaceId, limit]
  );
  return rows;
}

module.exports = { generateAndStore, listCopy };

/**
 * MÓDULO METRICS SNAPSHOTS — N1-A/N1-B del plan enterprise
 * ------------------------------------------------------------
 * Guarda el agregado MENSUAL de métricas de marketing por proyecto
 * (importado de CSV de Meta/Google Ads o ingresado a mano en ProfitGuard).
 * NUNCA se guarda el CSV crudo — solo los números agregados del periodo.
 * Un snapshot por (proyecto, mes): reimportar el mismo mes lo reemplaza
 * (upsert), para poder corregir sin acumular duplicados.
 */

/** Crea o reemplaza el snapshot de un proyecto para un mes dado. */
async function upsertSnapshot({ db, workspaceId, userId, projectId, period, source, metrics }) {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    const e = new Error('El periodo debe tener formato YYYY-MM.');
    e.status = 400;
    throw e;
  }
  const { rows } = await db.query(
    `INSERT INTO metrics_snapshots (workspace_id, project_id, created_by, period, source, metrics)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (project_id, period)
     DO UPDATE SET source = EXCLUDED.source, metrics = EXCLUDED.metrics, created_by = EXCLUDED.created_by
     RETURNING id, period, source, metrics, created_at`,
    [workspaceId, projectId, userId, period, source || 'manual', JSON.stringify(metrics)]
  );
  return rows[0];
}

/** Lista los snapshots de un proyecto, ordenados por periodo (para la gráfica de tendencias). */
async function listSnapshots({ db, workspaceId, projectId }) {
  const { rows } = await db.query(
    `SELECT id, period, source, metrics, created_at
       FROM metrics_snapshots
      WHERE workspace_id = $1 AND project_id = $2
      ORDER BY period ASC`,
    [workspaceId, projectId]
  );
  return rows;
}

async function deleteSnapshot({ db, workspaceId, projectId, period }) {
  const { rowCount } = await db.query(
    `DELETE FROM metrics_snapshots WHERE workspace_id = $1 AND project_id = $2 AND period = $3`,
    [workspaceId, projectId, period]
  );
  return rowCount > 0;
}

/**
 * Línea de tiempo del proyecto (N1-B): combina snapshots de métricas
 * (MER, ROAS, CAC real) con el score de Landing Analyzer más reciente
 * de cada mes calendario, para graficar tendencias en una sola vista.
 */
async function getTimeline({ db, workspaceId, projectId }) {
  const snapshots = await listSnapshots({ db, workspaceId, projectId });

  const { rows: landingRows } = await db.query(
    `SELECT to_char(created_at, 'YYYY-MM') AS period, result, created_at
       FROM analyses
      WHERE workspace_id = $1 AND project_id = $2 AND module = 'landing'
      ORDER BY created_at ASC`,
    [workspaceId, projectId]
  );

  // Un score de landing por mes: se queda con el más reciente de ese mes.
  const landingByMonth = new Map();
  for (const row of landingRows) landingByMonth.set(row.period, row.result);

  const periods = new Set([...snapshots.map((s) => s.period), ...landingByMonth.keys()]);
  const timeline = [...periods].sort().map((period) => {
    const snap = snapshots.find((s) => s.period === period);
    const landing = landingByMonth.get(period);
    return {
      period,
      metrics: snap ? snap.metrics : null,
      landing_score: landing ? landing.score : null,
      landing_ethics_alerts: landing ? landing.ethics_alerts : null,
    };
  });

  return timeline;
}

module.exports = { upsertSnapshot, listSnapshots, deleteSnapshot, getTimeline };

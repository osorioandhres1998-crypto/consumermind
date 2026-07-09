/**
 * MÓDULO METRICS SNAPSHOTS — N1-A/N1-B del plan enterprise
 * ------------------------------------------------------------
 * Guarda el agregado MENSUAL de métricas de marketing por proyecto
 * (importado de CSV de Meta/Google Ads o ingresado a mano en ProfitGuard).
 * NUNCA se guarda el CSV crudo — solo los números agregados del periodo.
 * Un snapshot por (proyecto, mes): reimportar el mismo mes lo reemplaza
 * (upsert), para poder corregir sin acumular duplicados.
 */

const { sendEmail } = require('../../lib/email');

// Umbral de MER "en riesgo" por vertical (Bloque 3.5) — espejo servidor de
// apps/web/lib/benchmarks-verticales.js. Sin vertical: banda genérica (<3).
const MER_RIESGO = { ecommerce: 3, saas: 2.5, servicios: 2, default: 3 };

/**
 * Alerta proactiva (Bloque 3.5): al guardar el mes, si el MER cayó en zona
 * de riesgo, avisa por email al usuario. Disparo por evento (no cron) y
 * fire-and-forget: un fallo aquí NUNCA rompe el guardado del snapshot.
 */
async function maybeAlertLowMer({ db, workspaceId, userId, projectId, period, metrics }) {
  const ads = Number(metrics?.adsPeriodo) || 0;
  const fijos = Number(metrics?.fijosMarketing) || 0;
  const ingresos = Number(metrics?.ingresosPeriodo) || 0;
  const total = ads + fijos;
  if (total <= 0) return;

  const mer = ingresos / total;
  const { rows: proj } = await db.query(
    `SELECT name, vertical FROM projects WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, projectId]
  );
  if (!proj[0]) return;
  const threshold = MER_RIESGO[proj[0].vertical] || MER_RIESGO.default;
  if (mer >= threshold) return; // sano: sin alerta

  const { rows: users } = await db.query(
    `SELECT email, name FROM users WHERE id = $1 AND workspace_id = $2`,
    [userId, workspaceId]
  );
  if (!users[0]) return;

  const merTxt = mer.toFixed(2).replace('.', ',');
  await sendEmail({
    to: users[0].email,
    subject: `⚠️ MER en riesgo (${merTxt}×) — ${proj[0].name}`,
    html: `<p>Hola${users[0].name ? ` ${users[0].name}` : ''},</p>
           <p>El snapshot de <b>${period}</b> del proyecto <b>${proj[0].name}</b> quedó con un
           MER de <b>${merTxt}×</b> — por debajo de la banda sana (≥${threshold}) para su tipo de negocio.
           Por cada peso invertido en marketing (pauta + fijos) estás recuperando ${merTxt}.</p>
           <p>Sugerencia: antes de subir presupuesto, revisa el CAC y la conversión de la landing.
           Pregúntale al copiloto del proyecto "¿por qué mi MER está en riesgo?" para un diagnóstico con tus números.</p>`,
    textFallbackLog: `ALERTA MER ${merTxt}x (<${threshold}) en "${proj[0].name}" ${period} → ${users[0].email}`,
  });
}

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

  // Alerta proactiva: no bloquea ni rompe el guardado si algo falla.
  try {
    await maybeAlertLowMer({ db, workspaceId, userId, projectId, period, metrics });
  } catch (err) {
    console.error('[metrics/alerta-mer]', err.message);
  }

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

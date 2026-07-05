/**
 * MÓDULO EXPERIMENTOS A/B — N2-B del plan enterprise
 * ------------------------------------------------------------
 * Registro: hipótesis → variante A/B → resultados → significancia
 * estadística determinista (lib/significance.js). Cierra el ciclo
 * decidir (Copy Studio genera variantes) → probar → medir.
 */

const { twoProportionZTest, samplesNeeded } = require('../../lib/significance');

async function createExperiment({ db, workspaceId, userId, projectId, input }) {
  const { hypothesis, metricName, variantALabel, variantBLabel } = input;
  if (!hypothesis || !hypothesis.trim()) {
    const e = new Error('Se requiere la hipótesis del experimento.');
    e.status = 400;
    throw e;
  }
  const { rows } = await db.query(
    `INSERT INTO experiments
       (workspace_id, project_id, created_by, hypothesis, metric_name, variant_a_label, variant_b_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [workspaceId, projectId, userId, hypothesis.trim(),
     metricName || 'conversión', variantALabel || 'Control (A)', variantBLabel || 'Variante (B)']
  );
  return withStats(rows[0]);
}

async function listExperiments({ db, workspaceId, projectId }) {
  const { rows } = await db.query(
    `SELECT * FROM experiments WHERE workspace_id = $1 AND project_id = $2 ORDER BY created_at DESC`,
    [workspaceId, projectId]
  );
  return rows.map(withStats);
}

async function updateResults({ db, workspaceId, experimentId, input }) {
  const { visitorsA, conversionsA, visitorsB, conversionsB, status } = input;
  const { rows } = await db.query(
    `UPDATE experiments
        SET visitors_a = COALESCE($3, visitors_a), conversions_a = COALESCE($4, conversions_a),
            visitors_b = COALESCE($5, visitors_b), conversions_b = COALESCE($6, conversions_b),
            status = COALESCE($7, status), updated_at = now()
      WHERE workspace_id = $1 AND id = $2
      RETURNING *`,
    [workspaceId, experimentId, visitorsA, conversionsA, visitorsB, conversionsB, status]
  );
  return rows[0] ? withStats(rows[0]) : null;
}

async function deleteExperiment({ db, workspaceId, experimentId }) {
  const { rowCount } = await db.query(
    `DELETE FROM experiments WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, experimentId]
  );
  return rowCount > 0;
}

/** Adjunta el resultado del test z + muestras necesarias a la fila cruda. */
function withStats(row) {
  const stats = twoProportionZTest(row.visitors_a, row.conversions_a, row.visitors_b, row.conversions_b);
  const rateA = row.visitors_a > 0 ? row.conversions_a / row.visitors_a : null;
  const needed = rateA > 0 && rateA < 1 ? samplesNeeded(rateA, 0.10) : null; // detectar +10% de uplift
  return { ...row, stats, samples_needed_10pct: needed };
}

module.exports = { createExperiment, listExperiments, updateResults, deleteExperiment };

/**
 * RUTAS DE EXPERIMENTOS A/B — N2-B
 * ------------------------------------------------------------
 * POST   /api/experiments/:projectId          → crear experimento
 * GET    /api/experiments/:projectId          → listar (con stats calculados)
 * PATCH  /api/experiments/:projectId/:expId    → actualizar visitantes/conversiones
 * DELETE /api/experiments/:projectId/:expId
 */

const express = require('express');
const router = express.Router();
const experiments = require('../../modules/experiments/service');
const { validateBody } = require('../../lib/validate');

// Bloque 1.5: esquemas de creación y actualización de resultados.
const createSchema = {
  hypothesis: { type: 'string', required: true, max: 500 },
  metricName: { type: 'string', max: 100 },
  variantALabel: { type: 'string', max: 100 },
  variantBLabel: { type: 'string', max: 100 },
};
const resultsSchema = {
  visitorsA: { type: 'integer', min: 0, max: 1e9 },
  conversionsA: { type: 'integer', min: 0, max: 1e9 },
  visitorsB: { type: 'integer', min: 0, max: 1e9 },
  conversionsB: { type: 'integer', min: 0, max: 1e9 },
  status: { type: 'string', enum: ['running', 'concluded'] },
};

router.post('/:projectId', validateBody(createSchema), async (req, res) => {
  try {
    const row = await experiments.createExperiment({
      db: req.db, workspaceId: req.workspaceId, userId: req.userId,
      projectId: req.params.projectId, input: req.body,
    });
    res.status(201).json(row);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[experiments/create]', err.message);
    res.status(500).json({ error: 'No se pudo crear el experimento.' });
  }
});

router.get('/:projectId', async (req, res) => {
  try {
    const rows = await experiments.listExperiments({ db: req.db, workspaceId: req.workspaceId, projectId: req.params.projectId });
    res.json(rows);
  } catch (err) {
    console.error('[experiments/list]', err.message);
    res.status(500).json({ error: 'No se pudo listar los experimentos.' });
  }
});

router.patch('/:projectId/:expId', validateBody(resultsSchema), async (req, res) => {
  try {
    const row = await experiments.updateResults({
      db: req.db, workspaceId: req.workspaceId, experimentId: req.params.expId, input: req.body,
    });
    if (!row) return res.status(404).json({ error: 'Experimento no encontrado.' });
    res.json(row);
  } catch (err) {
    console.error('[experiments/update]', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el experimento.' });
  }
});

router.delete('/:projectId/:expId', async (req, res) => {
  try {
    const ok = await experiments.deleteExperiment({ db: req.db, workspaceId: req.workspaceId, experimentId: req.params.expId });
    if (!ok) return res.status(404).json({ error: 'Experimento no encontrado.' });
    res.status(204).end();
  } catch (err) {
    console.error('[experiments/delete]', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el experimento.' });
  }
});

module.exports = router;

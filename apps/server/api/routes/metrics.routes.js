/**
 * RUTAS DE METRICS SNAPSHOTS — N1-A/N1-B
 * ------------------------------------------------------------
 * POST   /api/metrics/snapshots              → guarda/reemplaza el snapshot de un mes
 * GET    /api/metrics/snapshots/:projectId   → historial de snapshots del proyecto
 * DELETE /api/metrics/snapshots/:projectId/:period
 * GET    /api/metrics/timeline/:projectId    → snapshots + score de landing por mes
 *
 * Asume `requireWorkspace` (req.db, req.workspaceId, req.userId).
 */

const express = require('express');
const router = express.Router();
const metrics = require('../../modules/metrics/service');

router.post('/snapshots', async (req, res) => {
  try {
    const { projectId, period, source, metrics: data } = req.body;
    if (!projectId || !period || !data) {
      return res.status(400).json({ error: 'Se requieren "projectId", "period" y "metrics".' });
    }
    const row = await metrics.upsertSnapshot({
      db: req.db, workspaceId: req.workspaceId, userId: req.userId,
      projectId, period, source, metrics: data,
    });
    res.json(row);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[metrics/snapshots:post]', err.message);
    res.status(500).json({ error: 'No se pudo guardar el snapshot.' });
  }
});

router.get('/snapshots/:projectId', async (req, res) => {
  try {
    const rows = await metrics.listSnapshots({ db: req.db, workspaceId: req.workspaceId, projectId: req.params.projectId });
    res.json(rows);
  } catch (err) {
    console.error('[metrics/snapshots:get]', err.message);
    res.status(500).json({ error: 'No se pudo listar los snapshots.' });
  }
});

router.delete('/snapshots/:projectId/:period', async (req, res) => {
  try {
    const ok = await metrics.deleteSnapshot({
      db: req.db, workspaceId: req.workspaceId,
      projectId: req.params.projectId, period: req.params.period,
    });
    if (!ok) return res.status(404).json({ error: 'Snapshot no encontrado.' });
    res.status(204).end();
  } catch (err) {
    console.error('[metrics/snapshots:delete]', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el snapshot.' });
  }
});

router.get('/timeline/:projectId', async (req, res) => {
  try {
    const timeline = await metrics.getTimeline({ db: req.db, workspaceId: req.workspaceId, projectId: req.params.projectId });
    res.json(timeline);
  } catch (err) {
    console.error('[metrics/timeline]', err.message);
    res.status(500).json({ error: 'No se pudo obtener la línea de tiempo.' });
  }
});

module.exports = router;

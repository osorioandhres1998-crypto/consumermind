/**
 * RUTAS DEL MÓDULO COPY STUDIO — ConsumerMind
 * ------------------------------------------------------------
 * POST /api/copy-studio/generate  → genera copy/ángulos desde un análisis
 * GET  /api/copy-studio/assets     → historial de activos del workspace
 *
 * Asume el middleware previo `requireWorkspace` (req.workspaceId,
 * req.userId, req.db con el tenant fijado).
 */

const express = require('express');
const router = express.Router();
const copyStudio = require('../../modules/copy-studio/service');

router.post('/generate', async (req, res) => {
  try {
    const { analysisId, projectId, mode } = req.body;

    if (!analysisId && !projectId) {
      return res.status(400).json({ error: 'Se requiere "analysisId" o "projectId".' });
    }
    if (mode && !['copy', 'angles'].includes(mode)) {
      return res.status(400).json({ error: 'mode debe ser "copy" o "angles".' });
    }

    const result = await copyStudio.generateAndStore({
      db: req.db,
      workspaceId: req.workspaceId,
      userId: req.userId,
      analysisId,
      projectId: projectId || null,
      mode: mode || 'copy',
    });

    res.json(result);
  } catch (err) {
    if (err.code === 'SOURCE_NOT_FOUND') {
      return res.status(404).json({ error: 'El análisis de origen no existe en este workspace.' });
    }
    console.error('[copy-studio/generate]', err.message);
    res.status(502).json({ error: 'El motor no pudo generar el copy.' });
  }
});

router.get('/assets', async (req, res) => {
  try {
    const rows = await copyStudio.listCopy({ db: req.db, workspaceId: req.workspaceId });
    res.json(rows);
  } catch (err) {
    console.error('[copy-studio/assets]', err.message);
    res.status(500).json({ error: 'No se pudo listar los activos.' });
  }
});

module.exports = router;

/**
 * RUTAS DEL MÓDULO STRATEGY — ConsumerMind
 * ------------------------------------------------------------
 * POST /api/strategy/analyze     → corre el motor y guarda
 * GET  /api/strategy/analyses    → historial del workspace
 * GET  /api/strategy/analyses/:id→ un análisis (entrada de Copy Studio)
 *
 * Asume el middleware previo `requireWorkspace`, que coloca
 * req.workspaceId, req.userId y req.db (client de pg con el tenant
 * fijado por la transacción) desde la sesión/JWT.
 */

const express = require('express');
const router = express.Router();
const strategy = require('../../modules/strategy/service');

router.post('/analyze', async (req, res) => {
  try {
    const { product, customer, price, channel } = req.body;

    if (!product || !customer) {
      return res.status(400).json({
        error: 'Se requieren al menos "product" y "customer".',
      });
    }

    const result = await strategy.analyzeAndStore({
      db: req.db,
      workspaceId: req.workspaceId,
      userId: req.userId,
      input: { product, customer, price, channel },
    });

    res.json(result);
  } catch (err) {
    console.error('[strategy/analyze]', err.message);
    res.status(502).json({ error: 'El motor no pudo completar el análisis.' });
  }
});

router.get('/analyses', async (req, res) => {
  try {
    const rows = await strategy.listAnalyses({ db: req.db, workspaceId: req.workspaceId });
    res.json(rows);
  } catch (err) {
    console.error('[strategy/analyses]', err.message);
    res.status(500).json({ error: 'No se pudo listar el historial.' });
  }
});

router.get('/analyses/:id', async (req, res) => {
  try {
    const row = await strategy.getAnalysis({
      db: req.db,
      workspaceId: req.workspaceId,
      analysisId: req.params.id,
    });
    if (!row) return res.status(404).json({ error: 'No encontrado.' });
    res.json(row);
  } catch (err) {
    console.error('[strategy/analyses/:id]', err.message);
    res.status(500).json({ error: 'No se pudo obtener el análisis.' });
  }
});

module.exports = router;

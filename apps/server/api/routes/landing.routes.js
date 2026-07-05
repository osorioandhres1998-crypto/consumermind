/**
 * RUTAS DEL LANDING ANALYZER — master-tool
 * ------------------------------------------------------------
 * POST /api/landing/analyze  → { url, html?, projectId? }
 *
 * Asume el middleware previo `requireWorkspace` (req.db, req.workspaceId,
 * req.userId). El motor es determinista: sin IA, sin costos por análisis.
 */

const express = require('express');
const router = express.Router();
const landing = require('../../modules/landing/service');

router.post('/analyze', async (req, res) => {
  try {
    const { url, html, projectId } = req.body;
    if (!url || !String(url).trim()) {
      return res.status(400).json({ error: 'Se requiere "url".' });
    }
    if (html && String(html).length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'El HTML pegado supera 5 MB.' });
    }

    const result = await landing.analyzeAndStore({
      db: req.db,
      workspaceId: req.workspaceId,
      userId: req.userId,
      projectId: projectId || null,
      url: String(url).trim(),
      html: html || undefined,
    });

    res.json(result);
  } catch (err) {
    // Errores de descarga: mensaje accionable para que la UI ofrezca el fallback.
    if (err.code === 'BAD_URL') return res.status(400).json({ error: err.message });
    if (err.code && (err.code.startsWith('HTTP_') || ['FETCH_FAILED', 'TOO_BIG'].includes(err.code))) {
      return res.status(422).json({ error: err.message, fetch_error: true });
    }
    console.error('[landing/analyze]', err.message);
    res.status(500).json({ error: 'No se pudo completar el análisis.' });
  }
});

module.exports = router;

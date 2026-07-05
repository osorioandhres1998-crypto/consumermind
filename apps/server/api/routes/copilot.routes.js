/**
 * RUTA DEL COPILOTO IA — N2-A
 * ------------------------------------------------------------
 * POST /api/copilot/ask { projectId, question }
 * Rate-limit simple por workspace (mitigación: cuota gratuita de Groq).
 */

const express = require('express');
const router = express.Router();
const copilot = require('../../modules/copilot/service');

const RATE_LIMIT = 15; // preguntas por minuto por workspace
const WINDOW_MS = 60 * 1000;
const hits = new Map(); // workspaceId -> timestamps[]

function rateLimited(workspaceId) {
  const now = Date.now();
  const arr = (hits.get(workspaceId) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(workspaceId, arr);
  return arr.length > RATE_LIMIT;
}

router.post('/ask', async (req, res) => {
  try {
    const { projectId, question } = req.body;
    if (!projectId || !question || !String(question).trim()) {
      return res.status(400).json({ error: 'Se requieren "projectId" y "question".' });
    }
    if (rateLimited(req.workspaceId)) {
      return res.status(429).json({ error: 'Demasiadas preguntas seguidas. Espera un minuto e intenta de nuevo.' });
    }

    const data = await copilot.ask({
      db: req.db, workspaceId: req.workspaceId, projectId, question: String(question).trim(),
    });
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[copilot/ask]', err.message);
    res.status(502).json({ error: 'El copiloto no pudo responder en este momento.' });
  }
});

module.exports = router;

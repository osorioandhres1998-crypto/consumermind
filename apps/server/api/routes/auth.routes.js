/**
 * RUTAS DE AUTENTICACIÓN — ConsumerMind
 * ------------------------------------------------------------
 * POST /api/auth/register → crea workspace + Owner, devuelve { token, user }
 * POST /api/auth/login    → valida credenciales, devuelve { token, user }
 *
 * Son rutas PRE-tenant: NO pasan por requireWorkspace. Las llama el
 * frontend Next.js desde el servidor (NextAuth authorize / route handler).
 */

const express = require('express');
const router = express.Router();
const auth = require('../../modules/auth/service');

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, workspaceName, inviteToken } = req.body;
    const result = await auth.register({ email, password, name, workspaceName, inviteToken });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error en el registro.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await auth.login({ email, password });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error en el login.' });
  }
});

// Recuperación de contraseña (pre-tenant, sin JWT).
router.post('/forgot-password', async (req, res) => {
  try {
    const result = await auth.requestPasswordReset({ email: req.body.email });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo procesar la solicitud.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const result = await auth.resetPassword({ token, password });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo restablecer la contraseña.' });
  }
});

module.exports = router;

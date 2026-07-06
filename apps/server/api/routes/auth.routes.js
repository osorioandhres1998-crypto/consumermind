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
const { rateLimit } = require('../middleware/rate-limit');

// Bloque 1.2: límites por minuto contra fuerza bruta (clave = IP + email).
const loginLimit = rateLimit(10, 'login');
const registerLimit = rateLimit(5, 'register');
const forgotLimit = rateLimit(5, 'forgot-password');
const resetLimit = rateLimit(10, 'reset-password');

router.post('/register', registerLimit, async (req, res) => {
  try {
    const { email, password, name, workspaceName, inviteToken } = req.body;
    const result = await auth.register({ email, password, name, workspaceName, inviteToken });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error en el registro.' });
  }
});

router.post('/login', loginLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await auth.login({ email, password });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error en el login.' });
  }
});

// Recuperación de contraseña (pre-tenant, sin JWT).
router.post('/forgot-password', forgotLimit, async (req, res) => {
  try {
    const result = await auth.requestPasswordReset({ email: req.body.email });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo procesar la solicitud.' });
  }
});

router.post('/reset-password', resetLimit, async (req, res) => {
  try {
    const { token, password } = req.body;
    const result = await auth.resetPassword({ token, password });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo restablecer la contraseña.' });
  }
});

module.exports = router;

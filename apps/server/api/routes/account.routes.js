/**
 * RUTAS DE CUENTA — cambio de contraseña estando logueado.
 * Montada con requireWorkspace (necesita JWT válido).
 */

const express = require('express');
const router = express.Router();
const auth = require('../../modules/auth/service');

router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await auth.changePassword({ userId: req.userId, currentPassword, newPassword });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo cambiar la contraseña.' });
  }
});

module.exports = router;

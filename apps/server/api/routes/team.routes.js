/**
 * RUTAS DE EQUIPO — N3-A/N3-B
 * ------------------------------------------------------------
 * GET    /api/team/overview          → workspace + miembros + invitaciones + mi rol
 * POST   /api/team/invitations       → (owner) crear invitación por enlace
 * DELETE /api/team/invitations/:id   → (owner) revocar invitación
 * DELETE /api/team/members/:id       → (owner) quitar miembro
 * PATCH  /api/team/branding          → (owner) marca blanca del PDF
 */

const express = require('express');
const router = express.Router();
const team = require('../../modules/team/service');
const { requireOwner } = require('../middleware/workspace');

router.get('/overview', async (req, res) => {
  try {
    const data = await team.overview({ db: req.db, workspaceId: req.workspaceId, userId: req.userId });
    res.json(data);
  } catch (err) {
    console.error('[team/overview]', err.message);
    res.status(500).json({ error: 'No se pudo cargar el equipo.' });
  }
});

router.post('/invitations', requireOwner, async (req, res) => {
  try {
    const inv = await team.createInvitation({
      db: req.db, workspaceId: req.workspaceId, userId: req.userId, role: req.body.role || 'editor',
    });
    res.status(201).json(inv);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[team/invitations:post]', err.message);
    res.status(500).json({ error: 'No se pudo crear la invitación.' });
  }
});

router.delete('/invitations/:id', requireOwner, async (req, res) => {
  try {
    const ok = await team.revokeInvitation({ db: req.db, workspaceId: req.workspaceId, invitationId: req.params.id });
    if (!ok) return res.status(404).json({ error: 'Invitación no encontrada.' });
    res.status(204).end();
  } catch (err) {
    console.error('[team/invitations:delete]', err.message);
    res.status(500).json({ error: 'No se pudo revocar la invitación.' });
  }
});

router.delete('/members/:id', requireOwner, async (req, res) => {
  try {
    const ok = await team.removeMember({
      db: req.db, workspaceId: req.workspaceId, userId: req.userId, memberId: req.params.id,
    });
    if (!ok) return res.status(404).json({ error: 'Miembro no encontrado (o es Owner).' });
    res.status(204).end();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[team/members:delete]', err.message);
    res.status(500).json({ error: 'No se pudo quitar al miembro.' });
  }
});

router.patch('/branding', requireOwner, async (req, res) => {
  try {
    const ws = await team.updateBranding({
      db: req.db, workspaceId: req.workspaceId,
      brandName: req.body.brandName, brandColor: req.body.brandColor,
    });
    res.json(ws);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[team/branding]', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la marca.' });
  }
});

module.exports = router;

/**
 * RUTAS DEL MÓDULO PROJECTS — master-tool
 * ------------------------------------------------------------
 * POST   /api/projects        → crea un proyecto
 * GET    /api/projects        → lista proyectos del workspace (dashboard)
 * GET    /api/projects/:id     → proyecto + historial (análisis + simulaciones)
 * PATCH  /api/projects/:id     → edita datos del proyecto
 * DELETE /api/projects/:id     → elimina (cascada)
 *
 * Asume el middleware previo `requireWorkspace` (req.db, req.workspaceId,
 * req.userId con el tenant fijado por la transacción).
 */

const express = require('express');
const router = express.Router();
const projects = require('../../modules/projects/service');
const { validateBody } = require('../../lib/validate');

// Bloque 1.5: esquema declarativo de los campos del proyecto.
const projectSchema = {
  name: { type: 'string', max: 200 },
  product: { type: 'string', max: 2000 },
  customer: { type: 'string', max: 2000 },
  price: { type: 'string', max: 200 },
  channel: { type: 'string', max: 200 },
  landing_url: { type: 'string', max: 500 },
  vertical: { type: 'string', enum: ['ecommerce', 'saas', 'servicios'] },
};

router.post('/', validateBody({ ...projectSchema, name: { ...projectSchema.name, required: true } }), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name.trim()) {
      return res.status(400).json({ error: 'Se requiere "name".' });
    }
    const row = await projects.createProject({
      db: req.db,
      workspaceId: req.workspaceId,
      userId: req.userId,
      input: req.body,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('[projects/create]', err.message);
    res.status(500).json({ error: 'No se pudo crear el proyecto.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await projects.listProjects({ db: req.db, workspaceId: req.workspaceId });
    res.json(rows);
  } catch (err) {
    console.error('[projects/list]', err.message);
    res.status(500).json({ error: 'No se pudo listar los proyectos.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await projects.getProject({
      db: req.db,
      workspaceId: req.workspaceId,
      projectId: req.params.id,
    });
    if (!row) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    res.json(row);
  } catch (err) {
    console.error('[projects/get]', err.message);
    // Columna/tabla inexistente = casi siempre esquema desincronizado (falta migrar).
    if (err.code === '42703' || err.code === '42P01') {
      return res.status(500).json({ error: 'La base de datos no está actualizada (falta migrar el esquema). Corre `npm run db:migrate`.' });
    }
    res.status(500).json({ error: 'No se pudo obtener el proyecto.' });
  }
});

router.patch('/:id', validateBody(projectSchema), async (req, res) => {
  try {
    const row = await projects.updateProject({
      db: req.db,
      workspaceId: req.workspaceId,
      projectId: req.params.id,
      input: req.body,
    });
    if (!row) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    res.json(row);
  } catch (err) {
    console.error('[projects/update]', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el proyecto.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await projects.deleteProject({
      db: req.db,
      workspaceId: req.workspaceId,
      projectId: req.params.id,
    });
    if (!ok) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    res.status(204).end();
  } catch (err) {
    console.error('[projects/delete]', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el proyecto.' });
  }
});

module.exports = router;

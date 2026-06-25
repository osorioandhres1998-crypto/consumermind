/**
 * SERVIDOR EXPRESS — ConsumerMind (backend)
 * ------------------------------------------------------------
 * Única capa que conoce la ANTHROPIC_API_KEY y las credenciales de
 * la base de datos (regla inviolable de CLAUDE.md). El frontend solo
 * habla con /api/...; jamás con api.anthropic.com directo.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { requireWorkspace } = require('./api/middleware/workspace');
const authRoutes = require('./api/routes/auth.routes');
const strategyRoutes = require('./api/routes/strategy.routes');
const copyStudioRoutes = require('./api/routes/copy-studio.routes');

const app = express();

// CORS: el front Next.js (3000) llama a este backend (3001). En la demo
// permitimos la cabecera de tenant mientras no haya auth real.
app.use(cors({
  origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-workspace-id', 'x-user-id'],
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, service: 'consumermind-api' }));

// Auth: rutas PRE-tenant (no pasan por requireWorkspace).
app.use('/api/auth', authRoutes);

// Montaje de los módulos. requireWorkspace verifica el JWT y fija el tenant (RLS) por request.
app.use('/api/strategy', requireWorkspace, strategyRoutes);
app.use('/api/copy-studio', requireWorkspace, copyStudioRoutes);

// 404 y manejador de errores
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ConsumerMind API escuchando en http://localhost:${PORT}`);
});

module.exports = app;

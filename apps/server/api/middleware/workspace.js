/**
 * MIDDLEWARE DE WORKSPACE (TENANT) — ConsumerMind
 * ------------------------------------------------------------
 * Resuelve el tenant desde el JWT/sesión y lo fija en la conexión
 * para que la Row Level Security de PostgreSQL aísle los datos.
 *
 * CORRECCIÓN sobre el prototipo: el original hacía
 *   set_config('app.workspace_id', $1, false)  // nivel sesión
 * sobre el POOL y luego next(). Con pg.Pool eso es inseguro:
 *   (a) la query real del módulo puede ejecutarse en OTRA conexión
 *       del pool → la RLS no se aplicaría, y
 *   (b) el valor a nivel de sesión PERSISTE en esa conexión y se
 *       filtra a la siguiente request que la reutilice.
 * Solución: sacar UN client del pool por request, abrir transacción
 * y usar SET LOCAL (vive solo dentro de la transacción). Todas las
 * queries del request usan ESE client (req.db) y al terminar se hace
 * COMMIT/ROLLBACK y se libera. Sin fugas y con RLS efectiva.
 */

const pool = require('../../db/pool');

async function requireWorkspace(req, res, next) {
  // En producción: extraer de req.user (JWT verificado por tu auth).
  const workspaceId = req.user?.workspaceId || req.header('x-workspace-id');
  const userId = req.user?.id || req.header('x-user-id');

  if (!workspaceId) {
    return res.status(401).json({ error: 'Workspace no identificado.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // SET LOCAL → válido solo dentro de esta transacción/este client.
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
  } catch (err) {
    if (client) client.release();
    return res.status(503).json({ error: 'Base de datos no disponible.' });
  }

  req.workspaceId = workspaceId;
  req.userId = userId;
  req.db = client; // los módulos deben usar ESTE client (no el pool global)

  // Cierra la transacción según el resultado del request y libera el client.
  let settled = false;
  const finish = async () => {
    if (settled) return;
    settled = true;
    try {
      if (res.statusCode >= 400) await client.query('ROLLBACK');
      else await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
    } finally {
      client.release();
    }
  };

  res.on('finish', finish); // respuesta enviada con éxito
  res.on('close', finish);  // conexión cerrada antes de terminar

  next();
}

module.exports = { requireWorkspace };

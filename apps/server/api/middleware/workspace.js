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
const { verifyToken } = require('../../modules/auth/service');

async function requireWorkspace(req, res, next) {
  // Auth real: el tenant se deriva de un JWT firmado por el backend (emitido en
  // /api/auth/login). Ya NO se confía en cabeceras x-workspace-id del cliente.
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  let claims;
  try {
    claims = verifyToken(token);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }

  const workspaceId = claims.workspaceId;
  const userId = claims.sub;
  if (!workspaceId) {
    return res.status(401).json({ error: 'Workspace no identificado en el token.' });
  }

  let client;
  let dbRole;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // SET LOCAL → válido solo dentro de esta transacción/este client.
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);

    // Revocación real (Bloque 1.1): el JWT dura días, así que NO basta con
    // confiar en sus claims. Verificamos en cada request que el usuario siga
    // perteneciendo al workspace y tomamos su rol FRESCO de la DB — quitar a
    // un miembro (o bajarle el rol) surte efecto inmediato, no al expirar
    // el token. `users` no tiene RLS, la query filtra explícitamente.
    const { rows } = await client.query(
      'SELECT role FROM users WHERE id = $1 AND workspace_id = $2',
      [userId, workspaceId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(401).json({ error: 'Tu acceso a este workspace fue revocado. Vuelve a iniciar sesión.' });
    }
    dbRole = rows[0].role;
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
      client.release();
    }
    return res.status(503).json({ error: 'Base de datos no disponible.' });
  }

  req.workspaceId = workspaceId;
  req.userId = userId;
  req.userRole = dbRole; // rol vigente en DB, no el del token (puede estar desactualizado)
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

/**
 * N3-A: los `viewer` solo leen. Bloquea métodos de escritura para ese rol
 * (se monta después de requireWorkspace en los routers de módulos).
 */
function blockViewerWrites(req, res, next) {
  if (req.userRole === 'viewer' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(403).json({ error: 'Tu rol (viewer) es de solo lectura en este workspace.' });
  }
  next();
}

/** N3-A: solo el Owner puede administrar el equipo y la marca. */
function requireOwner(req, res, next) {
  if (req.userRole !== 'owner') {
    return res.status(403).json({ error: 'Solo el Owner del workspace puede hacer esto.' });
  }
  next();
}

module.exports = { requireWorkspace, blockViewerWrites, requireOwner };

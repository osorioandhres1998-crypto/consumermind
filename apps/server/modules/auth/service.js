/**
 * MÓDULO AUTH — ConsumerMind
 * ------------------------------------------------------------
 * Registro y login con email + contraseña (bcrypt). Emite un JWT
 * firmado (HS256) que el resto de la API verifica para derivar el
 * tenant (ver api/middleware/workspace.js). Estas operaciones son
 * PRE-tenant, así que usan el pool global (las tablas workspaces y
 * users no tienen RLS).
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');

const JWT_SECRET = process.env.BACKEND_JWT_SECRET;
const JWT_TTL = process.env.BACKEND_JWT_TTL || '7d';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, workspaceId: user.workspace_id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // lanza si inválido/expirado
}

function publicUser(u) {
  return { id: u.id, workspaceId: u.workspace_id, email: u.email, name: u.name, role: u.role };
}

/**
 * Registro. Dos caminos:
 *  - Sin invitación: crea un workspace nuevo y su usuario Owner (como siempre).
 *  - Con inviteToken (N3-A): valida la invitación y une al usuario al
 *    workspace existente con el rol de la invitación (editor | viewer).
 * @returns {object} { token, user }
 */
async function register({ email, password, name, workspaceName, inviteToken }) {
  if (!email || !password) throw httpError(400, 'Email y contraseña son obligatorios.');
  if (String(password).length < 8) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres.');

  const normEmail = String(email).trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query('SELECT 1 FROM users WHERE email = $1', [normEmail]);
    if (exists.rowCount > 0) throw httpError(409, 'Ese email ya está registrado.');

    let workspaceId;
    let role = 'owner';
    let invitationId = null;

    if (inviteToken) {
      const inv = await client.query(
        `SELECT id, workspace_id, role FROM invitations
          WHERE token = $1 AND used_by IS NULL AND expires_at > now()
          FOR UPDATE`,
        [inviteToken]
      );
      if (inv.rowCount === 0) throw httpError(400, 'La invitación no es válida o ya expiró. Pide un enlace nuevo.');
      workspaceId = inv.rows[0].workspace_id;
      role = inv.rows[0].role;
      invitationId = inv.rows[0].id;
    } else {
      const ws = await client.query(
        `INSERT INTO workspaces (name, plan) VALUES ($1, 'free') RETURNING id`,
        [workspaceName?.trim() || `Workspace de ${name?.trim() || normEmail}`]
      );
      workspaceId = ws.rows[0].id;
    }

    const hash = await bcrypt.hash(String(password), 10);
    const u = await client.query(
      `INSERT INTO users (workspace_id, email, name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, workspace_id, email, name, role`,
      [workspaceId, normEmail, name?.trim() || null, hash, role]
    );

    if (invitationId) {
      await client.query(
        `UPDATE invitations SET used_by = $2, used_at = now() WHERE id = $1`,
        [invitationId, u.rows[0].id]
      );
    }

    await client.query('COMMIT');
    const user = u.rows[0];
    return { token: signToken(user), user: publicUser(user) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Login: valida credenciales y devuelve token + usuario. */
async function login({ email, password }) {
  if (!email || !password) throw httpError(400, 'Email y contraseña son obligatorios.');
  const normEmail = String(email).trim().toLowerCase();

  const { rows } = await pool.query(
    `SELECT id, workspace_id, email, name, password_hash, role FROM users WHERE email = $1`,
    [normEmail]
  );
  const user = rows[0];
  if (!user || !user.password_hash) throw httpError(401, 'Credenciales inválidas.');

  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) throw httpError(401, 'Credenciales inválidas.');

  return { token: signToken(user), user: publicUser(user) };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = { register, login, signToken, verifyToken };

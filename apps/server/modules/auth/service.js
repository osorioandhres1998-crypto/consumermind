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
const crypto = require('crypto');
const pool = require('../../db/pool');
const { sendEmail } = require('../../lib/email');

const RESET_TTL_HOURS = 1;
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:3000';

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

  await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  return { token: signToken(user), user: publicUser(user) };
}

/**
 * Solicita un reseteo de contraseña. SIEMPRE responde éxito genérico
 * (no revela si el email existe, evita enumeración de cuentas). Si el
 * email sí existe, genera un token de 1h y lo envía por Resend; sin
 * RESEND_API_KEY, el link queda en los logs del servidor (degradación).
 */
async function requestPasswordReset({ email }) {
  const normEmail = String(email || '').trim().toLowerCase();
  if (!normEmail) throw httpError(400, 'Se requiere un email.');

  const { rows } = await pool.query('SELECT id, name FROM users WHERE email = $1', [normEmail]);
  const user = rows[0];

  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at)
       VALUES ($1, $2, now() + interval '${RESET_TTL_HOURS} hours')`,
      [user.id, token]
    );
    const link = `${WEB_ORIGIN}/reset-password?token=${token}`;
    await sendEmail({
      to: normEmail,
      subject: 'Restablece tu contraseña — Master Tool',
      html: `<p>Hola${user.name ? ` ${user.name}` : ''},</p>
             <p>Recibimos una solicitud para restablecer tu contraseña. Este enlace expira en ${RESET_TTL_HOURS} hora.</p>
             <p><a href="${link}">${link}</a></p>
             <p>Si no fuiste tú, ignora este mensaje.</p>`,
      textFallbackLog: `Reset de contraseña para ${normEmail}: ${link}`,
    });
  } else {
    // No revelamos que el email no existe; solo lo dejamos en logs para depuración.
    console.log(`[auth] Solicitud de reseteo para email no registrado: ${normEmail}`);
  }

  return { ok: true }; // mismo mensaje exista o no la cuenta
}

/** Aplica el nuevo password si el token es válido, no usado y no expirado. */
async function resetPassword({ token, password }) {
  if (!token || !password) throw httpError(400, 'Token y nueva contraseña son obligatorios.');
  if (String(password).length < 8) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, user_id FROM password_resets
        WHERE token = $1 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [token]
    );
    if (rows.length === 0) throw httpError(400, 'El enlace no es válido o ya expiró. Solicita uno nuevo.');

    const hash = await bcrypt.hash(String(password), 10);
    await client.query(
      `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`,
      [rows[0].user_id, hash]
    );
    await client.query(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [rows[0].id]);
    // Invalida cualquier otro token de reseteo pendiente para este usuario.
    await client.query(
      `UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
      [rows[0].user_id]
    );

    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Cambio de contraseña estando logueado (requiere la contraseña actual). */
async function changePassword({ userId, currentPassword, newPassword }) {
  if (!currentPassword || !newPassword) throw httpError(400, 'Se requiere la contraseña actual y la nueva.');
  if (String(newPassword).length < 8) throw httpError(400, 'La nueva contraseña debe tener al menos 8 caracteres.');

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw httpError(404, 'Usuario no encontrado.');

  const ok = await bcrypt.compare(String(currentPassword), rows[0].password_hash);
  if (!ok) throw httpError(401, 'La contraseña actual no es correcta.');

  const hash = await bcrypt.hash(String(newPassword), 10);
  await pool.query(
    'UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1',
    [userId, hash]
  );
  return { ok: true };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = {
  register, login, signToken, verifyToken,
  requestPasswordReset, resetPassword, changePassword,
};

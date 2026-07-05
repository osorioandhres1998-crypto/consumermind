/**
 * MÓDULO EQUIPO — N3-A/N3-B del plan enterprise
 * ------------------------------------------------------------
 * Miembros del workspace, invitaciones por enlace compartible (sin email
 * en v1 — el Owner copia el link y lo envía por donde quiera) y branding
 * de marca blanca para el informe PDF.
 *
 * users/workspaces/invitations no tienen RLS (tablas pre-tenant); todas
 * las queries filtran por workspace_id explícitamente.
 */

const crypto = require('crypto');

const INVITE_TTL_DAYS = 7;

/** Vista general del equipo: workspace (con branding), miembros e invitaciones pendientes. */
async function overview({ db, workspaceId, userId }) {
  const { rows: ws } = await db.query(
    `SELECT id, name, plan, brand_name, brand_color FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const { rows: members } = await db.query(
    `SELECT id, email, name, role, created_at FROM users
      WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [workspaceId]
  );
  const { rows: invitations } = await db.query(
    `SELECT id, role, token, expires_at, created_at FROM invitations
      WHERE workspace_id = $1 AND used_by IS NULL AND expires_at > now()
      ORDER BY created_at DESC`,
    [workspaceId]
  );
  const me = members.find((m) => m.id === userId);
  return { workspace: ws[0], members, invitations, myRole: me?.role || null };
}

/** Crea una invitación por enlace (owner). role: editor | viewer. */
async function createInvitation({ db, workspaceId, userId, role }) {
  if (!['editor', 'viewer'].includes(role)) {
    const e = new Error('El rol de la invitación debe ser "editor" o "viewer".');
    e.status = 400;
    throw e;
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const { rows } = await db.query(
    `INSERT INTO invitations (workspace_id, created_by, role, token, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '${INVITE_TTL_DAYS} days')
     RETURNING id, role, token, expires_at, created_at`,
    [workspaceId, userId, role, token]
  );
  return rows[0];
}

async function revokeInvitation({ db, workspaceId, invitationId }) {
  const { rowCount } = await db.query(
    `DELETE FROM invitations WHERE workspace_id = $1 AND id = $2 AND used_by IS NULL`,
    [workspaceId, invitationId]
  );
  return rowCount > 0;
}

/** Quita a un miembro (owner; no puede quitarse a sí mismo ni a otro owner). */
async function removeMember({ db, workspaceId, userId, memberId }) {
  if (memberId === userId) {
    const e = new Error('No puedes quitarte a ti mismo del workspace.');
    e.status = 400;
    throw e;
  }
  const { rowCount } = await db.query(
    `DELETE FROM users WHERE workspace_id = $1 AND id = $2 AND role <> 'owner'`,
    [workspaceId, memberId]
  );
  return rowCount > 0;
}

/** Actualiza el branding de marca blanca (owner). */
async function updateBranding({ db, workspaceId, brandName, brandColor }) {
  if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    const e = new Error('El color debe ser hexadecimal (#RRGGBB).');
    e.status = 400;
    throw e;
  }
  const { rows } = await db.query(
    `UPDATE workspaces SET brand_name = $2, brand_color = $3
      WHERE id = $1
      RETURNING id, name, brand_name, brand_color`,
    [workspaceId, brandName?.trim() || null, brandColor || null]
  );
  return rows[0];
}

module.exports = { overview, createInvitation, revokeInvitation, removeMember, updateBranding };

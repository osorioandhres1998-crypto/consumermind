/**
 * MÓDULO PROJECTS — master-tool
 * ------------------------------------------------------------
 * CRUD de la entidad central "Proyecto". Un proyecto describe un
 * producto/servicio una sola vez; los módulos (Strategy, Copy Studio,
 * Validator, ...) cuelgan sus resultados de él y reutilizan sus datos.
 *
 * Igual que el resto de módulos, cada función recibe `db` = el client
 * del request (transacción + SET LOCAL app.workspace_id ya activos),
 * para que la RLS aísle por tenant sobre la misma conexión.
 */

/** Crea un proyecto en el workspace. */
async function createProject({ db, workspaceId, userId, input }) {
  const { name, product, customer, price, channel, landing_url, vertical } = input;
  const { rows } = await db.query(
    `INSERT INTO projects
       (workspace_id, created_by, name, product, customer, price, channel, landing_url, vertical)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, name, product, customer, price, channel, landing_url, vertical, created_at`,
    [workspaceId, userId, name, product || null, customer || null,
     price || null, channel || null, landing_url || null, vertical || null]
  );
  return rows[0];
}

/** Lista los proyectos del workspace (para el dashboard). */
async function listProjects({ db, workspaceId, limit = 50 }) {
  const { rows } = await db.query(
    `SELECT id, name, product, customer, price, channel, landing_url, vertical, created_at
       FROM projects
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [workspaceId, limit]
  );
  return rows;
}

/**
 * Recupera un proyecto con TODO su historial: análisis (Strategy/Copy Studio/...)
 * y simulaciones (Validator). Es lo que alimenta la vista del proyecto.
 */
async function getProject({ db, workspaceId, projectId }) {
  const { rows: proj } = await db.query(
    `SELECT p.id, p.name, p.product, p.customer, p.price, p.channel, p.landing_url, p.vertical, p.created_at,
            w.brand_name, w.brand_color
       FROM projects p
       JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.workspace_id = $1 AND p.id = $2`,
    [workspaceId, projectId]
  );
  if (!proj[0]) return null;

  const { rows: analyses } = await db.query(
    `SELECT id, module, input, result, created_at
       FROM analyses
      WHERE workspace_id = $1 AND project_id = $2
      ORDER BY created_at DESC`,
    [workspaceId, projectId]
  );

  const { rows: simulations } = await db.query(
    `SELECT id, status, results, archetypes, insights, audience_source, created_at
       FROM simulations
      WHERE workspace_id = $1 AND project_id = $2
      ORDER BY created_at DESC`,
    [workspaceId, projectId]
  );

  return { ...proj[0], analyses, simulations };
}

/**
 * Actualiza los datos editables del proyecto — UPDATE parcial: solo toca
 * los campos que vienen en el body (undefined = no cambiar; '' = limpiar).
 * CORRECCIÓN de bug latente: la versión anterior escribía TODOS los campos
 * con null si no venían, así que actualizar solo el vertical (selector de
 * la vista del proyecto) borraba producto/cliente/precio/canal.
 */
async function updateProject({ db, workspaceId, projectId, input }) {
  const allowed = ['name', 'product', 'customer', 'price', 'channel', 'landing_url', 'vertical'];
  const sets = [];
  const vals = [workspaceId, projectId];

  for (const key of allowed) {
    if (input[key] === undefined) continue; // no enviado → no se toca
    if (key === 'name' && (!input.name || !String(input.name).trim())) {
      const e = new Error('El nombre del proyecto no puede quedar vacío.');
      e.status = 400;
      throw e;
    }
    vals.push(input[key] === '' || input[key] === null ? null : input[key]);
    sets.push(`${key} = $${vals.length}`);
  }

  if (sets.length === 0) {
    // Nada que actualizar: devuelve el estado actual.
    const { rows } = await db.query(
      `SELECT id, name, product, customer, price, channel, landing_url, vertical, created_at
         FROM projects WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, projectId]
    );
    return rows[0] || null;
  }

  const { rows } = await db.query(
    `UPDATE projects SET ${sets.join(', ')}
      WHERE workspace_id = $1 AND id = $2
      RETURNING id, name, product, customer, price, channel, landing_url, vertical, created_at`,
    vals
  );
  return rows[0] || null;
}

/** Elimina un proyecto (cascada borra sus análisis y simulaciones). */
async function deleteProject({ db, workspaceId, projectId }) {
  const { rowCount } = await db.query(
    `DELETE FROM projects WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, projectId]
  );
  return rowCount > 0;
}

module.exports = {
  createProject, listProjects, getProject, updateProject, deleteProject,
};

/**
 * BACKUP DE LA BASE DE DATOS — Bloque 2.1 de DEUDA-TECNICA.md
 * ------------------------------------------------------------
 * Exporta TODAS las tablas a un archivo JSON con fecha, usando el cliente
 * `pg` ya instalado (sin necesidad de pg_dump). Pensado para correrse
 * desde tu PC contra la URL pública de la base:
 *
 *   cd apps/server
 *   set DATABASE_URL=postgresql://...  (Windows)  y luego:
 *   node scripts/backup-db.js
 *
 * El archivo queda en <repo>/backups/backup-YYYY-MM-DDTHH-mm.json
 * (carpeta gitignoreada: los backups contienen datos de clientes y
 * NUNCA deben subirse al repo).
 *
 * Complemento, no reemplazo, de los backups nativos de Railway
 * (pestaña "Backups" del servicio Postgres): esto te da una copia
 * FUERA de Railway, en tu propia máquina.
 */

if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config(); } catch (_) { /* opcional */ }
}
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const TABLES = [
  'workspaces', 'users', 'invitations', 'password_resets',
  'projects', 'analyses', 'simulations', 'metrics_snapshots', 'experiments',
];

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('✗ Falta DATABASE_URL (usa la URL pública de Railway).');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dump = { created_at: new Date().toISOString(), tables: {} };

  try {
    for (const table of TABLES) {
      try {
        const { rows } = await pool.query(`SELECT * FROM ${table}`);
        dump.tables[table] = rows;
        console.log(`→ ${table}: ${rows.length} filas`);
      } catch (err) {
        // Tabla aún no creada en este entorno: se registra y se sigue.
        console.warn(`⚠ ${table}: omitida (${err.message})`);
        dump.tables[table] = null;
      }
    }

    const outDir = path.join(__dirname, '..', '..', '..', 'backups');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
    const outFile = path.join(outDir, `backup-${stamp}.json`);
    fs.writeFileSync(outFile, JSON.stringify(dump, null, 1));

    const kb = Math.round(fs.statSync(outFile).size / 1024);
    console.log(`\n✓ Backup completo: ${outFile} (${kb} KB)`);
    console.log('  Guárdalo en un lugar seguro (no está en el repo: backups/ es gitignoreada).');
  } catch (err) {
    console.error('✗ Error de backup:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();

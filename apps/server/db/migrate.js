/**
 * MIGRADOR — ConsumerMind
 * ------------------------------------------------------------
 * Ejecuta schema.sql y seed.sql contra DATABASE_URL usando el
 * cliente `pg` (no requiere tener `psql` instalado).
 *
 *   npm run db:migrate --workspace=apps/server
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('✗ Falta DATABASE_URL en apps/server/.env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const files = ['schema.sql', 'seed.sql'];

  try {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(__dirname, f), 'utf8');
      process.stdout.write(`→ Ejecutando ${f}... `);
      await pool.query(sql);
      console.log('OK');
    }
    console.log('✓ Migración completada.');
  } catch (err) {
    console.error('\n✗ Error de migración:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();

/**
 * POOL DE POSTGRESQL — ConsumerMind
 * Requiere: npm i pg
 * Variable de entorno: DATABASE_URL
 */
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;

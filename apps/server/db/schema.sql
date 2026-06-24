-- ESQUEMA MULTI-TENANT — ConsumerMind (MVP)
-- ------------------------------------------------------------
-- Workspaces = tenants. Cada análisis del motor queda atado a un
-- workspace para aislamiento de datos entre clientes/agencias.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free',  -- free | pro | agency
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL DEFAULT 'member',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla central: resultados del motor psicológico, reusables
-- entre módulos (Strategy escribe, Copy Studio lee y también escribe).
CREATE TABLE IF NOT EXISTS analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  module        TEXT NOT NULL,             -- strategy | copy_studio | ...
  input         JSONB NOT NULL,            -- producto, cliente, precio, canal
  result        JSONB NOT NULL,            -- salida estructurada del motor
  tokens_in     INTEGER,
  tokens_cached INTEGER,                   -- tokens leídos de caché (núcleo)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analyses_workspace ON analyses (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_module    ON analyses (workspace_id, module);

-- Aislamiento a nivel de fila. La app fija el tenant por request con:
--   BEGIN; SET LOCAL app.workspace_id = '<uuid>'; ...; COMMIT;
-- (ver api/middleware/workspace.js — usa SET LOCAL dentro de una transacción
--  sobre un client dedicado para evitar fugas entre requests del pool).
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
-- FORCE: que la RLS aplique también al rol dueño de la tabla (en dev el rol
-- de la app suele ser el owner; sin FORCE, el owner saltaría la política).
ALTER TABLE analyses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON analyses;
CREATE POLICY tenant_isolation ON analyses
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);

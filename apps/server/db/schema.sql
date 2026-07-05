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
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  password_hash TEXT,                          -- bcrypt; null si entra solo por OAuth
  role          TEXT NOT NULL DEFAULT 'member', -- owner | editor | viewer | member
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Para bases ya creadas con el esquema anterior:
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

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

-- PROYECTO: unidad central del master-tool. Un proyecto describe un
-- producto/servicio una sola vez; cada módulo (Strategy, Copy Studio,
-- Validator, ...) cuelga sus resultados de él y reutiliza estos datos.
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,            -- "Lanzamiento App Fitness 2026"
  product       TEXT,                     -- descripción del producto/servicio
  customer      TEXT,                     -- perfil del público objetivo
  price         TEXT,                     -- texto libre ("$20", "freemium"...)
  channel       TEXT,                     -- web | app | redes | ...
  landing_url   TEXT,                     -- opcional (para Landing Analyzer)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects (workspace_id, created_at DESC);

-- analyses ahora cuelga de un proyecto (nullable para no romper datos previos
-- ni el "análisis rápido sin proyecto").
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_analyses_workspace ON analyses (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_module    ON analyses (workspace_id, module);
CREATE INDEX IF NOT EXISTS idx_analyses_project    ON analyses (project_id);

-- SIMULATIONS: resultados del microservicio Validator (FastAPI/Monte Carlo).
-- Reemplaza el almacén in-memory (store.py) por persistencia multi-tenant.
CREATE TABLE IF NOT EXISTS simulations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | failed
  config          JSONB,                          -- config de la simulación
  results         JSONB,                          -- acceptance_rate, purchase_intent...
  archetypes      JSONB,                          -- arquetipos generados (IA/heurístico)
  insights        JSONB,                          -- objeciones, feature_importance...
  audience_source TEXT,                           -- claude | heuristic
  error           TEXT,                           -- mensaje si status=failed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulations_workspace ON simulations (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulations_project    ON simulations (project_id);

-- METRICS_SNAPSHOTS (N1-A/B del plan enterprise): agregado mensual de
-- métricas reales de marketing (importadas de CSV de Meta/Google Ads, o
-- ingresadas a mano) por proyecto. Alimenta el historial/tendencias (N1-B).
-- Un snapshot por (project_id, period); reemplaza si se reimporta el mismo mes.
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  period        TEXT NOT NULL,              -- 'YYYY-MM'
  source        TEXT NOT NULL DEFAULT 'manual', -- meta | google | csv | manual
  metrics       JSONB NOT NULL,             -- ads, fijos, ingresos, ordenes, clientesNuevos...
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, period)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_workspace ON metrics_snapshots (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_project    ON metrics_snapshots (project_id, period);

-- EXPERIMENTS (N2-B): registro de tests A/B, cierra el ciclo
-- decidir (Copy Studio) -> probar -> medir (significancia determinista).
CREATE TABLE IF NOT EXISTS experiments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  hypothesis      TEXT NOT NULL,
  metric_name     TEXT NOT NULL DEFAULT 'conversión', -- qué se mide (CTR, conversión, etc.)
  variant_a_label TEXT NOT NULL DEFAULT 'Control (A)',
  variant_b_label TEXT NOT NULL DEFAULT 'Variante (B)',
  visitors_a      INTEGER NOT NULL DEFAULT 0,
  conversions_a   INTEGER NOT NULL DEFAULT 0,
  visitors_b      INTEGER NOT NULL DEFAULT 0,
  conversions_b   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'running', -- running | concluded
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiments_workspace ON experiments (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_experiments_project    ON experiments (project_id, created_at DESC);

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

-- Misma RLS para projects (mismo patrón SET LOCAL app.workspace_id).
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON projects;
CREATE POLICY tenant_isolation ON projects
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Misma RLS para simulations (las escribe el microservicio Validator,
-- fijando app.workspace_id en su propia transacción por request).
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON simulations;
CREATE POLICY tenant_isolation ON simulations
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Misma RLS para metrics_snapshots.
ALTER TABLE metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON metrics_snapshots;
CREATE POLICY tenant_isolation ON metrics_snapshots
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Misma RLS para experiments.
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON experiments;
CREATE POLICY tenant_isolation ON experiments
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true)::uuid);

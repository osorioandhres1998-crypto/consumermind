-- SEED DE DEMO — ConsumerMind
-- ------------------------------------------------------------
-- Crea un workspace y un usuario con UUIDs FIJOS para que la demo
-- (sin auth real todavía) pueda mandar x-workspace-id / x-user-id
-- y que las FK + RLS funcionen. Estos UUIDs están replicados en
-- apps/web/lib/tenant.js. Cuando se conecte NextAuth, esto se retira.

INSERT INTO workspaces (id, name, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Workspace Demo', 'free')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, workspace_id, email, role)
VALUES ('00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        'demo@consumermind.app', 'owner')
ON CONFLICT (id) DO NOTHING;

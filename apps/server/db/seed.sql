-- SEED DE DEMO — ConsumerMind (OPCIONAL / LEGADO)
-- ------------------------------------------------------------
-- Ya hay auth real (NextAuth): los usuarios se crean en /register, que
-- genera workspace + Owner con contraseña. Este seed solo deja un
-- workspace/usuario de ejemplo (sin contraseña, no sirve para login).
-- Puedes ignorarlo o borrarlo; se mantiene por compatibilidad.

INSERT INTO workspaces (id, name, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Workspace Demo', 'free')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, workspace_id, email, role)
VALUES ('00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        'demo@consumermind.app', 'owner')
ON CONFLICT (id) DO NOTHING;

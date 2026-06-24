# ConsumerMind

SaaS de psicología del consumidor. Un **motor psicológico compartido** (Claude API)
alimenta varios módulos: **Strategy** detecta los sesgos cognitivos de un caso y
**Copy Studio** genera copy/ángulos que activan exactamente esos sesgos. Multi-tenant
por workspace con aislamiento RLS en PostgreSQL.

## Stack

- **Frontend:** Next.js 14 (App Router) — `apps/web`
- **Backend:** Node.js + Express (CommonJS) — `apps/server`
- **DB:** PostgreSQL con Row Level Security
- **IA:** Claude API (`@anthropic-ai/sdk`), modelo `claude-sonnet-4-6`
- **Monorepo:** npm workspaces (pnpm no estaba instalado; npm workspaces es equivalente para este caso)

## Estructura

```
apps/
├── server/                  # Backend Express + motor (única capa con la API key)
│   ├── engine/              # NÚCLEO compartido: knowledge-base, prompts (TASKS), claude-client, index
│   ├── modules/
│   │   ├── strategy/        # bias_analysis → persiste en `analyses`
│   │   └── copy-studio/     # copy_generation / creative_angles → persiste en `analyses`
│   ├── api/routes/          # strategy.routes.js, copy-studio.routes.js
│   ├── api/middleware/      # workspace.js (tenant + RLS por request)
│   ├── db/                  # schema.sql, seed.sql, pool.js, migrate.js
│   └── index.js             # arranque Express (monta /api/strategy y /api/copy-studio)
└── web/                     # Frontend Next.js
    ├── app/                 # / , /strategy , /copy-studio
    ├── hooks/               # useBiasAnalysis, useCopyGeneration
    └── lib/                 # api.js (fetch + tenant), pdf.js, tenant.js
```

## Reglas de seguridad (de CLAUDE.md, respetadas)

- La `ANTHROPIC_API_KEY` vive **solo** en `apps/server/.env`. El navegador nunca llama a `api.anthropic.com`.
- El frontend habla solo con `/api/...`; Next proxya esas rutas al backend (`next.config.js`).
- Todo acceso a datos va filtrado por `workspace_id` mediante RLS. El middleware abre una
  transacción por request, hace `SET LOCAL app.workspace_id` sobre un **client dedicado**
  (corrige una fuga de tenant del prototipo original que usaba el pool a nivel sesión).

## Puesta en marcha

Requisitos: Node 18+ y un **PostgreSQL** accesible.

```bash
# 1. Instalar dependencias (raíz del monorepo)
npm install

# 2. Configurar el backend
#    Copia apps/server/.env.example a apps/server/.env y rellena:
#      ANTHROPIC_API_KEY=sk-ant-...   (tu clave real)
#      DATABASE_URL=postgres://usuario:pass@host:5432/consumermind

# 3. Crear el esquema + seed (workspace/usuario de demo)
npm run db:migrate --workspace=apps/server

# 4. Arrancar
npm run dev:server   # Express en http://localhost:3001
npm run dev:web      # Next.js en http://localhost:3000
```

Abre `http://localhost:3000` → **Strategy** (analiza un caso) → **Copy Studio** (genera copy
a partir del análisis).

## Estado de verificación

- ✅ `npm install` — backend y web (incluye `@anthropic-ai/sdk` y `pg`).
- ✅ Backend arranca; `GET /health` responde; rutas montadas como
  `app.use('/api/strategy', requireWorkspace, strategyRoutes)` (+ copy-studio).
- ✅ `next build` compila las 3 rutas.
- ⏳ **Pendiente de tu entorno:** la migración (`db:migrate`) y las generaciones reales
  necesitan un PostgreSQL activo y una `ANTHROPIC_API_KEY` válida. Sin DB, `/api/strategy/*`
  responde **503 controlado** (verificado).

## Decisiones tomadas en esta integración

- Modelo de datos **de texto libre** (`product/customer/price/channel` → tabla `analyses`).
  Se retiraron las bibliotecas de Personas/Productos de la SPA anterior.
- El motor real (Claude) es la **única** fuente; se retiró el motor determinista previo.
- Copy Studio **persiste** sus resultados en `analyses` con `module='copy_studio'`.
- Se añadió la TASK `creative_angles` (mencionada en CLAUDE.md pero ausente en el código).

## Decisiones aún abiertas (de CLAUDE.md / spec)

- Límites numéricos del plan free (se cuentan filas en `analyses`/mes/workspace).
- Estructura de planes pagos (`workspaces.plan`: free | pro | agency).
- Autenticación real (NextAuth): hoy el tenant se simula con `x-workspace-id` / `x-user-id`
  (ver `apps/web/lib/tenant.js` + `apps/server/db/seed.sql`).
```

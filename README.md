# ConsumerMind

![Licencia: Propietaria](https://img.shields.io/badge/licencia-propietaria-red)
![Estado: Privado](https://img.shields.io/badge/uso-privado-lightgrey)

> ⚠️ **Repositorio propietario.** El código es visible con fines de demostración,
> pero **NO es de código abierto**: todos los derechos reservados. No se concede
> permiso de uso, copia ni distribución. Ver [LICENSE](LICENSE).

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
│   ├── modules/auth/       # registro + login (bcrypt) → emite JWT
│   └── api/routes/auth.routes.js
└── web/                     # Frontend Next.js + NextAuth
    ├── app/                 # / , /login , /register , /strategy , /copy-studio
    ├── app/api/             # [...nextauth], register (público), [...path] (proxy autenticado)
    ├── auth.js              # config de NextAuth (Credentials)
    ├── hooks/               # useBiasAnalysis, useCopyGeneration
    └── lib/                 # api.js, pdf.js
```

## Reglas de seguridad (de CLAUDE.md, respetadas)

- La `ANTHROPIC_API_KEY` vive **solo** en `apps/server`. El navegador nunca llama a `api.anthropic.com`.
- **Autenticación real (NextAuth):** el usuario inicia sesión; el backend emite un **JWT** y el
  tenant se deriva de ese token verificado. El navegador ya **no** manda cabeceras `x-workspace-id`.
- El frontend llama a `/api/...` (mismo origen); un **route handler server-side** adjunta el JWT
  y reenvía al backend, así el token nunca queda expuesto al navegador.
- Todo acceso a datos va filtrado por `workspace_id` mediante RLS. El middleware abre una
  transacción por request, hace `SET LOCAL app.workspace_id` sobre un **client dedicado**
  (corrige una fuga de tenant del prototipo original que usaba el pool a nivel sesión).

## Puesta en marcha

Requisitos: Node 18+ y un **PostgreSQL** accesible.

```bash
# 1. Instalar dependencias (raíz del monorepo)
npm install

# 2. Configurar el backend (apps/server/.env desde .env.example):
#      ANTHROPIC_API_KEY=sk-ant-...        (tu clave real)
#      DATABASE_URL=postgres://.../consumermind
#      BACKEND_JWT_SECRET=<cadena larga aleatoria>
#    Y el frontend (apps/web/.env.local desde .env.example):
#      API_URL=http://localhost:3001
#      AUTH_SECRET=<cadena larga aleatoria>   AUTH_TRUST_HOST=true

# 3. Crear el esquema (tablas + RLS)
npm run db:migrate --workspace=apps/server

# 4. Arrancar
npm run dev:server   # Express en http://localhost:3001
npm run dev:web      # Next.js en http://localhost:3000
```

Abre `http://localhost:3000` → **Crear cuenta** (serás Owner de tu workspace) → **Strategy**
(analiza un caso) → **Copy Studio** (genera copy a partir del análisis).

## Despliegue (Vercel + Railway)

Guía completa con variables de entorno y dominio propio en **[DEPLOY.md](DEPLOY.md)**.
Resumen: `apps/web` → Vercel, `apps/server` + PostgreSQL → Railway.

## Estado de verificación

- ✅ `npm install` — backend y web (incluye `@anthropic-ai/sdk` y `pg`).
- ✅ Backend arranca; `GET /health` responde; rutas montadas como
  `app.use('/api/strategy', requireWorkspace, strategyRoutes)` (+ copy-studio).
- ✅ `next build` compila todas las rutas (incluye login/register, proxy `/api/[...path]` y middleware).
- ✅ Auth verificada: `/api/strategy/*` responde **401** sin token y con token inválido;
  `/api/auth/login` responde 500 controlado cuando no hay DB.
- ⏳ **Pendiente de tu entorno:** la migración (`db:migrate`) y las generaciones/login reales
  necesitan un PostgreSQL activo y una `ANTHROPIC_API_KEY` válida.

## Decisiones tomadas en esta integración

- Modelo de datos **de texto libre** (`product/customer/price/channel` → tabla `analyses`).
  Se retiraron las bibliotecas de Personas/Productos de la SPA anterior.
- El motor real (Claude) es la **única** fuente; se retiró el motor determinista previo.
- Copy Studio **persiste** sus resultados en `analyses` con `module='copy_studio'`.
- Se añadió la TASK `creative_angles` (mencionada en CLAUDE.md pero ausente en el código).
- **Autenticación real con NextAuth** (email + contraseña): el registro crea workspace + Owner;
  el tenant se deriva de un JWT verificado (se retiró el stub de cabeceras `x-workspace-id`).

## Decisiones aún abiertas (de CLAUDE.md / spec)

- Límites numéricos del plan free (se cuentan filas en `analyses`/mes/workspace).
- Estructura de planes pagos (`workspaces.plan`: free | pro | agency).
- Google OAuth e invitaciones multi-miembro (roles) — siguiente iteración.

## Licencia

**Propietaria — Todos los derechos reservados.** © 2026 Andrés Osorio.

Este repositorio es código privado y confidencial. Que sea visible en GitHub
**no** lo convierte en código abierto: queda prohibido usar, copiar, modificar,
redistribuir o desplegar el código sin permiso previo por escrito del titular.
Consulta el archivo [LICENSE](LICENSE) para los términos completos.

Para solicitar permisos de uso: osorioandhres1998@gmail.com

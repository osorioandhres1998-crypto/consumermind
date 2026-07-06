# CLAUDE.md — Memoria del proyecto: Master Tool

> Léelo COMPLETO antes de modificar código. Documenta la arquitectura real,
> las reglas inviolables, los casos de prueba ancla y las trampas de deploy
> aprendidas en producción. Todo el proyecto se documenta en español.

---

## 1. Qué es el proyecto

**Master Tool** (repo `consumermind`): SaaS multi-tenant para equipos de
marketing B2B que cubre el ciclo completo de un producto digital. La unidad
central es el **Proyecto**: describe producto/cliente una vez y todas las
herramientas lo reutilizan y cuelgan sus resultados de él.

**Herramientas (5 + transversales):**

| Módulo | Ruta web | Motor | Persistencia |
|---|---|---|---|
| 🧪 MVP Validator | `/projects/[id]/validator` | Monte Carlo (Python/numpy), síncrono | `simulations` |
| 🎯 Strategy | `/projects/[id]/strategy` | IA (Groq) — sesgos cognitivos | `analyses` (module=`strategy`) |
| ✍️ Copy Studio | `/projects/[id]/copy-studio` | IA (Groq) — copy/ángulos desde sesgos | `analyses` (module=`copy_studio`) |
| 📊 Landing Analyzer | `/projects/[id]/landing` | **Determinista** (cheerio, sin IA) + PageSpeed API | `analyses` (module=`landing`) |
| 💰 Calculadora Rentabilidad (ProfitGuard) | `/projects/[id]/profitability` | **100% client-side** (funciones puras JS) | `metrics_snapshots` (opcional) |
| 🤖 Copiloto IA | widget en vista del proyecto | Groq, TASK `copilot`, responde SOLO con datos del proyecto | efímero (sin persistir chat) |
| 🧬 Experimentos A/B | `/projects/[id]/experiments` | test z de dos proporciones (determinista) | `experiments` |
| 👥 Equipo / marca blanca | `/team` | invitaciones por enlace + roles + branding PDF | `invitations`, `workspaces.brand_*` |
| 📄 Informe unificado | `/projects/[id]/report` | jsPDF client-side, usa marca blanca | — |

## 2. Arquitectura desplegada (3 servicios + DB)

```
Navegador ──► Vercel: apps/web (Next.js 14 App Router + NextAuth v5)
                 │  proxies server-side adjuntan el JWT (el navegador NUNCA ve tokens/keys)
                 ├──► Railway: apps/server (Express, CommonJS) ──► Groq API · PageSpeed API
                 └──► Railway: apps/validator (FastAPI/Python) ──► heurístico (Claude opcional)
                              ambos ──► Railway PostgreSQL (compartida, RLS por workspace_id)
```

- **Vercel** proyecto `consumermind-web` (root `apps/web`). URL estable: `consumermind-web.vercel.app`.
- **Railway** servicios: `@consumermind/server` (Root Directory `.`, **Nixpacks**, arranca con `npm start`), `app/validator` (root `apps/validator`, Dockerfile Python), Postgres.
- Los tres frontends de API del navegador: `/api/[...path]` (→ Express), `/api/validator/[...path]` (→ FastAPI), y rutas públicas estáticas (`/api/register`, `/api/forgot-password`, `/api/reset-password`).

## 3. Reglas INVIOLABLES

1. **Las API keys viven SOLO en los backends.** `GROQ_API_KEY` en apps/server; `ANTHROPIC_API_KEY` (opcional) en apps/validator. Nunca en apps/web, nunca `NEXT_PUBLIC_*`, el navegador jamás llama a proveedores de IA.
2. **Multi-tenant por RLS.** Todo acceso a tablas con RLS (`analyses`, `projects`, `simulations`, `metrics_snapshots`, `experiments`) va por el client del request: `requireWorkspace` abre transacción + `SET LOCAL app.workspace_id` sobre un client dedicado (`req.db`). **Nunca uses el pool global en módulos de negocio** (fuga de tenant). Tablas pre-tenant sin RLS: `workspaces`, `users`, `invitations`, `password_resets` — solo se tocan desde auth/team con filtros explícitos.
3. **Un solo JWT (HS256, `BACKEND_JWT_SECRET`)** con claims `{ sub, workspaceId, role }`, emitido por Express y verificado también por el Validator Python. El mismo secreto en ambos servicios de Railway.
4. **Roles:** `owner` (todo + equipo/marca), `editor` (usa herramientas), `viewer` (solo lectura — `blockViewerWrites` bloquea escrituras en todos los módulos salvo el copiloto). `requireOwner` protege /api/team administrativo.
5. **Degradación elegante** en toda dependencia externa: PageSpeed falla → proxy de peso HTML; Resend sin key → link en logs; Claude sin key (Validator) → heurístico determinista. **Una API externa caída nunca rompe un análisis.**
6. **El frontend habla solo con `/api/...`** (mismo origen); los route handlers server-side de Next adjuntan `Authorization: Bearer`.

## 4. Migraciones de base de datos (CRÍTICO)

- `apps/server/db/schema.sql` es **idempotente**: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE POLICY`. **Mantén ese estilo en todo cambio de esquema** — se ejecuta completo en cada arranque.
- **La migración corre automáticamente en `npm start`** (`node db/migrate.js && node index.js` en apps/server/package.json). Esta es LA defensa contra "columna no existe" en producción: no la quites del script start.
- Si agregas una columna que una query usa (ej. un JOIN nuevo), el deploy la migra solo. Si la migración falla, el server NO arranca (fallo visible, mejor que servir con esquema viejo).
- El Validator escribe en `simulations` fijando `SET LOCAL app.workspace_id` en su propia transacción (apps/validator/app/db.py) — replica el patrón si añades tablas que toque Python.

## 5. Casos de prueba ancla (NO SE PUEDEN ROMPER)

Ejecutar antes de commitear cambios en los motores:

1. **Landing Analyzer** — `cd apps/server && node tests/landing-engine.test.js`.
   Esperado exacto: buena **94/100** (7/9 principios, 0 alertas) · vacía **22** (`js_suspected=true`) · dark **52** (≥3 alertas: urgencia falsa, prechecked, confirmshaming).
2. **ProfitGuard** (apps/web/lib/profitability.js) — caso ancla: precio 100.000, costo 40.000, envío 8.000, comisión 3%, devolución 5% ⇒ costo var/orden **51.550**, margen **48,45%**, CAC máx **48.450**, ROAS break-even **2,064**. Defaults LTV neutros (frecuencia=1, retención=1 ⇒ ltv === cacMaximo).
3. **LTV/MER** — ads 2M, fijos 800K, ingresos 4,5M, 45 órdenes, 30 clientes nuevos, frecuencia 0,5, retención 12 ⇒ LTV **290.700**, CAC real **93.333**, ratio **3,11**, payback **3,85** meses, MER **1,61**.
4. **Significancia A/B** (apps/server/lib/significance.js) — 1000/100 vs 1000/130 ⇒ z≈**2,10**, significativo al 95%; 1000/100 vs 1000/105 ⇒ NO significativo.
5. **Validator** — misma `random_seed` ⇒ mismos resultados (SeedSequence por iteración). Tests: `pytest` en apps/validator (correr en Docker/py3.11; el Python local 3.14 no tiene wheels de numpy pineado).

## 6. Trampas de deploy aprendidas EN PRODUCCIÓN (no repetirlas)

1. **Railway construye apps/server con NIXPACKS, no con su Dockerfile** (Root Directory = `.`). Ejecuta `npm start` del workspace. Cualquier lógica de arranque va en el script `start` de package.json, NO en el Dockerfile de apps/server (se ignora). El Dockerfile de apps/validator SÍ se usa (su root es `apps/validator`).
2. **`npm ci` exige lock sincronizado**: tras cambiar dependencias, `npm install` en la RAÍZ del monorepo y commitear `package-lock.json`, o el build de Railway falla con `Missing: <pkg> from lock file`.
3. **Railway salta commits que no tocan `apps/server`** ("No changes to watched files") y "Redeploy" repite el commit viejo. Para forzar deploy del backend: un cambio real dentro de `apps/server`.
4. **En este proyecto de Railway la red privada NO resuelve** (`postgres.railway.internal` → ENOTFOUND) y las referencias `${{Postgres.DATABASE_URL}}` no se resuelven. **`DATABASE_URL` se configura con el valor literal de la URL PÚBLICA** (`...proxy.rlwy.net:PUERTO/railway`) en AMBOS servicios (server y validator). No "arreglarlo" volviendo a la interna.
5. **Vercel congela las env vars por deploy**: al agregar/cambiar una variable hay que redeployar, y las variables de equipo deben quedar **vinculadas al proyecto** (`consumermind-web`) y marcadas para Production. Probar siempre en la URL estable `consumermind-web.vercel.app`, no en URLs de deploys viejos.
6. **Errores del Validator (FastAPI) vienen en `detail`**, no en `error` — `apiFetch` ya lee ambos; mantener eso si se toca.

## 7. Variables de entorno por servicio

| Servicio | Variables |
|---|---|
| Railway `@consumermind/server` | `GROQ_API_KEY`, `CONSUMERMIND_MODEL` (`llama-3.3-70b-versatile`), `DATABASE_URL` (pública literal), `BACKEND_JWT_SECRET`, `BACKEND_JWT_TTL` (`7d`), `WEB_ORIGIN` (URL de Vercel), opcionales: `PAGESPEED_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM` |
| Railway `app/validator` | `DATABASE_URL` (misma pública), `BACKEND_JWT_SECRET` (idéntico al server), opcional `ANTHROPIC_API_KEY` (sin ella usa heurístico) |
| Vercel `consumermind-web` | `API_URL` (URL pública del server, con https), `VALIDATOR_URL` (URL pública del validator), `AUTH_SECRET`, `AUTH_TRUST_HOST=true` |

## 8. Convenciones de código

- **Backend Express**: cada módulo = `modules/<x>/service.js` (lógica, recibe `{ db, workspaceId, userId, ... }`) + `api/routes/<x>.routes.js` (HTTP), montado en index.js con `requireWorkspace` (+ `blockViewerWrites` si escribe). Errores con `err.status` para códigos HTTP.
- **Motores deterministas** (landing, profitability, significance): funciones puras, cada regla/benchmark con **comentario citando su fuente y cifra de impacto** (nada de números mágicos), y cada check reporta su **evidencia** textual.
- **IA**: todo pasa por `apps/server/engine/` (`runAnalysis(taskKey, input)`). Módulo IA nuevo = registrar una TASK en `engine/prompts.js`, nada más. Salida siempre JSON parseado. El copiloto recibe cifras **ya calculadas** (MER/ROAS por mes) — no dejar aritmética al LLM.
- **Frontend**: App Router, componentes client con estilos del sistema de `app/styles.css` (`card`, `field`, `tag`, `banner`...); gráficas en **SVG propio** (patrón `Curve`/`TrendChart`), sin librerías de charts. Español en UI, código y commits.
- **Benchmarks por vertical** (`apps/web/lib/benchmarks-verticales.js`): fallback SIEMPRE a las bandas genéricas si el proyecto no tiene vertical — comportamiento idéntico para datos viejos.

## 9. Comandos habituales

```bash
npm install                                   # raíz (workspaces) — actualiza el lock
cd apps/web && npm run build                  # verificación frontend (build limpio = gate)
cd apps/server && node tests/landing-engine.test.js   # tests del motor de landing
cd apps/server && npm run db:migrate          # migración manual (local; en prod es automática)
npm run dev:server / npm run dev:web          # desarrollo local
```

## 10. Checklist antes de cada commit/push

1. ¿Cambiaste esquema? → solo sentencias idempotentes en schema.sql (el deploy migra solo).
2. ¿Cambiaste dependencias? → `npm install` en la raíz + commitear `package-lock.json`.
3. ¿Tocaste un motor? → correr su caso ancla (sección 5); si un número ancla se movió, es un bug: revertir.
4. ¿Tocaste el frontend? → `npm run build` en apps/web debe salir limpio.
5. ¿El cambio necesita desplegarse en el backend? → debe tocar algún archivo dentro de `apps/server`.
6. Nuevos endpoints con datos de tenant → `requireWorkspace` (+ `blockViewerWrites`) y queries vía `req.db`.
7. Nada de secretos en el repo (`.env*` está gitignoreado; verificar staging antes de commitear).

## 11. Pendientes conocidos / decisiones abiertas

- **Snippet de comportamiento (heatmap)**: diferido hasta tener usuarios reales.
- **Email real** de invitaciones y reseteo: funciona ya con `RESEND_API_KEY` (sin ella, links en logs de Railway).
- **API live de Meta/Google Ads**: el importador CSV cubre el caso; la API requiere app review (burocracia) — evaluar después.
- **Renombrar repo** `consumermind` → nombre comercial: pendiente de decisión del dueño; al hacerlo, revisar los remotes y los proyectos de Vercel/Railway conectados.
- Repo público con **licencia propietaria** (© Andrés Osorio): visible ≠ open source.

# Despliegue — ConsumerMind (Vercel + Railway)

Arquitectura: **3 piezas**.
- **apps/web** (Next.js) → **Vercel**
- **apps/server** (Express) → **Railway**
- **PostgreSQL** → **Railway** (base gestionada)

El navegador habla solo con Vercel (`/api/...`); Vercel (server-side) reenvía al
backend de Railway con un JWT. La `GROQ_API_KEY` vive **solo** en Railway.

```
Navegador ──► Vercel (Next.js + NextAuth + proxy /api) ──► Railway (Express + motor) ──► PostgreSQL
                                                                   │
                                                                   └──► Groq API (API key aquí)
```

---

## Fase 0 — Antes de desplegar (preparar para evitar fallos)

Estos 3 puntos causan casi todos los errores de build si se omiten:

1. **Motor de IA — Groq (gratis):** crea cuenta en [groq.com](https://groq.com) →
   **API Keys** → **Create API Key** → copia la clave (`gsk_...`).
2. **Lock file sincronizado:** Railway construye con `npm ci`, que **falla** si
   `package.json` y `package-lock.json` no están al día. Tras cualquier cambio de
   dependencias, corre `npm install` en la **raíz** del repo y commitea el
   `package-lock.json` actualizado.
3. **Migrador sin `.env` en producción:** `apps/server/db/migrate.js` solo carga
   `dotenv` cuando `NODE_ENV !== 'production'` (en Railway las variables ya están
   inyectadas; no hay archivo `.env`).

---

## Fase 1 — Backend + base de datos en Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → `consumermind`.
2. En el servicio → **Settings → Root Directory = `apps/server`**.
3. En el proyecto → **New → Database → PostgreSQL**.
4. **Variables** del servicio backend:
   | Variable | Valor |
   |---|---|
   | `GROQ_API_KEY` | tu clave de Groq (`gsk_...`) |
   | `CONSUMERMIND_MODEL` | `llama-3.3-70b-versatile` |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al Postgres) |
   | `BACKEND_JWT_SECRET` | una cadena larga y aleatoria |
   | `BACKEND_JWT_TTL` | `7d` |
   | `WEB_ORIGIN` | provisional `http://localhost:3000` (se actualiza en Fase 3) |
   | `PORT` | Railway lo inyecta solo; el server usa `process.env.PORT` |
5. **Settings → Networking → Generate Domain** → copia la URL pública del backend.
6. **Migra la base (una sola vez)** — en el backend → **Console**, usa la
   **URL pública** de la base (`DATABASE_PUBLIC_URL`, de las Variables del Postgres),
   **no** la interna:
   ```
   DATABASE_URL="postgresql://postgres:...@<host-publico>.proxy.rlwy.net:<puerto>/railway" npm run db:migrate
   ```
   Debe imprimir `✓ Migración completada.`

> ⚠️ La URL interna `postgres.railway.internal` solo funciona **entre servicios**;
> desde la Console da `getaddrinfo ENOTFOUND`. Por eso la migración usa la pública.

## Fase 2 — Frontend en Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importa `consumermind`.
2. **Root Directory = `apps/web`** (Vercel detecta Next.js).
3. **Environment Variables**:
   | Variable | Valor |
   |---|---|
   | `API_URL` | URL pública del backend de Railway (**con `https://`**) |
   | `AUTH_SECRET` | una cadena larga y aleatoria (`npx auth secret`) |
   | `AUTH_TRUST_HOST` | `true` |
4. **Deploy.** Tu app queda en `https://<proyecto>.vercel.app`.

## Fase 3 — Cerrar el círculo

1. Vuelve a Railway → `WEB_ORIGIN` = la URL real de Vercel.
2. Prueba: **Crear cuenta** → **Strategy** → analizar un caso.

---

## Trampas de Railway (aprendidas en la práctica)

1. **`npm ci` exige el lock sincronizado.** Si cambias dependencias, `npm install`
   en la raíz y commitea `package-lock.json` antes de desplegar. Síntoma:
   `npm error Missing: <paquete> from lock file`.
2. **"Redeploy" repite el commit anterior**, no baja el último de GitHub. Además,
   Railway **salta** ("No changes to watched files") los commits **vacíos** o que
   solo tocan `apps/web`, porque el servicio backend solo vigila `apps/server`.
   Para forzar un deploy del último código: haz un cambio **real dentro de
   `apps/server`** y púshealo.
3. **La migración usa `DATABASE_PUBLIC_URL`**, no la interna (ver Fase 1, paso 6).

## Dominio propio (opcional)

- **Frontend:** Vercel → **Settings → Domains → Add** `tudominio.com` → registros DNS. HTTPS automático.
- **Backend:** Railway → **Settings → Networking → Custom Domain** `api.tudominio.com` → CNAME.
- Actualiza en Vercel `API_URL=https://api.tudominio.com` y en Railway `WEB_ORIGIN=https://tudominio.com`.

## Comprobación post-deploy

1. `https://TU-BACKEND/health` → `{ "ok": true }`.
2. En la web: **Crear cuenta** → **Strategy** → analiza un caso → persiste y aparece en **Copy Studio**.
3. Sin sesión, abrir `/strategy` redirige a `/login`.

## Notas

- **Costos:** Vercel y Railway tienen tier inicial gratuito/bajo. **Groq** es gratis
  con límites de velocidad — sin costo por tokens mientras no superes su free tier.
- **Google OAuth (opcional):** credenciales en Google Cloud + provider `Google` en
  `apps/web/auth.js` (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`).
- **Multi-miembro:** hoy el registro crea 1 workspace + 1 Owner. Invitaciones/roles
  quedan como siguiente iteración.

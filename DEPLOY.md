# Despliegue — ConsumerMind (Vercel + Railway)

Arquitectura: **3 piezas**.
- **apps/web** (Next.js) → **Vercel**
- **apps/server** (Express) → **Railway**
- **PostgreSQL** → **Railway** (base gestionada)

El navegador habla solo con Vercel (`/api/...`); Vercel (server-side) reenvía al
backend de Railway con un JWT. La `ANTHROPIC_API_KEY` vive **solo** en Railway.

```
Navegador ──► Vercel (Next.js + NextAuth + proxy /api) ──► Railway (Express + motor) ──► PostgreSQL
                                                                   │
                                                                   └──► Claude API (API key aquí)
```

---

## 1) Backend + base de datos en Railway

1. Crea un proyecto en [railway.app](https://railway.app) → **Deploy from GitHub repo** → elige `consumermind`.
2. En el servicio, **Settings → Root Directory = `apps/server`** (usa el `Dockerfile` incluido).
3. Añade un **PostgreSQL**: en el proyecto → **New → Database → PostgreSQL**. Railway expone `DATABASE_URL`.
4. **Variables** del servicio backend:
   | Variable | Valor |
   |---|---|
   | `ANTHROPIC_API_KEY` | tu clave real de Anthropic |
   | `CONSUMERMIND_MODEL` | `claude-sonnet-4-6` |
   | `DATABASE_URL` | referencia a la del Postgres de Railway (`${{Postgres.DATABASE_URL}}`) |
   | `BACKEND_JWT_SECRET` | una cadena larga y aleatoria |
   | `BACKEND_JWT_TTL` | `7d` |
   | `WEB_ORIGIN` | la URL de Vercel (p. ej. `https://consumermind.vercel.app`) |
   | `PORT` | Railway lo inyecta solo; el server usa `process.env.PORT` |
5. **Migra la base** (una vez): en el servicio backend → pestaña de comando/shell, ejecuta
   `npm run db:migrate` (crea tablas + RLS). Si la conexión exige SSL, añade `?sslmode=require` a `DATABASE_URL`.
6. Copia la **URL pública** del backend (p. ej. `https://consumermind-api.up.railway.app`).

## 2) Frontend en Vercel

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa `consumermind`.
2. **Root Directory = `apps/web`** (Vercel detecta Next.js).
3. **Environment Variables**:
   | Variable | Valor |
   |---|---|
   | `API_URL` | la URL pública del backend de Railway |
   | `AUTH_SECRET` | una cadena larga y aleatoria (`npx auth secret`) |
   | `AUTH_TRUST_HOST` | `true` |
4. **Deploy.** Tu app queda en `https://<proyecto>.vercel.app`.
5. Vuelve a Railway y pon esa URL en `WEB_ORIGIN`.

## 3) Dominio propio

- Compra un dominio (Cloudflare, Namecheap…).
- **Frontend:** en Vercel → **Settings → Domains → Add** `tudominio.com` → añade los registros DNS que indique. HTTPS automático.
- **Backend:** en Railway → **Settings → Networking → Custom Domain** `api.tudominio.com` → registro CNAME.
- Actualiza en Vercel `API_URL=https://api.tudominio.com` y en Railway `WEB_ORIGIN=https://tudominio.com`.

---

## Comprobación post-deploy

1. `https://TU-BACKEND/health` → `{ "ok": true }`.
2. En la web: **Crear cuenta** → entra a **Strategy** → analiza un caso → debe persistir y aparecer en **Copy Studio**.
3. Sin sesión, abrir `/strategy` debe redirigir a `/login`.

## Notas

- **Costos:** Vercel y Railway tienen tier inicial gratuito/bajo; el gasto variable real es el **consumo de Claude API** por uso.
- **Google OAuth (opcional, más adelante):** crear credenciales en Google Cloud y añadir el provider `Google` en `apps/web/auth.js` con `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
- **Multi-miembro:** hoy el registro crea 1 workspace + 1 Owner. Invitaciones/roles adicionales quedan como siguiente iteración.

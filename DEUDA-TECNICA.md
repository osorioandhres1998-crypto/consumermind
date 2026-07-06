# Deuda técnica y de producto — Plan de mejoras

> Documento de trabajo para validar y priorizar. **No implementado todavía.**
> Generado tras una auditoría del estado del proyecto a la fecha de este commit.
> Marca cada ítem como aprobado/descartado/pospuesto antes de ejecutar.

---

## Cómo usar este documento

Cada ítem tiene: **qué falta**, **por qué importa**, **esfuerzo estimado** y **estado** (a completar por el dueño del proyecto: ✅ Aprobado / ❌ Descartado / ⏸️ Pospuesto).

---

## Bloque 1 — Seguridad (prioridad alta)

### 1.1 Revocación real de miembros del equipo
- **Qué falta:** al quitar a un miembro del workspace, su JWT sigue siendo válido hasta que expire (hasta 7 días). No hay invalidación de sesión.
- **Por qué importa:** es el hueco de seguridad más serio hoy — alguien removido conserva acceso.
- **Propuesta:** verificar el usuario contra la base de datos en cada request (no solo confiar en el JWT), o acortar el TTL del token y usar refresh tokens.
- **Esfuerzo:** M
- **Estado:** ✅ Implementado — `requireWorkspace` verifica en DB en cada request (y toma el rol fresco, así los cambios de rol también aplican al instante); el Validator Python hace el mismo check antes de aceptar simulaciones.

### 1.2 Rate-limit en autenticación
- **Qué falta:** `/api/auth/login`, `/api/auth/register` y `/api/auth/forgot-password` no tienen límite de intentos. Solo el copiloto tiene rate-limit hoy.
- **Por qué importa:** permite ataques de fuerza bruta sin fricción.
- **Propuesta:** reutilizar el patrón de rate-limit ya construido para el copiloto (`api/routes/copilot.routes.js`) en las rutas de auth.
- **Esfuerzo:** S
- **Estado:** ✅ Implementado — `api/middleware/rate-limit.js`, clave IP+email (todas las requests llegan desde el proxy de Vercel, la IP sola no distingue usuarios). Límites/min: login 10, register 5, forgot 5, reset 10.

### 1.3 Rotación de secretos
- **Qué falta:** `BACKEND_JWT_SECRET` y la contraseña de Postgres circularon en texto plano durante el desarrollo (capturas, mensajes).
- **Por qué importa:** riesgo bajo mientras sea uso interno, pero debe resolverse antes de cualquier usuario externo real.
- **Propuesta:** generar nuevas credenciales en Railway (Postgres) y un nuevo `BACKEND_JWT_SECRET`, actualizar variables en ambos servicios (server + validator) y en Vercel si aplica.
- **Esfuerzo:** S
- **Estado:** ⏸️ Pendiente de acción del dueño (pasos exactos entregados; requiere consola de Railway).

### 1.4 CORS abierto en el Validator
- **Qué falta:** `apps/validator/app/main.py` permite `allow_origins=["*"]`.
- **Por qué importa:** en un servicio con datos de tenant, restringir origen es una buena práctica básica.
- **Propuesta:** restringir a `WEB_ORIGIN` (mismo patrón que el backend Express).
- **Esfuerzo:** S
- **Estado:** ✅ Implementado — restringe a `WEB_ORIGIN` si la variable existe en el servicio del validator; sin ella (desarrollo local) queda abierto.

### 1.5 Validación de inputs con esquema
- **Qué falta:** las rutas Express validan campos manualmente (`if (!x) return 400`) en vez de un validador declarativo.
- **Por qué importa:** consistencia, menos bugs de validación, mejor mantenibilidad.
- **Propuesta:** introducir `zod` (o similar) en los endpoints de escritura más críticos (proyectos, experimentos, snapshots).
- **Esfuerzo:** M
- **Estado:** ✅ Implementado — validador declarativo propio (`lib/validate.js`, sin dependencia nueva para no tocar el lock de Railway) aplicado a proyectos (POST/PATCH), experimentos (POST/PATCH) y snapshots (POST).

---

## Bloque 2 — Operación e infraestructura (prioridad alta)

### 2.1 Backups de la base de datos
- **Qué falta:** no hay ningún respaldo de PostgreSQL fuera de Railway.
- **Por qué importa:** un `DELETE` accidental o una migración mala borra datos sin forma de recuperarlos.
- **Propuesta:** script de `pg_dump` semanal (manual o cron) descargado localmente; evaluar plan de Railway con backups automáticos si el presupuesto lo permite.
- **Esfuerzo:** S
- **Estado:** ☐

### 2.2 CI básico (GitHub Actions)
- **Qué falta:** los casos de prueba ancla (`landing-engine.test.js`, build de Next.js) se corren manualmente y a veces se olvidan.
- **Por qué importa:** varios de los tropiezos de deploy de esta sesión se habrían detectado antes de llegar a Railway.
- **Propuesta:** workflow de GitHub Actions que en cada push a `main` corra: `node tests/landing-engine.test.js` (apps/server) + `npm run build` (apps/web).
- **Esfuerzo:** S
- **Estado:** ☐

### 2.3 Entorno de staging
- **Qué falta:** no existe separación entre desarrollo y producción; todo se prueba directamente en la app real.
- **Por qué importa:** varios experimentos de esta sesión (migraciones, variables de entorno) se probaron en vivo, con riesgo de downtime.
- **Propuesta:** duplicar el proyecto de Railway (o crear un segundo entorno) para probar cambios de infraestructura antes de aplicarlos a producción.
- **Esfuerzo:** M
- **Estado:** ☐

### 2.4 Observabilidad (errores + uptime)
- **Qué falta:** no hay alertas automáticas; los problemas se detectan porque el usuario los reporta.
- **Por qué importa:** reduce el tiempo de detección de fallos de horas a minutos.
- **Propuesta:** Sentry (gratis, tier básico) para errores de backend/frontend + UptimeRobot (gratis) monitoreando `/health` de ambos backends.
- **Esfuerzo:** S
- **Estado:** ☐

### 2.5 Repo fuera de OneDrive
- **Qué falta:** el proyecto vive en una carpeta sincronizada por OneDrive (`Desktop\Demo - MVP`), lo que ya causó un error de build (`EINVAL: readlink`).
- **Por qué importa:** `node_modules` y `.next` no deberían vivir en carpetas con sincronización activa — causa corrupciones intermitentes.
- **Propuesta:** mover el proyecto a una ruta local sin sincronización (ej. `C:\dev\master-tool`) y volver a clonar/configurar ahí.
- **Esfuerzo:** S
- **Estado:** ☐

---

## Bloque 3 — Producto y marketing (prioridad alta para presentar el proyecto)

### 3.1 Landing pública del producto
- **Qué falta:** no existe una landing que explique y venda el master-tool en sí. El `index.html` del repo es un preview antiguo de otra versión.
- **Por qué importa:** es lo primero que buscaría un reclutador o un cliente potencial; irónico no tener una landing propia teniendo un Landing Analyzer.
- **Propuesta:** landing simple con el propio sistema de diseño de la app, aplicando sus propios principios de conversión.
- **Esfuerzo:** M
- **Estado:** ☐

### 3.2 Analítica de uso propio
- **Qué falta:** no se mide qué módulos se usan más, dónde abandonan los usuarios, tiempo en cada herramienta.
- **Por qué importa:** sin esto, las decisiones de producto son por intuición — lo mismo que la app critica en otros.
- **Propuesta:** integrar PostHog (tier gratuito) para trackear eventos clave (crear proyecto, ejecutar cada módulo, exportar informe).
- **Esfuerzo:** S-M
- **Estado:** ☐

### 3.3 Onboarding / dashboard vacío
- **Qué falta:** un usuario nuevo ve "Aún no tienes proyectos" sin ninguna guía.
- **Por qué importa:** el primer login es el momento más crítico de activación; hoy no hay nada que reduzca la fricción inicial.
- **Propuesta:** proyecto demo precargado al registrarse, o un tour guiado de 3 pasos.
- **Esfuerzo:** M
- **Estado:** ☐

### 3.4 Exportación accionable del copy generado
- **Qué falta:** Copy Studio genera headlines/CTAs pero no los exporta en formatos listos para usar (Meta Ads, Google RSA con límites de caracteres, UTMs).
- **Por qué importa:** es el "último kilómetro" que un marketer usa a diario; hoy el copy se queda dentro de la app.
- **Propuesta:** botón de exportación con formatos específicos por plataforma publicitaria.
- **Esfuerzo:** M
- **Estado:** ☐

### 3.5 Alertas proactivas
- **Qué falta:** el valor de medir MER/ROAS mensualmente se pierde si nadie revisa el dashboard a tiempo.
- **Por qué importa:** convierte la herramienta de "consulta pasiva" a "asesor activo".
- **Propuesta:** email automático (ya hay integración con Resend) cuando una métrica cae fuera de su banda sana.
- **Esfuerzo:** M
- **Estado:** ☐

### 3.6 Validación de benchmarks contra casos reales
- **Qué falta:** los benchmarks (ProfitGuard, Landing Analyzer) nunca se validaron contra negocios reales, aunque la spec original lo definía como su "métrica ancla de credibilidad".
- **Por qué importa:** sin esta validación, no hay evidencia de que el diagnóstico automático coincida con el criterio de un analista humano.
- **Propuesta:** correr los números de 2-3 negocios reales (del propio dueño o conocidos) y comparar el diagnóstico de la app contra una evaluación manual.
- **Esfuerzo:** S (pero requiere datos reales de terceros)
- **Estado:** ☐

---

## Resumen priorizado (si solo se pudieran hacer 3 cosas)

1. **Bloque 1.1 + 1.2** — Rate-limit en auth y revocación real de miembros (seguridad real, ~medio día).
2. **Bloque 2.1 + 2.2** — CI con casos ancla + backup semanal (protege todo lo construido, ~medio día).
3. **Bloque 3.1 + 3.3** — Landing pública del producto + proyecto demo precargado (lo que más vende en una entrevista, ~1 día).

---

## Notas

- Este documento es un **plan a validar**, no una lista de tareas en ejecución. Ningún ítem se ha implementado.
- Al aprobar un bloque, avisar explícitamente para comenzar (siguiendo el mismo patrón de aprobación usado en el resto del proyecto: "PLAN APROBADO" o similar).
- Actualizar el estado (☐ → ✅/❌/⏸️) a medida que se decida sobre cada ítem.

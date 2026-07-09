/**
 * ANALÍTICA DE USO — PostHog (Bloque 3.2 de DEUDA-TECNICA.md)
 * ------------------------------------------------------------
 * Degradación elegante: si NEXT_PUBLIC_POSTHOG_KEY no está configurada,
 * init() no hace nada y track() es un no-op — la app funciona igual sin
 * analítica (mismo patrón que PageSpeed/Resend/Groq opcionales).
 *
 * NOTA de seguridad: la key de proyecto de PostHog es PÚBLICA por diseño
 * (clave de ingesta write-only para el navegador, NO un secreto). Por eso
 * usa el prefijo NEXT_PUBLIC_* — esto NO viola la regla inviolable #1 del
 * CLAUDE.md, que prohíbe exponer claves de proveedores de IA / secretos.
 */

import posthog from 'posthog-js';

let ready = false;

export function initAnalytics() {
  if (ready || typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // sin key → analítica desactivada, sin errores
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false, // lo capturamos manualmente por ruta (App Router)
    person_profiles: 'identified_only',
  });
  ready = true;
}

/** Registra un evento de negocio (no-op si la analítica no está activa). */
export function track(event, props = {}) {
  if (!ready) return;
  try { posthog.capture(event, props); } catch (_) { /* nunca romper la UI por analítica */ }
}

/** Asocia los eventos al usuario logueado (sin PII innecesaria). */
export function identify(userId, traits = {}) {
  if (!ready || !userId) return;
  try { posthog.identify(userId, traits); } catch (_) { /* noop */ }
}

export function trackPageview(pathname) {
  if (!ready) return;
  try { posthog.capture('$pageview', { $current_url: pathname }); } catch (_) { /* noop */ }
}

/**
 * PAGESPEED INSIGHTS — Core Web Vitals reales (N1-C del plan enterprise)
 * ------------------------------------------------------------
 * Llama a la API pública de Google PageSpeed Insights (gratuita; con
 * PAGESPEED_API_KEY sube la cuota, pero funciona sin ella). Se ejecuta en
 * paralelo al análisis del motor y NUNCA bloquea ni rompe el análisis:
 * si falla o no hay URL pública, el motor sigue con el proxy de peso HTML
 * (degradación elegante — mismo patrón que Validator con Claude/heurístico).
 *
 * Solo aplica a análisis por URL (no a HTML pegado, que no tiene URL pública).
 */

const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const TIMEOUT_MS = 20000;

async function fetchVitals(url) {
  if (!url || !/^https?:\/\//.test(url)) return null;

  const params = new URLSearchParams({ url, strategy: 'mobile', category: 'performance' });
  if (process.env.PAGESPEED_API_KEY) params.set('key', process.env.PAGESPEED_API_KEY);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${PSI_URL}?${params}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();

    const perf = data?.lighthouseResult?.categories?.performance?.score;
    const audits = data?.lighthouseResult?.audits || {};
    const lcpMs = audits['largest-contentful-paint']?.numericValue;
    const cls = audits['cumulative-layout-shift']?.numericValue;
    const inpMs = audits['interactive']?.numericValue ?? audits['max-potential-fid']?.numericValue;

    if (perf == null && lcpMs == null) return null; // respuesta sin datos útiles

    return {
      performanceScore: perf != null ? Math.round(perf * 100) : null,
      lcpSeconds: lcpMs != null ? +(lcpMs / 1000).toFixed(2) : null,
      cls: cls != null ? +cls.toFixed(3) : null,
      inpSeconds: inpMs != null ? +(inpMs / 1000).toFixed(2) : null,
      source: 'pagespeed',
    };
  } catch (_) {
    return null; // timeout u otro error: se degrada al proxy, sin romper el análisis
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchVitals };

/**
 * DIMENSIÓN 5: TÉCNICA (peso 15%)
 * Fuente: "Anatomía" §5 (carga <2s: 1s de demora = -7% conversión;
 * mobile-first; sellos de seguridad cerca del formulario; message match).
 *
 * N1-C: si ctx.vitals trae datos reales de PageSpeed Insights, se evalúan
 * LCP/CLS/performance reales. Si no (API falló, sin URL pública, o HTML
 * pegado), se degrada al proxy de peso del HTML — el análisis nunca se
 * bloquea por una dependencia externa (mismo patrón que Validator).
 */

const { pageText, findAny, mainFormFields } = require('../helpers');

function evaluate($, ctx) {
  const checks = [];
  const add = (id, label, pass, evidence, impact) => checks.push({ id, label, pass, evidence, impact });

  // Mobile-first
  const viewport = $('meta[name="viewport"]').attr('content') || '';
  add('viewport', 'Meta viewport (mobile-first)', viewport.includes('width'),
    viewport ? `viewport: "${viewport}"` : 'Sin <meta name="viewport">.',
    'El diseño debe ser impecable en smartphones.');

  // HTTPS
  const https = (ctx.url || '').startsWith('https://');
  add('https', 'Servida por HTTPS', https,
    ctx.url ? ctx.url.split('/').slice(0, 3).join('/') : 'URL no disponible (HTML pegado).');

  // Velocidad: vitals reales (PageSpeed) si están disponibles; si no, proxy de peso HTML.
  const v = ctx.vitals;
  if (v) {
    if (v.lcpSeconds != null) {
      add('lcp', 'LCP — Largest Contentful Paint (<2.5s)', v.lcpSeconds < 2.5,
        `${v.lcpSeconds}s (móvil, PageSpeed Insights).`,
        'Una demora de 1 segundo reduce conversiones un 7% (documentado).');
    }
    if (v.cls != null) {
      add('cls', 'CLS — Cumulative Layout Shift (<0.1)', v.cls < 0.1,
        `${v.cls} (móvil, PageSpeed Insights).`,
        'Los saltos de layout frustran al usuario justo antes de convertir.');
    }
    if (v.performanceScore != null) {
      add('perf_score', 'Score de rendimiento de Google (≥50)', v.performanceScore >= 50,
        `${v.performanceScore}/100 (Lighthouse móvil).`);
    }
  } else {
    const kb = Math.round((ctx.bytes || 0) / 1024);
    add('peso', 'HTML liviano (<500 KB)', ctx.bytes ? ctx.bytes < 500 * 1024 : true,
      ctx.bytes ? `${kb} KB de HTML (proxy de velocidad; sin datos reales de Google).` : 'Tamaño no disponible (HTML pegado).',
      'Una demora de 1 segundo reduce conversiones un 7% (documentado).');
  }

  // Lazy loading de imágenes
  const imgs = $('img').length;
  const lazy = $('img[loading="lazy"]').length;
  add('lazy', 'Imágenes con carga diferida', imgs <= 4 || lazy > 0,
    imgs ? `${lazy}/${imgs} imágenes con loading="lazy".` : 'Sin imágenes.');

  // Sellos de seguridad cerca del formulario
  let seals = false;
  const form = mainFormFields($);
  if (form) {
    const around = $(form.form).parent().text().replace(/\s+/g, ' ').toLowerCase();
    seals = !!findAny(around, ['ssl', 'gdpr', 'rgpd', 'pci', 'seguro', 'protegido', 'encriptado', 'cifrado']);
  }
  add('sellos', 'Sellos de seguridad junto al formulario', form ? seals : true,
    form ? (seals ? 'Menciones de seguridad cerca del formulario.' : 'El formulario no muestra señales de seguridad.') : 'No aplica (sin formulario).',
    'Las insignias de seguridad van cerca de formularios de pago/contacto.');

  // Metadatos para compartir / message match básico
  const og = $('meta[property="og:title"]').attr('content');
  const title = $('title').text().trim();
  add('metadata', 'Título y metadatos presentes', !!title && !!og,
    `title: ${title ? 'sí' : 'no'} · og:title: ${og ? 'sí' : 'no'}`,
    'El titular debe coincidir con la promesa del anuncio (message match).');

  return checks;
}

module.exports = { evaluate };

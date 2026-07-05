/**
 * DIMENSIÓN 3: CARGA COGNITIVA / UX (peso 20%)
 * Fuente: "Optimización de la Carga Cognitiva" + "Anatomía" (formularios
 * de 3 campos convierten 26% mejor que 7+; navegación "naked"; FAQs en
 * acordeón; memoria de trabajo ≈ 4 unidades).
 */

const { pageText, ctaTexts, mainFormFields } = require('../helpers');

function evaluate($) {
  const checks = [];
  const add = (id, label, pass, evidence, impact) => checks.push({ id, label, pass, evidence, impact });

  // Formulario corto (≤3 campos)
  const form = mainFormFields($);
  if (form) {
    add('form_corto', 'Formulario corto (≤3 campos)', form.count <= 3,
      `Formulario principal con ${form.count} campos.`,
      'Formularios de 3 campos convierten 26% mejor que los de 7+ (documentado).');
  } else {
    add('form_corto', 'Formulario de captura presente', false,
      'No se detectó ningún formulario en la página.',
      'Sin formulario no hay captura directa de leads (puede ser intencional si el CTA es externo).');
  }

  // Navegación "naked" (sin rutas de escape)
  const navLinks = $('header a[href], nav a[href]').filter((_, a) => {
    const h = $(a).attr('href') || '';
    return h && !h.startsWith('#') && h !== '/';
  }).length;
  add('naked_nav', 'Navegación "naked" (sin menú de escape)', navLinks <= 3,
    `${navLinks} enlaces de navegación que sacan de la página.`,
    'Eliminar menús y enlaces externos evita abandonos sin convertir.');

  // Foco: pocos CTAs distintos
  const distinct = [...new Set(ctaTexts($).map((t) => t.toLowerCase()))];
  add('cta_foco', 'CTAs enfocados (1-2 acciones distintas)', distinct.length > 0 && distinct.length <= 2,
    distinct.length ? `${distinct.length} textos de CTA distintos: ${distinct.slice(0, 4).join(' · ')}` : 'Sin CTAs.',
    'Cada acción adicional diluye la conversión (una página, un objetivo).');

  // FAQs en acordeón (no texto plano interminable)
  const accordion = $('details, [class*="accordion" i]').length > 0;
  const faqText = pageText($).includes('preguntas frecuentes') || pageText($).includes('faq');
  add('faq_acordeon', 'FAQs colapsables (acordeón)', accordion || !faqText,
    accordion ? 'Acordeón detectado.' : faqText ? 'Hay FAQs pero en texto plano (recarga visual).' : 'No aplica (sin FAQs).');

  // Enlaces externos salientes en el cuerpo
  const externals = $('a[href^="http"]').filter((_, a) => {
    const h = $(a).attr('href') || '';
    return !h.includes('#');
  }).length;
  add('externos', 'Pocas fugas a sitios externos', externals <= 6,
    `${externals} enlaces http externos en la página.`,
    'La carga extrínseca (distracciones) dispara el rebote.');

  return checks;
}

module.exports = { evaluate };

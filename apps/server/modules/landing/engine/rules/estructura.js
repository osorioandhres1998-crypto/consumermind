/**
 * DIMENSIÓN 1: ESTRUCTURA / ANATOMÍA (peso 25%)
 * Fuente: "Framework definitivo" de 10 secciones (Informe Avanzado CRO §9,
 * Anatomía de una Landing Page §1-2). Cada check busca una sección del framework.
 */

const { pageText, findAny, ctaTexts, ev } = require('../helpers');

function evaluate($) {
  const text = pageText($);
  const checks = [];
  const add = (id, label, pass, evidence, impact) => checks.push({ id, label, pass, evidence, impact });

  // Hero: titular H1 (el "blink test" se decide en segundos)
  const h1 = $('h1').first().text().trim();
  add('hero_h1', 'Titular principal (H1) con propuesta de valor', !!h1,
    h1 ? `H1: "${ev(h1)}"` : 'No se encontró ningún <h1>.',
    'El titular decide el "blink test": los usuarios deciden en segundos si se quedan.');

  // Subtítulo de apoyo cerca del H1
  const sub = $('h1').first().nextAll('p, h2').first().text().trim()
    || $('h1').first().parent().find('p').first().text().trim();
  add('hero_sub', 'Subtítulo de apoyo bajo el titular', !!sub,
    sub ? `Subtítulo: "${ev(sub)}"` : 'No hay párrafo/subtítulo inmediato tras el H1.');

  // Hero shot (imagen o video temprano en el DOM)
  const heroMedia = $('img, video, picture, [style*="background-image"]').slice(0, 12).length > 0
    && ($('img').first().length > 0 || $('video').first().length > 0);
  add('hero_media', 'Imagen o video de héroe', heroMedia,
    heroMedia ? 'Se detectó media en la parte inicial del documento.' : 'Sin imagen/video hero detectable.',
    'Ayuda a visualizar el resultado final; caras reales > fotos de stock.');

  // CTA above the fold (aprox.: en el primer tercio de nodos)
  const ctas = ctaTexts($);
  add('hero_cta', 'CTA visible (botón con texto)', ctas.length > 0,
    ctas.length ? `CTAs: ${ctas.slice(0, 3).map((c) => `"${ev(c, 30)}"`).join(', ')}` : 'Sin botones/CTA detectables.');

  // Barra de logotipos (autoridad instantánea)
  const logoImgs = $('img[alt*="logo" i], img[src*="logo" i], [class*="logo" i] img').length;
  add('logos', 'Barra de logotipos de clientes/medios', logoImgs >= 2,
    logoImgs ? `${logoImgs} imágenes tipo logo.` : 'No se detectaron logos de terceros.');

  // Zona del problema
  const prob = findAny(text, ['problema', 'te pasa', 'cansado de', 'frustra', 'sin resultados', 'struggle', 'pain']);
  add('problema', 'Sección de problema (conexión con el dolor)', !!prob,
    prob ? `Menciona: "${prob}"` : 'No se detecta lenguaje de problema/dolor.');

  // Presentación de la solución
  const sol = findAny(text, ['solución', 'soluciona', 'cómo funciona', 'how it works', 'presentamos', 'conoce ']);
  add('solucion', 'Presentación de la solución', !!sol,
    sol ? `Menciona: "${sol}"` : 'No se detecta sección de solución.');

  // Bloque de beneficios (bullets)
  let benefitList = false;
  $('ul, ol').each((_, l) => { if ($(l).find('li').length >= 3) benefitList = true; });
  add('beneficios', 'Bloque de beneficios (lista de 3+ puntos)', benefitList || !!findAny(text, ['beneficio']),
    benefitList ? 'Lista con 3+ viñetas detectada.' : 'Sin listas de beneficios claras.',
    'Los bullets conectan características con transformaciones reales.');

  // Prueba social
  const social = $('[class*="testimonial" i], [class*="review" i], blockquote').length > 0
    || !!findAny(text, ['testimonio', 'reseña', 'opinión de', 'clientes felices', '★', '⭐']);
  add('social', 'Sección de prueba social', social,
    social ? 'Testimonios/reseñas detectados.' : 'Sin testimonios ni reseñas detectables.',
    'La confianza es el mayor factor de conversión.');

  // Oferta / precio
  const offer = !!findAny(text, [/\$\s?[\d.,]+/, 'precio', 'planes', 'pricing', 'gratis', 'oferta']);
  add('oferta', 'Oferta comercial visible (precio/planes)', offer,
    offer ? 'Se detectó precio u oferta.' : 'No se detecta precio ni oferta.');

  // FAQs
  const faqs = $('details, [class*="accordion" i], [class*="faq" i]').length > 0
    || !!findAny(text, ['preguntas frecuentes', 'faq']);
  add('faqs', 'Sección de FAQs', faqs,
    faqs ? 'FAQs detectadas.' : 'Sin FAQs.',
    'Resuelven objeciones de última hora sin recargar la página.');

  // CTA final (botón en el último tramo del documento)
  const allButtons = $('button, input[type=submit], a[class*="btn"], a[class*="cta"]');
  const lastIsLate = allButtons.length >= 2; // hay más de un CTA repartido
  add('cta_final', 'CTA final de cierre', lastIsLate,
    lastIsLate ? `${allButtons.length} CTAs a lo largo de la página.` : 'Solo hay un CTA (o ninguno) en toda la página.');

  return checks;
}

module.exports = { evaluate };

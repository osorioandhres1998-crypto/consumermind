/**
 * DIMENSIÓN 4: COPYWRITING (peso 15%)
 * Fuente: "Estrategias de Conversión y Marcos de Persuasión" (4U, AIDA/PAS)
 * + "Anatomía" (titular = beneficio, CTA accionable, microcopy, message match).
 * Heurísticas de texto: cada check muestra su evidencia para auditar
 * falsos positivos (decisión del plan, motor determinista sin IA).
 */

const { pageText, findAny, ctaTexts, mainFormFields, ev } = require('../helpers');

const CTA_GENERICOS = ['enviar', 'submit', 'click aquí', 'clic aquí', 'aceptar', 'ok', 'ir', 'entrar'];
const CTA_ACCION = ['obtén', 'obtener', 'descarga', 'descargar', 'empieza', 'empezar', 'comienza', 'prueba', 'probar',
  'quiero', 'reserva', 'agenda', 'consigue', 'accede', 'solicita', 'recibe', 'crear', 'regístrate', 'start', 'get'];

function evaluate($) {
  const text = pageText($);
  const checks = [];
  const add = (id, label, pass, evidence, impact) => checks.push({ id, label, pass, evidence, impact });

  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const h1l = h1.toLowerCase();

  // Titular orientado a beneficio (2ª persona / verbo de resultado / número)
  const benefit = !!h1 && (
    !!findAny(h1l, [' tu ', ' tus ', ' te ', 'consigue', 'logra', 'aumenta', 'ahorra', 'duplica', 'gana', 'mejora', 'deja de']) ||
    /\d/.test(h1)
  );
  add('titular_beneficio', 'Titular orientado a beneficio', benefit,
    h1 ? `H1: "${ev(h1)}"` : 'Sin H1 que evaluar.',
    'El titular debe vender el beneficio final, no la función.');

  // Titular ultra-específico (4U): longitud contenida
  const words = h1 ? h1.split(/\s+/).length : 0;
  add('titular_4u', 'Titular conciso (≤12 palabras)', !!h1 && words <= 12,
    h1 ? `${words} palabras.` : 'Sin H1.',
    'Marco 4U: útil, único, urgente y ultra-específico.');

  // CTA accionable y con beneficio (no genérico)
  const ctas = ctaTexts($).map((t) => t.toLowerCase());
  const generic = ctas.find((t) => CTA_GENERICOS.some((g) => t === g || t.startsWith(g + ' ') === false && t === g));
  const actionable = ctas.some((t) => CTA_ACCION.some((a) => t.includes(a)));
  add('cta_accionable', 'CTA orientado a acción y beneficio', actionable && !ctas.includes('enviar'),
    ctas.length ? `CTAs: ${ctas.slice(0, 3).map((c) => `"${ev(c, 30)}"`).join(', ')}` : 'Sin CTAs.',
    '"Obtén mi guía gratis" convierte más que "Enviar".');

  // Microcopy anti-fricción cerca del formulario
  let micro = null;
  const form = mainFormFields($);
  if (form) {
    const around = $(form.form).text().replace(/\s+/g, ' ').toLowerCase();
    micro = findAny(around, ['spam', 'no compartimos', 'privacidad', 'seguro', '30 segundos', 'un minuto', 'cancela cuando', 'sin tarjeta']);
  }
  add('microcopy', 'Microcopy anti-fricción junto al formulario', !!micro,
    micro ? `Encontrado: "${micro}"` : form ? 'El formulario no tiene textos de tranquilidad.' : 'No aplica (sin formulario).');

  // Lenguaje de transformación (orientado a resultados)
  const transf = findAny(text, ['resultados', 'transforma', 'convierte', 'crece', 'multiplica', 'en solo', 'sin necesidad de']);
  add('copy_resultados', 'Copy orientado a resultados', !!transf,
    transf ? `Ej.: "${transf}"` : 'El copy no habla de resultados/transformación.');

  return checks;
}

module.exports = { evaluate };

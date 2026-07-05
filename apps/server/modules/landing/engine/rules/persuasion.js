/**
 * DIMENSIÓN 2: PERSUASIÓN — los 9 principios (peso 25%)
 * Fuente: "Gatillos Mentales para la Alta Conversión Digital" (impactos
 * documentados: prueba social +34% B2B / +12% e-commerce; urgencia +8-14%).
 * Cada principio se reporta como activo/inactivo con su evidencia — esta
 * lista alimenta el marcador "Principios activos X/9" de la UI.
 */

const { pageText, findAny, ev } = require('../helpers');

function evaluate($) {
  const text = pageText($);
  const checks = [];
  const add = (id, label, pass, evidence, impact) => checks.push({ id, label, pass, evidence, impact });

  // 1. Prueba social
  const testimonials = $('[class*="testimonial" i], blockquote').length;
  const counter = findAny(text, [/\+?\s?[\d.,]+\s?(clientes|usuarios|empresas|profesionales|estudiantes)/]);
  add('prueba_social', 'Prueba social', testimonials > 0 || !!counter,
    testimonials ? `${testimonials} testimonios/citas.` : counter ? `Contador: "${counter}"` : 'Sin testimonios ni contadores.',
    '+34% conversión en B2B, +12% en e-commerce (documentado).');

  // 2. Autoridad
  const authority = $('img[alt*="logo" i], img[src*="logo" i]').length >= 2
    || !!findAny(text, ['certificad', 'iso ', 'soc 2', 'premio', 'featured in', 'aparecido en', 'avalado']);
  add('autoridad', 'Autoridad', authority,
    authority ? 'Logos/certificaciones/premios detectados.' : 'Sin señales de autoridad (logos, sellos, premios).');

  // 3. Escasez y urgencia
  const scarcity = findAny(text, ['quedan', 'últimas', 'cupos limitados', 'stock limitado', 'solo hoy', 'termina', 'cuenta regresiva', 'countdown'])
    || $('[class*="countdown" i], [class*="timer" i]').length > 0;
  add('escasez', 'Escasez / urgencia', !!scarcity,
    scarcity ? `Señal: "${typeof scarcity === 'string' ? scarcity : 'countdown en la página'}"` : 'Sin límites de tiempo o stock.',
    'Límites temporales claros: +8-14% en conversión (documentado).');

  // 4. Reciprocidad (lead magnet)
  const recip = findAny(text, ['gratis', 'gratuito', 'sin costo', 'free']) &&
    findAny(text, ['descarga', 'ebook', 'e-book', 'guía', 'plantilla', 'auditoría', 'demo', 'prueba']);
  add('reciprocidad', 'Reciprocidad (recurso gratuito)', !!recip,
    recip ? 'Ofrece un recurso gratuito antes de pedir conversión.' : 'No se detecta lead magnet gratuito.');

  // 5. Consistencia y compromiso (multi-paso / quiz)
  const commit = $('form [class*="step" i], form [data-step], [class*="wizard" i], [class*="quiz" i]').length > 0
    || !!findAny(text, ['paso 1', 'quiz', 'responde estas']);
  add('compromiso', 'Consistencia y compromiso (multi-paso/quiz)', !!commit,
    commit ? 'Formulario multi-etapa o quiz detectado.' : 'Sin flujos de compromiso gradual.');

  // 6. Aversión a la pérdida
  const loss = findAny(text, ['no dejes', 'no pierdas', 'te estás perdiendo', 'deja de perder', 'antes de que', 'tu competencia']);
  add('aversion_perdida', 'Aversión a la pérdida', !!loss,
    loss ? `Copy: "${loss}"` : 'Sin copy de coste de oportunidad.',
    'El dolor de perder es 2× más intenso que el placer de ganar.');

  // 7. Anclaje (precio tachado)
  const anchor = $('del, s, strike, [class*="old-price" i], [class*="strikethrough" i]').length > 0
    || !!findAny(text, [/antes[:\s]+\$?[\d.,]+/]);
  add('anclaje', 'Anclaje de precio', anchor,
    anchor ? 'Precio original tachado / "antes" detectado.' : 'Sin ancla de precio visible.');

  // 8. Fluidez cognitiva (párrafos digeribles)
  let pCount = 0, wSum = 0;
  $('p').each((_, p) => { const w = $(p).text().trim().split(/\s+/).filter(Boolean).length; if (w > 0) { pCount++; wSum += w; } });
  const avgWords = pCount ? wSum / pCount : 0;
  add('fluidez', 'Fluidez cognitiva (texto digerible)', pCount > 0 && avgWords <= 40,
    pCount ? `Promedio ${avgWords.toFixed(0)} palabras por párrafo (${pCount} párrafos).` : 'Sin párrafos de texto.',
    'La facilidad de procesamiento genera confianza (Sistema 1).');

  // 9. Curiosidad
  const curiosity = findAny(text, ['descubre', 'secreto', 'lo que nadie', 'pocos conocen', 'la estrategia que', 'no sabías']);
  add('curiosidad', 'Curiosidad (brecha de información)', !!curiosity,
    curiosity ? `Gancho: "${curiosity}"` : 'Sin ganchos de curiosidad.');

  return checks;
}

module.exports = { evaluate };

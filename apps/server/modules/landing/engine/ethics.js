/**
 * SEMÁFORO ÉTICO — dark patterns con riesgo regulatorio (GDPR/DMA)
 * ------------------------------------------------------------
 * Checks deterministas: detectan PATRONES OBSERVABLES, no intenciones.
 * Veredictos con lenguaje prudente (decisión del plan §9):
 *   'ok'      → persuasión legítima, sin riesgo detectado
 *   'revisar' → señal ambigua, conviene verificar
 *   'alerta'  → patrón con riesgo regulatorio, requiere revisión legal
 */

const { pageText, findAny, ev } = require('./helpers');

function evaluate($) {
  const text = pageText($);
  const html = $.html().toLowerCase();
  const items = [];
  const add = (id, label, verdict, detail, risk) => items.push({ id, label, verdict, detail, risk });

  // 1. Urgencia falsa
  const hasCountdown = $('[class*="countdown" i], [class*="timer" i]').length > 0 || html.includes('setinterval');
  const hasRealDate = $('time[datetime]').length > 0 || !!findAny(text, [/\d{1,2}\s+de\s+\w+/, /\d{1,2}\/\d{1,2}\/\d{2,4}/]);
  const urgencyText = findAny(text, ['solo hoy', 'termina hoy', 'última oportunidad', 'expira en']);
  if (hasCountdown && !hasRealDate) {
    add('urgencia_falsa', 'Urgencia con countdown', 'alerta',
      'Hay un contador regresivo sin fecha límite verificable. Si se reinicia por visitante, es urgencia falsa (práctica engañosa).', 'GDPR / DMA');
  } else if (urgencyText && !hasRealDate) {
    add('urgencia_falsa', 'Urgencia declarada', 'revisar',
      `El copy dice "${urgencyText}" sin fecha concreta verificable. Añade la fecha real del cierre.`, 'Publicidad engañosa');
  } else {
    add('urgencia_falsa', 'Urgencia verificable', 'ok',
      urgencyText || hasCountdown ? 'La urgencia declara fecha/límite verificable.' : 'No usa urgencia — sin riesgo.', null);
  }

  // 2. Prueba social no verificable
  const counter = findAny(text, [/\+?\s?[\d.,]+\s?(clientes|usuarios|empresas|profesionales)/]);
  const testimonialBlocks = $('[class*="testimonial" i], blockquote');
  let unnamed = 0;
  testimonialBlocks.each((_, b) => {
    const t = $(b).text();
    // Heurística: un testimonio "con fuente" suele incluir un nombre propio (2 palabras capitalizadas) o cargo.
    if (!/[A-ZÁÉÍÓÚ][a-záéíóú]+\s+[A-ZÁÉÍÓÚ][a-záéíóú]+/.test(t)) unnamed++;
  });
  if (testimonialBlocks.length > 0 && unnamed === testimonialBlocks.length) {
    add('social_no_verificable', 'Testimonios sin fuente', 'revisar',
      `${testimonialBlocks.length} testimonios sin nombre/cargo identificable. Testimonios anónimos no son verificables.`, 'Publicidad engañosa');
  } else if (counter && !findAny(text, ['fuente', 'según', 'auditado', 'verificado', 'trustpilot', 'g2', 'google'])) {
    add('social_no_verificable', 'Contador sin fuente', 'revisar',
      `El contador "${ev(counter, 40)}" no cita fuente ni número auditable.`, 'Publicidad engañosa');
  } else {
    add('social_no_verificable', 'Prueba social verificable', 'ok',
      testimonialBlocks.length || counter ? 'Reseñas/contadores con fuente o nombre identificable. Persuasión legítima.' : 'No usa prueba social — sin riesgo.', null);
  }

  // 3. Checkboxes preseleccionados (consentimiento)
  const prechecked = $('input[type="checkbox"][checked]').length;
  if (prechecked > 0) {
    add('prechecked', 'Consentimiento preseleccionado', 'alerta',
      `${prechecked} checkbox(es) marcados por defecto. El GDPR exige consentimiento explícito y activo.`, 'GDPR art. 7');
  } else {
    add('prechecked', 'Consentimiento explícito', 'ok', 'Sin casillas premarcadas.', null);
  }

  // 4. Confirmshaming
  const shaming = findAny(text, ['no, prefiero', 'no gracias, quiero seguir', 'prefiero seguir perdiendo', 'no me interesa mejorar', 'seguir como estoy']);
  if (shaming) {
    add('confirmshaming', 'Confirmshaming', 'alerta',
      `Texto de rechazo con culpabilización: "${ev(shaming, 60)}". Dark pattern documentado.`, 'DMA / protección al consumidor');
  } else {
    add('confirmshaming', 'Rechazo neutral', 'ok', 'Las opciones de rechazo no culpabilizan al usuario.', null);
  }

  // 5. Costes ocultos
  const hiddenCost = /\$\s?[\d.,]+\s?\*/.test(text) || findAny(text, ['*aplican condiciones', 'aplican términos', 'más impuestos', 'cargos adicionales']);
  if (hiddenCost) {
    add('costes_ocultos', 'Posibles costes con letra pequeña', 'revisar',
      'Precio con asterisco o condiciones adicionales lejos del CTA. Verifica que el coste total sea transparente antes del clic.', 'DMA transparencia');
  } else {
    add('costes_ocultos', 'Precio transparente', 'ok', 'Sin asteriscos ni condiciones ocultas junto al precio.', null);
  }

  // 6. Trampa de suscripción
  const emailForm = $('input[type="email"]').length > 0;
  const optOut = findAny(text, ['darte de baja', 'cancelar', 'unsubscribe', 'cuando quieras', 'en cualquier momento']);
  if (emailForm && !optOut) {
    add('trampa_suscripcion', 'Suscripción sin salida visible', 'revisar',
      'El formulario captura email sin mencionar cómo darse de baja. Añade "cancela cuando quieras".', 'GDPR');
  } else {
    add('trampa_suscripcion', 'Suscripción con salida clara', 'ok',
      emailForm ? 'Se menciona la posibilidad de baja/cancelación.' : 'No captura emails — sin riesgo.', null);
  }

  return items;
}

module.exports = { evaluate };

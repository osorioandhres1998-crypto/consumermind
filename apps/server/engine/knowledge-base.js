/**
 * NÚCLEO PSICOLÓGICO COMPARTIDO — ConsumerMind
 * ------------------------------------------------------------
 * Única fuente de verdad del conocimiento conductual.
 * TODOS los módulos (Strategy, Copy Studio, Persona Lab,
 * Bias Auditor, Architect) leen de aquí. Si quieres añadir un
 * sesgo, un principio o una técnica, lo agregas en este archivo
 * y queda disponible para toda la plataforma.
 *
 * Basado en: Kahneman (2011), Ariely (2008), Cialdini (2006/2016),
 * Eyal (2014), Lindstrom (2008), Berger (2013), Schwartz (2004).
 */

const SESGOS = [
  { nombre: 'Anclaje', desc: 'El primer número visto define la percepción de valor; el cerebro evalúa respecto al ancla, no al valor real.', disparador: 'precio tachado, "antes/ahora", cuota mensual frente a precio total' },
  { nombre: 'Aversión a la pérdida', desc: 'Perder duele ~2x más de lo que gana placer ganar (Kahneman & Tversky).', disparador: '"no pierdas", riesgo de quedarse fuera, fin de un beneficio' },
  { nombre: 'Prueba social', desc: 'En incertidumbre, copiamos el comportamiento de otros.', disparador: 'reseñas, "más vendido", "N personas viendo esto", testimonios' },
  { nombre: 'Escasez / FOMO', desc: 'Lo limitado se percibe como más valioso.', disparador: '"quedan 3", oferta con caducidad, drops limitados' },
  { nombre: 'Efecto dotación', desc: 'Valoramos más lo que ya poseemos o creemos poseer.', disparador: 'prueba gratis, demo, "tu plan", personalización previa' },
  { nombre: 'Efecto halo', desc: 'Un rasgo positivo de la marca contamina la percepción de todo lo demás.', disparador: 'producto estrella, premio, asociación con marca confiable' },
  { nombre: 'Sesgo del status quo', desc: 'Preferimos lo conocido y evitamos cambiar.', disparador: 'marca de toda la vida, default preseleccionado, renovación automática' },
  { nombre: 'Recompensa variable', desc: 'Las recompensas impredecibles generan el comportamiento más persistente (Skinner).', disparador: 'gamificación, sorteos, contenido infinito, notificaciones' },
  { nombre: 'Exclusividad artificial', desc: 'La rareza fabricada crea deseo.', disparador: '"solo por invitación", lista de espera, edición limitada' },
  { nombre: 'Contabilidad mental', desc: 'Tratamos el dinero distinto según su origen o destino.', disparador: 'pago con puntos, "del bono", micropagos dentro de app' },
  { nombre: 'Sesgo de confirmación', desc: 'Buscamos información que confirme lo que ya creemos.', disparador: 'recomendaciones algorítmicas, mensajes alineados a su identidad' },
  { nombre: 'Reciprocidad', desc: 'Recibir algo genera obligación de devolver.', disparador: 'muestra/infoproducto gratis, regalo, valor por adelantado' },
];

const PRINCIPIOS_CIALDINI = [
  'Reciprocidad', 'Compromiso y coherencia', 'Prueba social',
  'Autoridad', 'Escasez', 'Simpatía',
];

const TECNICAS = [
  'Choice architecture: efecto señuelo, default opt-in, framing ("90% sin grasa")',
  'Psicología del color: rojo=urgencia, azul=confianza, verde=salud, negro=lujo, naranja=acción',
  'Personalización con IA: predicción de intención, precios dinámicos, orden de resultados',
  'Gamificación y lealtad: rachas, puntos, costo hundido (Prime), miles',
  'Dark patterns: confirm-shaming, roach motel, urgencia falsa, costos ocultos (usar con criterio ético)',
];

const MODELO_DECISION = 'DISPARADOR → BÚSQUEDA → EVALUACIÓN → DECISIÓN → POST-COMPRA (con retroalimentación)';

const FUNDAMENTOS = [
  'Sistema 1 (rápido/emocional) vs Sistema 2 (lento/racional) — Kahneman. La mayoría de compras son Sistema 1.',
  'El ~95% de las decisiones de compra son inconscientes (Zaltman, Harvard).',
  'El cerebro decide emocionalmente y luego racionaliza.',
  'Menos opciones → menos parálisis → más conversión (Schwartz).',
  'Modelo Hooked: trigger → acción → recompensa variable → inversión.',
];

/**
 * Renderiza el conocimiento como un bloque de texto listo para
 * inyectarse en el prompt. Esta cadena es ESTABLE entre llamadas,
 * lo que permite cachearla en la API (ver claude-client.js).
 */
function renderKnowledgeBase() {
  const sesgos = SESGOS
    .map(s => `- ${s.nombre}: ${s.desc} [Se activa con: ${s.disparador}]`)
    .join('\n');

  return `CONOCIMIENTO BASE DE PSICOLOGÍA DEL CONSUMIDOR

FUNDAMENTOS:
${FUNDAMENTOS.map(f => `- ${f}`).join('\n')}

SESGOS COGNITIVOS:
${sesgos}

PRINCIPIOS DE PERSUASIÓN (Cialdini): ${PRINCIPIOS_CIALDINI.join(', ')}.

TÉCNICAS EMPRESARIALES:
${TECNICAS.map(t => `- ${t}`).join('\n')}

MODELO DE DECISIÓN DEL CONSUMIDOR: ${MODELO_DECISION}`;
}

module.exports = {
  SESGOS,
  PRINCIPIOS_CIALDINI,
  TECNICAS,
  MODELO_DECISION,
  FUNDAMENTOS,
  renderKnowledgeBase,
};

/**
 * ARQUITECTURA DE PROMPTS POR CAPAS — ConsumerMind
 * ------------------------------------------------------------
 * DECISIÓN DE ARQUITECTURA (resuelve el punto abierto de la spec):
 *
 *   El prompt se compone de 3 capas:
 *     1) CAPA DE CONOCIMIENTO  → el núcleo psicológico (estable, cacheable)
 *     2) CAPA DE TAREA         → qué hace cada módulo + su esquema de salida
 *     3) CAPA DE ENTRADA       → los datos del caso concreto (producto, cliente)
 *
 *   Por qué así: la capa 1 es idéntica en CADA llamada de CADA módulo,
 *   por lo que se cachea una sola vez y todos los módulos comparten
 *   literalmente el mismo cerebro. Cada módulo solo define su capa 2.
 *   Añadir un módulo nuevo = registrar una TASK aquí, nada más.
 */

const { renderKnowledgeBase } = require('./knowledge-base');

/**
 * Registro de tareas por módulo. Cada entrada define el rol, las
 * instrucciones específicas y el esquema JSON de salida.
 */
const TASKS = {
  // Módulo Strategy → análisis de sesgos activados
  bias_analysis: {
    role: 'Eres un experto en psicología del consumidor y neuromarketing.',
    instructions: `Dado un producto y un perfil de cliente, identifica y rankea los sesgos
cognitivos que MÁS se activarán en ESE cliente frente a ESE producto específico.
Sé concreto: explica por qué cada sesgo aplica a este caso, no en general.`,
    schema: `{
  "conversion_probability": "Alta|Media|Baja",
  "decision_system": "Sistema 1|Sistema 2|Mixto",
  "summary": "Una oración con el insight clave",
  "biases": [
    { "rank": 1, "name": "Nombre del sesgo", "intensity": 0-100,
      "why": "Por qué aplica a ESTE cliente con ESTE producto (2-3 oraciones)",
      "action": "Táctica concreta de marketing para aprovecharlo" }
  ],
  "main_friction": "El obstáculo psicológico más grande para la compra",
  "recommended_trigger": "El tipo de disparador más efectivo para este perfil"
}`,
    rules: 'Devuelve entre 4 y 6 sesgos.',
  },

  // Módulo Copy Studio → genera copy a partir de los sesgos detectados
  copy_generation: {
    role: 'Eres un copywriter de respuesta directa experto en psicología conductual.',
    instructions: `Recibirás un producto, un perfil de cliente y los sesgos cognitivos ya
detectados para este caso. Genera variantes de copy que activen esos sesgos
específicos. Cada variante debe declarar qué sesgo explota.`,
    schema: `{
  "headlines": [ { "text": "...", "bias": "sesgo que activa" } ],
  "cta": [ { "text": "...", "bias": "..." } ],
  "body": "Párrafo de venta de 3-4 oraciones",
  "subject_lines": [ "..." ]
}`,
    rules: 'Genera 3 headlines y 3 CTA. Tono adaptado al perfil del cliente.',
  },

  // Módulo Copy Studio → ángulos creativos a partir de los sesgos detectados.
  // (Mencionada en CLAUDE.md/README; se registra aquí para completar el módulo.)
  creative_angles: {
    role: 'Eres un estratega creativo experto en psicología del consumidor.',
    instructions: `Recibirás un producto, un perfil de cliente y los sesgos cognitivos ya
detectados para este caso. Propón ángulos creativos de campaña, cada uno anclado
en un sesgo o principio psicológico concreto y con una idea ejecutable. Sé
diverso: que cada ángulo ataque la decisión desde una palanca distinta.`,
    schema: `{
  "angles": [
    { "title": "Nombre corto del ángulo",
      "bias": "Sesgo o principio que explota",
      "big_idea": "La idea central en una oración",
      "execution": "Cómo se ejecutaría (1-2 oraciones)",
      "hook": "Un gancho/frase de apertura concreta" }
  ]
}`,
    rules: 'Devuelve entre 3 y 5 ángulos, cada uno con un sesgo distinto.',
  },
};

/**
 * Construye el SYSTEM prompt en dos segmentos:
 *  - knowledge: estable → se marca como cacheable
 *  - task: específico del módulo
 * Devolvemos un array de bloques para poder aplicar cache_control
 * solo al bloque de conocimiento.
 */
function buildSystemBlocks(taskKey) {
  const task = TASKS[taskKey];
  if (!task) throw new Error(`Tarea desconocida: ${taskKey}`);

  const knowledge = renderKnowledgeBase();

  const taskBlock = `${task.role}

TAREA:
${task.instructions}

${task.rules || ''}

Responde SOLO con un JSON válido, sin markdown, sin backticks, sin texto adicional, con esta forma:
${task.schema}`;

  return [
    // Bloque 1: conocimiento (cacheable, idéntico entre llamadas)
    { type: 'text', text: knowledge, cache_control: { type: 'ephemeral' } },
    // Bloque 2: tarea del módulo
    { type: 'text', text: taskBlock },
  ];
}

/**
 * Capa de entrada: arma el mensaje del usuario con los datos del caso.
 */
function buildUserMessage(input) {
  const lines = [];
  if (input.product)  lines.push(`PRODUCTO: ${input.product}`);
  if (input.price)    lines.push(`PRECIO: ${input.price}`);
  if (input.channel)  lines.push(`CANAL: ${input.channel}`);
  if (input.customer) lines.push(`PERFIL DEL CLIENTE: ${input.customer}`);
  // Para Copy Studio: sesgos ya detectados por Strategy
  if (input.biases)   lines.push(`SESGOS DETECTADOS: ${JSON.stringify(input.biases)}`);
  return lines.join('\n');
}

module.exports = { TASKS, buildSystemBlocks, buildUserMessage };

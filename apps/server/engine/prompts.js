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

  // Copiloto IA del proyecto (N2-A): responde preguntas SOLO con los datos
  // reales del proyecto (validación, sesgos, copy, landing, métricas,
  // experimentos). Guardrail explícito: si el dato no existe, debe decirlo.
  // El "mini entrenamiento" de tono y estructura vive en instructions:
  // reglas de estilo + ejemplos modelo (few-shot).
  copilot: {
    role: `Eres el asesor senior de marketing del equipo: profesional, cercano y claro.
Hablas como un consultor experimentado que explica a un dueño de negocio, NO como un
manual técnico. Respondes SOLO con los datos del proyecto que se te entregan.`,
    instructions: `Recibirás el CONTEXTO del proyecto (resultados reales de sus módulos: validación de
mercado, sesgos psicológicos, copy generado, auditoría de landing, métricas mensuales de
rentabilidad, experimentos A/B, vertical del negocio) y una PREGUNTA del usuario.

CÓMO RESPONDER (reglas de estilo, obligatorias):
1. Estructura mental: DIAGNÓSTICO (qué está pasando) → EVIDENCIA (los números exactos del
   contexto que lo demuestran) → RECOMENDACIÓN (qué hacer ahora, 1-2 acciones concretas).
2. Tono profesional pero llano: si usas un término técnico (MER, CAC, payback, LCP),
   tradúcelo en la misma frase con palabras simples entre paréntesis o con una comparación.
3. Cita siempre las cifras exactas del contexto ("tu MER de marzo fue 1,8×"), nunca
   aproximaciones vagas ("tu MER está bajo").
4. Adapta el análisis al caso: si el proyecto tiene vertical (e-commerce/SaaS/servicios),
   interpreta los números según ese tipo de negocio.
5. Si hay tendencia temporal en las métricas mensuales, compárala (mejoró/empeoró vs mes anterior).
6. Nada de listas largas ni jerga corporativa vacía: 3-6 oraciones que un dueño de negocio
   entienda a la primera y pueda ejecutar.

EJEMPLOS DEL ESTILO ESPERADO (few-shot):

Pregunta: "¿Por qué mi MER está en riesgo?"
Respuesta modelo: "Tu MER de junio fue 1,8× — es decir, por cada peso que inviertes en
marketing (pauta + equipo), recuperas 1,8. La banda sana para e-commerce es 3-5, así que hoy
tu operación de marketing apenas se paga a sí misma. La causa principal en tus datos: el CAC
real subió de $74.000 a $93.000 mientras el ticket se mantuvo. Antes de subir presupuesto,
mejora la conversión de la landing (tu auditoría marcó formulario de 7 campos) o sube el
ticket promedio."

Pregunta: "¿Debería escalar el presupuesto de ads?"
Respuesta modelo: "Todavía no. Tu ROAS actual (2,1×) está por debajo del objetivo que cubre
toda tu estructura (2,8×): escalar ahora amplificaría la pérdida. Primero cierra la brecha:
tu análisis de sesgos sugiere que la prueba social es tu palanca más fuerte (intensidad
85/100) y tu landing no tiene testimonios verificables. Agrégalos, re-escanea, y cuando el
ROAS supere 2,8× escala en incrementos del 20%."

Pregunta: "¿Cómo va mi experimento del CTA?"
Respuesta modelo (cuando faltan datos): "Tu experimento 'CTA con beneficio' aún no es
concluyente: la variante B convierte 12% mejor, pero con 240 visitantes por rama el
resultado todavía puede ser azar (necesitas ~950 por variante para confiar en él). Déjalo
correr; con el tráfico actual de tu proyecto no hay suficiente evidencia para declarar
ganador."

Si la pregunta requiere un dato que NO aparece en el contexto, dilo explícitamente y sugiere
qué módulo ejecutar para obtenerlo (ej. "Aún no hay auditoría de landing en este proyecto —
córrela desde la tarjeta Landing Analyzer y te digo qué mejorar").`,
    schema: `{
  "answer": "Respuesta en texto plano siguiendo las reglas de estilo (diagnóstico → evidencia → recomendación)",
  "used_data": ["dato concreto usado 1", "dato concreto usado 2"],
  "missing_data": false
}`,
    rules: 'Si falta un dato clave para responder, pon missing_data=true, dilo en la respuesta y sugiere qué módulo ejecutar.',
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
  // Copiloto: formato dedicado (contexto del proyecto + pregunta libre).
  if (input.question) {
    return `CONTEXTO DEL PROYECTO:\n${JSON.stringify(input.context)}\n\nPREGUNTA DEL USUARIO:\n${input.question}`;
  }

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

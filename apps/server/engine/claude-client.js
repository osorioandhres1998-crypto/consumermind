/**
 * CLIENTE DE CLAUDE — ConsumerMind
 * ------------------------------------------------------------
 * Envoltura única del SDK de Anthropic para toda la plataforma.
 * - Aplica prompt caching al bloque de conocimiento (la capa estable),
 *   de modo que el núcleo psicológico se cobra una sola vez y se
 *   reutiliza en cada módulo → menor costo y latencia.
 * - Parseo robusto del JSON de salida.
 *
 * Requiere: npm i @anthropic-ai/sdk
 * Variable de entorno: ANTHROPIC_API_KEY
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.CONSUMERMIND_MODEL || 'claude-sonnet-4-6';

/**
 * Llama al modelo y devuelve el JSON parseado.
 * @param {Array}  systemBlocks  bloques del system prompt (de buildSystemBlocks)
 * @param {string} userMessage   mensaje del usuario (de buildUserMessage)
 */
async function runInference(systemBlocks, userMessage) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemBlocks,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    return {
      data: JSON.parse(clean),
      usage: response.usage, // incluye cache_read_input_tokens
    };
  } catch (e) {
    throw new Error(`El motor devolvió un JSON inválido: ${clean.slice(0, 200)}`);
  }
}

module.exports = { runInference, MODEL };

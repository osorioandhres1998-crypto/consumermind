/**
 * CLIENTE DE IA — ConsumerMind
 * Usa Groq (modelos open-source: Llama, DeepSeek, etc.) en lugar de Claude.
 * Variable de entorno: GROQ_API_KEY
 */

const Groq = require('groq-sdk');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = process.env.CONSUMERMIND_MODEL || 'llama-3.3-70b-versatile';

async function runInference(systemBlocks, userMessage) {
  // Groq usa el formato OpenAI: system es un string, no array de bloques
  const systemText = systemBlocks.map(b => b.text).join('\n\n');

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [
      { role: 'system', content: systemText },
      { role: 'user', content: userMessage },
    ],
  });

  const raw = response.choices[0]?.message?.content || '';
  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    return {
      data: JSON.parse(clean),
      usage: response.usage,
    };
  } catch (e) {
    throw new Error(`El motor devolvió un JSON inválido: ${clean.slice(0, 200)}`);
  }
}

module.exports = { runInference, MODEL };

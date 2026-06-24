/**
 * API PÚBLICA DEL MOTOR PSICOLÓGICO — ConsumerMind
 * ------------------------------------------------------------
 * Punto de entrada único del núcleo compartido. Cualquier módulo
 * llama a runAnalysis() con su clave de tarea y los datos del caso.
 *
 *   const { runAnalysis } = require('../../engine');
 *   const result = await runAnalysis('bias_analysis', { product, customer });
 */

const { buildSystemBlocks, buildUserMessage, TASKS } = require('./prompts');
const { runInference } = require('./claude-client');

/**
 * Ejecuta una tarea del motor.
 * @param {string} taskKey  clave registrada en TASKS (ej. 'bias_analysis')
 * @param {object} input    { product, customer, price, channel, biases? }
 * @returns {object}        { data, usage }
 */
async function runAnalysis(taskKey, input) {
  if (!TASKS[taskKey]) {
    throw new Error(`Tarea no registrada en el motor: ${taskKey}`);
  }
  const systemBlocks = buildSystemBlocks(taskKey);
  const userMessage = buildUserMessage(input);
  return runInference(systemBlocks, userMessage);
}

module.exports = { runAnalysis, availableTasks: Object.keys(TASKS) };

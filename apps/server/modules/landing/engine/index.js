/**
 * MOTOR DEL LANDING ANALYZER — punto de entrada
 * ------------------------------------------------------------
 * analyzeHtml(html, { url, bytes }) → resultado completo:
 * score /100 ponderado, 5 dimensiones con checks, 9 principios,
 * semáforo ético y recomendaciones priorizadas.
 *
 * Pesos según las prioridades de la tabla maestra de los documentos
 * (plan §3.1): estructura 25 · persuasión 25 · UX 20 · copy 15 · técnica 15.
 */

const cheerio = require('cheerio');
const estructura = require('./rules/estructura');
const persuasion = require('./rules/persuasion');
const ux = require('./rules/ux');
const copy = require('./rules/copy');
const tecnica = require('./rules/tecnica');
const ethics = require('./ethics');
const { detectJsRender } = require('../fetcher');

const WEIGHTS = { estructura: 25, persuasion: 25, ux: 20, copy: 15, tecnica: 15 };
const DIM_LABELS = {
  estructura: 'Estructura y anatomía',
  persuasion: 'Persuasión (9 principios)',
  ux: 'Carga cognitiva / UX',
  copy: 'Copywriting',
  tecnica: 'Técnica',
};

function analyzeHtml(html, ctx = {}) {
  const $ = cheerio.load(html);

  const dims = {
    estructura: estructura.evaluate($),
    persuasion: persuasion.evaluate($),
    ux: ux.evaluate($),
    copy: copy.evaluate($),
    tecnica: tecnica.evaluate($, ctx),
  };

  // Score por dimensión = % de checks aprobados; global = suma ponderada.
  let score = 0;
  const dimensions = {};
  for (const [key, checks] of Object.entries(dims)) {
    const passed = checks.filter((c) => c.pass).length;
    const pct = checks.length ? passed / checks.length : 0;
    dimensions[key] = {
      label: DIM_LABELS[key],
      weight: WEIGHTS[key],
      score: Math.round(pct * 100),
      passed,
      total: checks.length,
      checks,
    };
    score += pct * WEIGHTS[key];
  }
  score = Math.round(score);
  const band = score < 50 ? 'red' : score <= 75 ? 'amber' : 'green';
  const bandLabel = score < 50 ? 'Necesita rediseño' : score <= 75 ? 'Base sólida con brechas' : 'Alta conversión';

  // Principios de persuasión activos (marcador X/9 de la UI).
  const principles = dims.persuasion.map((c) => ({
    name: c.label, active: c.pass, evidence: c.evidence,
  }));

  // Semáforo ético.
  const ethicsItems = ethics.evaluate($);
  const alerts = ethicsItems.filter((e) => e.verdict === 'alerta').length;
  const warnings = ethicsItems.filter((e) => e.verdict === 'revisar').length;

  // Recomendaciones: checks fallidos, priorizados por peso de su dimensión.
  const recommendations = [];
  for (const [key, d] of Object.entries(dimensions)) {
    for (const c of d.checks) {
      if (!c.pass) {
        recommendations.push({
          dimension: d.label,
          weight: d.weight,
          missing: c.label,
          found: c.evidence,
          impact: c.impact || null,
        });
      }
    }
  }
  recommendations.sort((a, b) => b.weight - a.weight);

  return {
    score, band, bandLabel,
    dimensions,
    principles,
    principles_active: principles.filter((p) => p.active).length,
    ethics: ethicsItems,
    ethics_alerts: alerts,
    ethics_warnings: warnings,
    recommendations: recommendations.slice(0, 12),
    fetch_meta: {
      url: ctx.url || null,
      html_bytes: ctx.bytes || html.length,
      js_suspected: detectJsRender($),
      analyzed_at: new Date().toISOString(),
    },
  };
}

module.exports = { analyzeHtml, WEIGHTS };

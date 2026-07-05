/**
 * MÓDULO COPILOTO IA — N2-A del plan enterprise
 * ------------------------------------------------------------
 * Responde preguntas sobre UN proyecto usando SOLO sus datos reales
 * (equivalente a "Moby" de Triple Whale). Reutiliza el motor compartido
 * (engine/) con la TASK 'copilot' — mismo Groq, mismo patrón JSON,
 * sin tocar claude-client.js.
 *
 * Guardrail: buildProjectContext() resume el proyecto en un objeto
 * compacto; si algo falta, el prompt (ver engine/prompts.js) instruye
 * a decir "no tengo ese dato" en vez de inventar.
 */

const { runAnalysis } = require('../../engine');
const { getProject } = require('../projects/service');
const { listSnapshots } = require('../metrics/service');
const { listExperiments } = require('../experiments/service');

/** Compacta el proyecto a lo que el copiloto necesita (evita mandar todo el JSON crudo). */
function buildProjectContext(project, { snapshots = [], experiments = [] } = {}) {
  const strategy = (project.analyses || []).find((a) => a.module === 'strategy');
  const landing = (project.analyses || []).find((a) => a.module === 'landing');
  const copies = (project.analyses || []).filter((a) => a.module === 'copy_studio');
  const sim = (project.simulations || [])[0];

  // Métricas mensuales con MER/ROAS ya calculados, para que el modelo
  // pueda comparar tendencias sin hacer aritmética (menos errores).
  const metricas_mensuales = snapshots.map((s) => {
    const m = s.metrics || {};
    const ads = m.adsPeriodo || 0, fijos = m.fijosMarketing || 0, ingresos = m.ingresosPeriodo || 0;
    const total = ads + fijos;
    return {
      mes: s.period,
      gasto_ads: ads, fijos_marketing: fijos, ingresos, ordenes: m.ordenesPeriodo || 0,
      mer: total > 0 ? +(ingresos / total).toFixed(2) : null,
      roas: ads > 0 ? +(ingresos / ads).toFixed(2) : null,
      cac_real: (m.clientesNuevosPeriodo || m.ordenesPeriodo) > 0
        ? Math.round(total / (m.clientesNuevosPeriodo || m.ordenesPeriodo)) : null,
    };
  });

  const experimentos = experiments.map((e) => ({
    hipotesis: e.hypothesis,
    estado: e.status,
    variante_a: { etiqueta: e.variant_a_label, visitantes: e.visitors_a, conversiones: e.conversions_a },
    variante_b: { etiqueta: e.variant_b_label, visitantes: e.visitors_b, conversiones: e.conversions_b },
    significativo_95: e.stats?.significant ?? null,
    p_value: e.stats?.pValue ?? null,
    uplift_pct: e.stats?.upliftPct != null ? +e.stats.upliftPct.toFixed(1) : null,
    muestras_necesarias_por_variante: e.samples_needed_10pct ?? null,
  }));

  return {
    proyecto: {
      nombre: project.name, producto: project.product, cliente: project.customer,
      precio: project.price, canal: project.channel,
      vertical: project.vertical || 'sin especificar',
    },
    metricas_mensuales: metricas_mensuales.length ? metricas_mensuales : null,
    experimentos_ab: experimentos.length ? experimentos : null,
    validacion_mercado: sim ? {
      aceptacion_mercado: sim.results?.acceptance_rate,
      intencion_compra: sim.results?.purchase_intent_probability,
      principales_objeciones: sim.results?.top_objections,
    } : null,
    sesgos_psicologicos: strategy ? {
      probabilidad_conversion: strategy.result?.conversion_probability,
      sesgos: (strategy.result?.biases || []).map((b) => ({ nombre: b.name, intensidad: b.intensity, accion: b.action })),
      friccion_principal: strategy.result?.main_friction,
    } : null,
    copy_generado: copies.length ? copies.map((c) => ({
      modo: c.input?.mode, headlines: c.result?.headlines?.map((h) => h.text), angulos: c.result?.angles?.map((a) => a.title),
    })) : null,
    auditoria_landing: landing ? {
      score: landing.result?.score, banda: landing.result?.bandLabel,
      principios_activos: landing.result?.principles_active,
      alertas_eticas: landing.result?.ethics_alerts,
      recomendaciones_top: (landing.result?.recommendations || []).slice(0, 5).map((r) => r.missing),
    } : null,
  };
}

/** Pregunta al copiloto sobre un proyecto ya cargado (getProject). */
async function ask({ db, workspaceId, projectId, question }) {
  const project = await getProject({ db, workspaceId, projectId });
  if (!project) {
    const e = new Error('Proyecto no encontrado.');
    e.status = 404;
    throw e;
  }

  // Carga en paralelo lo que getProject no incluye: métricas mensuales y experimentos.
  const [snapshots, experiments] = await Promise.all([
    listSnapshots({ db, workspaceId, projectId }).catch(() => []),
    listExperiments({ db, workspaceId, projectId }).catch(() => []),
  ]);

  const context = buildProjectContext(project, { snapshots, experiments });
  const { data } = await runAnalysis('copilot', { question, context });
  return data; // { answer, used_data, missing_data }
}

module.exports = { ask, buildProjectContext };

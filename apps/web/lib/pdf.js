// Exportación a PDF con jsPDF, adaptada a los esquemas reales del motor.
import { jsPDF } from 'jspdf';

const MARGIN = 48;
const LINE = 16;

function makeWriter(doc) {
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - MARGIN * 2;
  let y = MARGIN;

  const ensure = (needed = LINE) => {
    if (y + needed > pageH - MARGIN) { doc.addPage(); y = MARGIN; }
  };

  return {
    text(str, { size = 11, style = 'normal', color = [30, 30, 40], gap = 0 } = {}) {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
      doc.splitTextToSize(String(str ?? ''), maxW).forEach((ln) => {
        ensure();
        doc.text(ln, MARGIN, y);
        y += LINE * (size / 11);
      });
      y += gap;
    },
    rule() { ensure(); doc.setDrawColor(220); doc.line(MARGIN, y, MARGIN + maxW, y); y += 10; },
  };
}

// Convierte "#RRGGBB" a [r,g,b] para jsPDF; si no es válido, usa el índigo por defecto.
function hexToRgb(hex, fallback = [67, 56, 202]) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function header(w, subtitle, brand = 'ConsumerMind', brandColor = null) {
  w.text(brand, { size: 20, style: 'bold', color: hexToRgb(brandColor) });
  w.text(subtitle, { size: 12, color: [110, 110, 120], gap: 4 });
  w.text(`Generado el ${new Date().toLocaleString('es-ES')}`, { size: 9, color: [150, 150, 160] });
  w.rule();
}

// --- Análisis de sesgos (Strategy) ---
export function exportAnalysisPDF(analysis, input) {
  const r = analysis.result || analysis;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = makeWriter(doc);

  header(w, 'Análisis de sesgos — Strategy');

  if (input) {
    w.text(`Producto: ${input.product || '—'}`, { size: 10, color: [80, 80, 90] });
    w.text(`Cliente: ${input.customer || '—'}`, { size: 10, color: [80, 80, 90] });
    if (input.price) w.text(`Precio: ${input.price}`, { size: 10, color: [80, 80, 90] });
    if (input.channel) w.text(`Canal: ${input.channel}`, { size: 10, color: [80, 80, 90] });
    w.rule();
  }

  w.text(`Probabilidad de conversión: ${r.conversion_probability || '—'}`, { size: 11, style: 'bold' });
  w.text(`Sistema de decisión: ${r.decision_system || '—'}`, { size: 11 });
  if (r.summary) w.text(`Insight: ${r.summary}`, { size: 11, color: [60, 60, 70], gap: 6 });
  w.rule();

  w.text(`Sesgos detectados (${(r.biases || []).length})`, { size: 14, style: 'bold', gap: 4 });
  (r.biases || []).forEach((b) => {
    w.text(`${b.rank}. ${b.name}  ·  Intensidad ${b.intensity}/100`, { size: 12, style: 'bold', color: [40, 40, 60] });
    w.text(`Por qué: ${b.why}`, { size: 10, color: [60, 60, 70] });
    w.text(`Acción: ${b.action}`, { size: 10, color: [30, 30, 40], gap: 8 });
  });

  if (r.main_friction) { w.rule(); w.text(`Fricción principal: ${r.main_friction}`, { size: 11 }); }
  if (r.recommended_trigger) w.text(`Disparador recomendado: ${r.recommended_trigger}`, { size: 11 });

  doc.save('analisis-sesgos.pdf');
}

// --- Copy / ángulos (Copy Studio) ---
export function exportCopyPDF(payload) {
  const r = payload.result || payload;
  const mode = payload.mode || (r.angles ? 'angles' : 'copy');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = makeWriter(doc);

  header(w, mode === 'angles' ? 'Ángulos creativos — Copy Studio' : 'Copy — Copy Studio');

  if (mode === 'angles') {
    (r.angles || []).forEach((a, i) => {
      w.text(`${i + 1}. ${a.title}`, { size: 12, style: 'bold', color: [40, 40, 60] });
      w.text(`Sesgo: ${a.bias}`, { size: 10, color: [67, 56, 202] });
      w.text(`Idea: ${a.big_idea}`, { size: 10 });
      w.text(`Ejecución: ${a.execution}`, { size: 10, color: [60, 60, 70] });
      w.text(`Gancho: ${a.hook}`, { size: 10, style: 'italic', color: [110, 110, 120], gap: 8 });
    });
  } else {
    w.text('Headlines', { size: 13, style: 'bold', gap: 2 });
    (r.headlines || []).forEach((h) => w.text(`• ${h.text}  [${h.bias}]`, { size: 11 }));
    w.rule();
    w.text('CTA', { size: 13, style: 'bold', gap: 2 });
    (r.cta || []).forEach((c) => w.text(`• ${c.text}  [${c.bias}]`, { size: 11 }));
    w.rule();
    if (r.body) { w.text('Cuerpo', { size: 13, style: 'bold', gap: 2 }); w.text(r.body, { size: 11, gap: 6 }); }
    if (r.subject_lines?.length) {
      w.rule();
      w.text('Asuntos de email', { size: 13, style: 'bold', gap: 2 });
      r.subject_lines.forEach((s) => w.text(`• ${s}`, { size: 11 }));
    }
  }

  doc.save(`copy-studio-${mode}.pdf`);
}

// --- Informe unificado del proyecto (master-tool) ---
// Recibe el proyecto completo (getProject: datos + analyses + simulations)
// y arma UN solo PDF con: datos del caso, validación de mercado (Validator),
// sesgos (Strategy) y copy/ángulos (Copy Studio).
const OBJECTION_ES = {
  precio_alto: 'Precio alto',
  valor_percibido_bajo: 'Valor percibido bajo',
  no_lo_necesita: 'No lo necesita',
};
const pct = (v) => `${((v ?? 0) * 100).toFixed(1)}%`;

export function exportProjectReportPDF(project) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = makeWriter(doc);

  // N3-B: marca blanca — si el workspace definió brand_name/brand_color, se usan aquí.
  header(w, `Informe completo — ${project.name}`, project.brand_name || 'Master Tool', project.brand_color);

  // 1) Datos del proyecto
  w.text('1. Datos del proyecto', { size: 14, style: 'bold', gap: 4 });
  w.text(`Producto: ${project.product || '—'}`, { size: 10, color: [80, 80, 90] });
  w.text(`Público objetivo: ${project.customer || '—'}`, { size: 10, color: [80, 80, 90] });
  if (project.price) w.text(`Precio: ${project.price}`, { size: 10, color: [80, 80, 90] });
  if (project.channel) w.text(`Canal: ${project.channel}`, { size: 10, color: [80, 80, 90] });
  if (project.landing_url) w.text(`Landing: ${project.landing_url}`, { size: 10, color: [80, 80, 90] });
  w.rule();

  // 2) Validación de mercado (simulación más reciente)
  const sim = (project.simulations || [])[0];
  w.text('2. Validación de mercado (MVP Validator)', { size: 14, style: 'bold', gap: 4 });
  if (sim?.results) {
    const r = sim.results;
    const acc = r.acceptance_rate || {};
    const buy = r.purchase_intent_probability || {};
    w.text(`Aceptación de mercado: ${pct(acc.mean)}  (IC 95%: ${pct(acc.ci_95_lower)} – ${pct(acc.ci_95_upper)})`, { size: 11, style: 'bold' });
    w.text(`Intención de compra: ${pct(buy.mean)}  (IC 95%: ${pct(buy.ci_95_lower)} – ${pct(buy.ci_95_upper)})`, { size: 11, style: 'bold', gap: 4 });
    if ((r.top_objections || []).length) {
      w.text('Principales objeciones:', { size: 11, style: 'bold' });
      r.top_objections.forEach((o) =>
        w.text(`• ${OBJECTION_ES[o.objection] || o.objection}: ${pct(o.frequency)}`, { size: 10, color: [60, 60, 70] }));
    }
    if ((r.feature_importance || []).length) {
      w.text('Importancia de características:', { size: 11, style: 'bold' });
      r.feature_importance.forEach((f) =>
        w.text(`• ${f.feature}: ${pct(f.importance)}`, { size: 10, color: [60, 60, 70] }));
    }
    if (sim.insights?.summary) w.text(`Insight: ${sim.insights.summary}`, { size: 10, style: 'italic', color: [60, 60, 70] });
    w.text(`Motor de audiencias: ${sim.audience_source === 'claude' ? 'IA (Claude)' : 'heurístico determinista'}`, { size: 9, color: [130, 130, 140] });
  } else {
    w.text('Sin simulación ejecutada aún.', { size: 10, style: 'italic', color: [130, 130, 140] });
  }
  w.rule();

  // 3) Sesgos (análisis de Strategy más reciente)
  const strat = (project.analyses || []).find((a) => a.module === 'strategy');
  w.text('3. Psicología del cliente (Strategy)', { size: 14, style: 'bold', gap: 4 });
  if (strat?.result) {
    const r = strat.result;
    w.text(`Probabilidad de conversión: ${r.conversion_probability || '—'}  ·  Decisión: ${r.decision_system || '—'}`, { size: 11, style: 'bold' });
    if (r.summary) w.text(`Insight: ${r.summary}`, { size: 10, style: 'italic', color: [60, 60, 70], gap: 4 });
    (r.biases || []).forEach((b) => {
      w.text(`${b.rank}. ${b.name}  ·  ${b.intensity}/100`, { size: 11, style: 'bold', color: [40, 40, 60] });
      w.text(`Por qué: ${b.why}`, { size: 10, color: [60, 60, 70] });
      w.text(`Acción: ${b.action}`, { size: 10, gap: 6 });
    });
    if (r.main_friction) w.text(`Fricción principal: ${r.main_friction}`, { size: 10 });
    if (r.recommended_trigger) w.text(`Disparador recomendado: ${r.recommended_trigger}`, { size: 10 });
  } else {
    w.text('Sin análisis de sesgos aún.', { size: 10, style: 'italic', color: [130, 130, 140] });
  }
  w.rule();

  // 4) Landing Analyzer (auditoría más reciente)
  const landing = (project.analyses || []).find((a) => a.module === 'landing');
  w.text('4. Auditoría de landing (Landing Analyzer)', { size: 14, style: 'bold', gap: 4 });
  if (landing?.result) {
    const r = landing.result;
    w.text(`Score de conversión: ${r.score}/100 — ${r.bandLabel || ''}`, { size: 11, style: 'bold' });
    w.text(`Principios de persuasión activos: ${r.principles_active}/9 · Alertas éticas: ${r.ethics_alerts}`, { size: 10, color: [60, 60, 70], gap: 4 });
    Object.values(r.dimensions || {}).forEach((d) => {
      w.text(`• ${d.label}: ${d.score}/100 (${d.passed}/${d.total} checks)`, { size: 10, color: [60, 60, 70] });
    });
    const ethBad = (r.ethics || []).filter((e) => e.verdict !== 'ok');
    if (ethBad.length) {
      w.text('Semáforo ético — puntos a revisar:', { size: 11, style: 'bold' });
      ethBad.forEach((e) => w.text(`• [${e.verdict === 'alerta' ? 'ALERTA' : 'Revisar'}] ${e.label}: ${e.detail}`, { size: 9.5, color: [120, 60, 50] }));
    }
    (r.recommendations || []).slice(0, 5).forEach((rec, i) => {
      w.text(`${i + 1}. ${rec.missing}${rec.impact ? ` — ${rec.impact}` : ''}`, { size: 9.5, color: [60, 60, 70] });
    });
  } else {
    w.text('Sin auditoría de landing aún.', { size: 10, style: 'italic', color: [130, 130, 140] });
  }
  w.rule();

  // 5) Copy (generaciones de Copy Studio, la más reciente por modo)
  const copies = (project.analyses || []).filter((a) => a.module === 'copy_studio');
  w.text('5. Copy y ángulos (Copy Studio)', { size: 14, style: 'bold', gap: 4 });
  if (copies.length === 0) {
    w.text('Sin copy generado aún.', { size: 10, style: 'italic', color: [130, 130, 140] });
  }
  copies.forEach((c) => {
    const r = c.result || {};
    if (r.angles) {
      w.text('Ángulos creativos', { size: 12, style: 'bold', gap: 2 });
      r.angles.forEach((a, i) => {
        w.text(`${i + 1}. ${a.title}  [${a.bias}]`, { size: 10, style: 'bold' });
        w.text(`${a.big_idea} — ${a.execution}`, { size: 10, color: [60, 60, 70] });
        w.text(`Gancho: ${a.hook}`, { size: 10, style: 'italic', color: [110, 110, 120], gap: 4 });
      });
    } else {
      w.text('Copy', { size: 12, style: 'bold', gap: 2 });
      (r.headlines || []).forEach((h) => w.text(`• ${h.text}  [${h.bias}]`, { size: 10 }));
      (r.cta || []).forEach((c2) => w.text(`CTA: ${c2.text}  [${c2.bias}]`, { size: 10 }));
      if (r.body) w.text(r.body, { size: 10, color: [60, 60, 70] });
      (r.subject_lines || []).forEach((s) => w.text(`Asunto: ${s}`, { size: 10, color: [60, 60, 70] }));
    }
    w.text('', { gap: 4 });
  });

  const safe = (project.name || 'proyecto').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  doc.save(`informe-${safe}.pdf`);
}

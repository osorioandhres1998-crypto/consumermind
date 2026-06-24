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

function header(w, subtitle) {
  w.text('ConsumerMind', { size: 20, style: 'bold', color: [67, 56, 202] });
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

/**
 * EXPORTACIÓN ACCIONABLE DE COPY — Bloque 3.4 de DEUDA-TECNICA.md
 * ------------------------------------------------------------
 * Convierte el resultado de Copy Studio en texto listo para pegar en las
 * plataformas publicitarias, validando los LÍMITES DE CARACTERES reales:
 *  - Meta Ads:   texto principal ≈125 recomendados · titular 40 · descripción 30
 *  - Google RSA: titulares ≤30 (hasta 15) · descripciones ≤90 (hasta 4)
 * Cada línea se anota con su conteo y una advertencia si excede el límite,
 * para que el marketer recorte ANTES de pegar (las plataformas truncan sin avisar).
 */

function annotate(text, limit) {
  const len = (text || '').length;
  const mark = len <= limit ? '✓' : '⚠ RECORTAR';
  return `${text}\n   [${len}/${limit} caracteres ${mark}]`;
}

/** Export para Meta Ads (Facebook/Instagram). */
export function buildMetaExport(result) {
  const r = result?.result || result || {};
  const lines = [];
  lines.push('=== META ADS (Facebook / Instagram) ===');
  lines.push('');

  lines.push('— TEXTO PRINCIPAL (recomendado ≤125 visibles antes del "ver más") —');
  if (r.body) lines.push(annotate(r.body, 125));
  else lines.push('(sin cuerpo generado)');
  lines.push('');

  lines.push('— TITULARES (límite 40) —');
  (r.headlines || []).forEach((h, i) => lines.push(`${i + 1}. ${annotate(h.text, 40)}`));
  lines.push('');

  lines.push('— DESCRIPCIONES (límite 30) · usa los CTA como base —');
  (r.cta || []).forEach((c, i) => lines.push(`${i + 1}. ${annotate(c.text, 30)}`));
  lines.push('');

  lines.push('— SESGO QUE ACTIVA CADA VARIANTE —');
  (r.headlines || []).forEach((h, i) => lines.push(`Titular ${i + 1}: ${h.bias}`));
  lines.push('');
  lines.push('UTM sugerido: ?utm_source=meta&utm_medium=paid&utm_campaign=NOMBRE&utm_content=titular-N');

  return lines.join('\n');
}

/** Export para Google Ads (anuncio adaptable de búsqueda, RSA). */
export function buildGoogleRsaExport(result) {
  const r = result?.result || result || {};
  const lines = [];
  lines.push('=== GOOGLE ADS — Anuncio adaptable de búsqueda (RSA) ===');
  lines.push('');

  lines.push('— TITULARES (límite 30 · Google acepta hasta 15) —');
  (r.headlines || []).forEach((h, i) => lines.push(`${i + 1}. ${annotate(h.text, 30)}`));
  (r.cta || []).forEach((c, i) => lines.push(`${(r.headlines || []).length + i + 1}. ${annotate(c.text, 30)}`));
  lines.push('');

  lines.push('— DESCRIPCIONES (límite 90 · hasta 4) —');
  if (r.body) {
    // Divide el cuerpo en oraciones para candidatas de descripción.
    const sentences = String(r.body).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 4);
    sentences.forEach((s, i) => lines.push(`${i + 1}. ${annotate(s.trim(), 90)}`));
  } else {
    lines.push('(sin cuerpo generado)');
  }
  lines.push('');
  lines.push('UTM sugerido: ?utm_source=google&utm_medium=cpc&utm_campaign=NOMBRE&utm_content=rsa');

  return lines.join('\n');
}

/** Export de asuntos de email (si el copy los trae). */
export function buildEmailExport(result) {
  const r = result?.result || result || {};
  if (!r.subject_lines?.length) return null;
  const lines = ['=== ASUNTOS DE EMAIL (recomendado ≤50) ==='];
  r.subject_lines.forEach((s, i) => lines.push(`${i + 1}. ${annotate(s, 50)}`));
  return lines.join('\n');
}

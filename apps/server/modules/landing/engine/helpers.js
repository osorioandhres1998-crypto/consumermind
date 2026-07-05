/**
 * Helpers compartidos del motor de reglas del Landing Analyzer.
 * Cada regla devuelve checks { id, label, pass, evidence, impact? }:
 * `evidence` explica QUÉ encontró (o no) el motor — transparencia frente
 * a falsos positivos (riesgo documentado en el plan).
 */

/** Texto plano normalizado del documento (minúsculas, espacios colapsados). */
function pageText($) {
  return $('body').text().replace(/\s+/g, ' ').trim().toLowerCase();
}

/** ¿Alguna de las palabras/regex aparece en el texto? Devuelve la primera coincidencia. */
function findAny(text, patterns) {
  for (const p of patterns) {
    if (p instanceof RegExp) {
      const m = text.match(p);
      if (m) return m[0];
    } else if (text.includes(p)) {
      return p;
    }
  }
  return null;
}

/** Texto visible de los CTAs (botones y enlaces con pinta de botón). */
function ctaTexts($) {
  const sel = 'button, input[type=submit], a[class*="btn"], a[class*="button"], a[class*="cta"], [role="button"]';
  const out = [];
  $(sel).each((_, el) => {
    const t = ($(el).text() || $(el).attr('value') || '').replace(/\s+/g, ' ').trim();
    if (t && t.length <= 60) out.push(t);
  });
  return out;
}

/** Campos visibles del formulario principal (el de más campos). */
function mainFormFields($) {
  let max = null;
  $('form').each((_, f) => {
    const fields = $(f).find('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea');
    if (!max || fields.length > max.count) max = { count: fields.length, form: f };
  });
  return max; // null si no hay formularios
}

/** Recorte de evidencia para no guardar párrafos enteros. */
function ev(s, len = 90) {
  if (!s) return '';
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > len ? t.slice(0, len) + '…' : t;
}

module.exports = { pageText, findAny, ctaTexts, mainFormFields, ev };

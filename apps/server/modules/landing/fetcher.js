/**
 * FETCHER — Landing Analyzer
 * ------------------------------------------------------------
 * Descarga el HTML de una landing con límites de seguridad y detecta
 * si la página parece renderizarse con JavaScript (HTML "vacío"),
 * para que la UI ofrezca el fallback de pegar el HTML manualmente.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB: límite del plan (riesgo "páginas enormes")
const TIMEOUT_MS = 15000;

// User-agent de navegador: muchos sitios devuelven 403 a agentes desconocidos.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchLanding(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    const e = new Error('URL inválida.');
    e.code = 'BAD_URL';
    throw e;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    const e = new Error('Solo se admiten URLs http/https.');
    e.code = 'BAD_URL';
    throw e;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(parsed.href, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
  } catch (err) {
    const e = new Error(`No se pudo descargar la página: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    e.code = 'FETCH_FAILED';
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const e = new Error(`La página respondió ${res.status}. Puede estar bloqueando bots: usa el fallback de pegar el HTML.`);
    e.code = 'HTTP_' + res.status;
    throw e;
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    const e = new Error('La página supera el límite de 5 MB.');
    e.code = 'TOO_BIG';
    throw e;
  }

  return {
    html: Buffer.from(buf).toString('utf8'),
    finalUrl: res.url || parsed.href,
    bytes: buf.byteLength,
  };
}

/**
 * Heurística de render JS: si el body casi no tiene texto ni nodos,
 * lo más probable es que el contenido se pinte con JavaScript y el
 * análisis del HTML crudo sería injusto.
 */
function detectJsRender($) {
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const nodes = $('body *').length;
  return text.length < 400 || nodes < 30;
}

module.exports = { fetchLanding, detectJsRender, MAX_BYTES };

/**
 * IMPORTADOR CSV — ProfitGuard (N1-A del plan enterprise)
 * ------------------------------------------------------------
 * Parsea EN EL NAVEGADOR los exports de Meta Ads / Google Ads (o un CSV
 * genérico con mapeo manual) y agrega el periodo en los campos que ya
 * usa la calculadora (ads, ingresos, órdenes, cpc...).
 *
 * Decisión (ADR): el CSV nunca viaja al servidor. Solo el agregado
 * mensual, si el usuario decide guardarlo como snapshot.
 */

/** Parser CSV mínimo, tolerante a comillas y comas dentro de campos. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // ignorar; \n cierra la fila
    } else if (c === '\n') {
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, records };
}

// Sinónimos de columnas (ES/EN) de los exports estándar de Meta Ads y Google Ads.
const COLUMN_SYNONYMS = {
  spend: ['amount spent (cop)', 'amount spent', 'importe gastado', 'cost', 'costo', 'spend'],
  revenue: ['purchases conversion value', 'conversion value', 'valor de conversión', 'website purchases conversion value', 'all conv. value', 'total conv. value'],
  clicks: ['link clicks', 'clicks', 'clics', 'clics en el enlace'],
  purchases: ['purchases', 'compras', 'website purchases', 'conversions', 'conversiones'],
  cpc: ['cpc (cost per link click)', 'cpc', 'avg. cpc', 'cpc prom.'],
};

function normalize(s) {
  return String(s || '').toLowerCase().trim();
}

function findColumn(headers, synonyms) {
  const norm = headers.map(normalize);
  for (const syn of synonyms) {
    const idx = norm.findIndex((h) => h === syn || h.includes(syn));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function toNumber(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/**
 * Detecta el formato (Meta/Google/genérico) por las cabeceras y agrega
 * el periodo completo del archivo. `columnMap` permite forzar el mapeo
 * manual cuando la detección automática falla (CSV genérico).
 */
export function detectAndAggregate(text, columnMap = null) {
  const { headers, records } = parseCsv(text);
  if (!headers.length || !records.length) {
    return { ok: false, error: 'El archivo no tiene filas de datos.' };
  }

  const map = columnMap || {
    spend: findColumn(headers, COLUMN_SYNONYMS.spend),
    revenue: findColumn(headers, COLUMN_SYNONYMS.revenue),
    clicks: findColumn(headers, COLUMN_SYNONYMS.clicks),
    purchases: findColumn(headers, COLUMN_SYNONYMS.purchases),
    cpc: findColumn(headers, COLUMN_SYNONYMS.cpc),
  };

  const missing = ['spend'].filter((k) => !map[k]); // gasto es el único imprescindible
  if (missing.length) {
    return { ok: false, error: 'No se detectó la columna de gasto en ads.', headers, map, records };
  }

  let spend = 0, revenue = 0, clicks = 0, purchases = 0, cpcSum = 0, cpcCount = 0;
  for (const r of records) {
    spend += toNumber(r[map.spend]);
    if (map.revenue) revenue += toNumber(r[map.revenue]);
    if (map.clicks) clicks += toNumber(r[map.clicks]);
    if (map.purchases) purchases += toNumber(r[map.purchases]);
    if (map.cpc) { const v = toNumber(r[map.cpc]); if (v > 0) { cpcSum += v; cpcCount++; } }
  }
  const cpc = cpcCount > 0 ? cpcSum / cpcCount : (clicks > 0 ? spend / clicks : 0);

  return {
    ok: true,
    headers, map, rowCount: records.length,
    aggregated: {
      adsPeriodo: Math.round(spend),
      ingresosPeriodo: Math.round(revenue),
      ordenesPeriodo: Math.round(purchases),
      cpc: Math.round(cpc),
    },
  };
}

/** Detecta la plataforma solo por el nombre de las cabeceras (informativo para la UI). */
export function guessSource(headers) {
  const norm = headers.map(normalize).join(' | ');
  if (norm.includes('amount spent') || norm.includes('importe gastado') || norm.includes('link clicks')) return 'meta';
  if (norm.includes('cost') && (norm.includes('conversions') || norm.includes('avg. cpc'))) return 'google';
  return 'csv';
}

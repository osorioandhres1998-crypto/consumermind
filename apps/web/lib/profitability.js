/**
 * MOTOR DE CÁLCULO — Calculadora de Rentabilidad (ProfitGuard)
 * ------------------------------------------------------------
 * Funciones puras, desacopladas de la UI (ADR-002 de la spec):
 * la lógica es financiera y debe ser testeable y portable.
 *
 * Modelo (spec §9, corregido frente al borrador original):
 *  - Devoluciones como % de órdenes, producto recuperable → se pierde
 *    envío + comisión, no el producto.
 *  - roas_objetivo es dimensionalmente correcto (ingresos/ads): el ROAS
 *    necesario para cubrir ads + estructura fija de marketing.
 *
 * Caso ancla (spec §14): precio 100.000, costo 40.000, envío 8.000,
 * comisión 3%, devolución 5% → margen 48,45%, CAC máx 48.450,
 * ROAS break-even 2,064.
 */

export const CURRENCIES = {
  COP: { symbol: '$',  locale: 'es-CO', decimals: 0 },
  USD: { symbol: '$',  locale: 'en-US', decimals: 2 },
  EUR: { symbol: '€',  locale: 'es-ES', decimals: 2 },
  MXN: { symbol: '$',  locale: 'es-MX', decimals: 2 },
  ARS: { symbol: '$',  locale: 'es-AR', decimals: 0 },
  CLP: { symbol: '$',  locale: 'es-CL', decimals: 0 },
  PEN: { symbol: 'S/', locale: 'es-PE', decimals: 2 },
  BRL: { symbol: 'R$', locale: 'pt-BR', decimals: 2 },
};

// BENCHMARKS documentados (spec §11 y módulo LTV/MER — no son números mágicos):
// - Margen de contribución sano en e-commerce: > 30%.
// - CVR típico e-commerce: 1,5–3%.
// - Ratio LTV/CAC: <1 destruye valor · 1–3 riesgo · 3–5 saludable · >5 posible subinversión.
// - Payback: <6 meses excelente · 6–12 saludable · 12–18 zona neutra (sin recomendación) · >18 capital paciente.
// - MER (banda de industria, referencial): <3 riesgo · 3–5 saludable · >5 espacio para escalar.
export const BENCHMARKS = {
  MARGEN_MINIMO: 0.30,
  CVR_BAJO: 0.015,
  LTV_CAC_MALO: 1, LTV_CAC_SANO: 3, LTV_CAC_ALTO: 5,
  PAYBACK_EXCELENTE: 6, PAYBACK_SANO: 12, PAYBACK_LARGO: 18,
  MER_RIESGO: 3, MER_ALTO: 5,
};

/** Parsea un input de usuario a número (acepta coma decimal). */
export function parseNum(s) {
  const v = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
}

/**
 * Métricas core (spec §9).
 * @param i inputs numéricos: precio, costoProducto, costoEnvio, comisionPct,
 *          devolucionPct, ads, fijos, ingresos, ordenes, roasMode, roasManual
 */
export function computeCore(i) {
  const comisionUnit = i.precio * i.comisionPct;
  const perdidaDevol = i.devolucionPct * (i.costoEnvio + comisionUnit);
  const costoVarOrden = i.costoProducto + i.costoEnvio + comisionUnit + perdidaDevol;
  const margenAbs = i.precio - costoVarOrden;
  const margenPct = i.precio > 0 ? margenAbs / i.precio : 0;
  const margenInvalido = margenAbs <= 0 || i.precio <= 0;
  const cacMaximo = margenAbs;
  const roasBreakEven = margenAbs > 0 ? i.precio / margenAbs : Infinity;
  const roasObjetivo = (i.ads > 0 && margenPct > 0) ? (i.ads + i.fijos) / (i.ads * margenPct) : Infinity;
  const ventasNec = margenPct > 0 ? (i.ads + i.fijos) / margenPct : Infinity;
  const ordenesNec = i.precio > 0 ? ventasNec / i.precio : Infinity;
  const cpaObjetivo = (isFinite(ordenesNec) && ordenesNec > 0) ? i.ads / ordenesNec : Infinity;
  const roasActual = i.roasMode === 'manual'
    ? i.roasManual
    : (i.ads > 0 ? i.ingresos / i.ads : Infinity);
  const cpaActual = i.ordenes > 0 ? i.ads / i.ordenes : null;

  // ---- Módulo LTV + CAC real + MER ----
  // LTV reusa margenPct (decisión confirmada: no se pide margen bruto separado).
  // Con frecuencia=1 y retención=1, ltv === margenAbs (=CAC máximo): defaults neutros.
  const frecuenciaMensual = i.frecuenciaMensual || 1;
  const retencionMeses = i.retencionMeses || 1;
  const ltvBruto = i.precio * frecuenciaMensual * retencionMeses;
  const ltv = ltvBruto * margenPct;

  // CAC real (blended): incluye fijos de marketing, no solo la pauta.
  // Si no se declara clientesNuevos, usa las órdenes del periodo como fallback.
  const clientesNuevos = i.clientesNuevos > 0 ? i.clientesNuevos : i.ordenes;
  const cacReal = clientesNuevos > 0 ? (i.ads + i.fijos) / clientesNuevos : Infinity;

  const ratioLtvCac = cacReal > 0 && isFinite(cacReal) ? ltv / cacReal : Infinity;
  const margenMensualCliente = i.precio * frecuenciaMensual * margenPct;
  const paybackMeses = margenMensualCliente > 0 ? cacReal / margenMensualCliente : Infinity;

  // MER real: ingresos sobre TODO el gasto de marketing (ads + fijos).
  // Distinto del ROAS actual (ingresos / ads). No dispara el semáforo principal.
  const mer = (i.ads + i.fijos) > 0 ? i.ingresos / (i.ads + i.fijos) : Infinity;

  return {
    comisionUnit, perdidaDevol, costoVarOrden, margenAbs, margenPct, margenInvalido,
    cacMaximo, roasBreakEven, roasObjetivo, ventasNec, ordenesNec, cpaObjetivo,
    roasActual, cpaActual,
    ltv, ltvBruto, cacReal, ratioLtvCac, paybackMeses, mer, clientesNuevos,
  };
}

/** Banda del ratio LTV/CAC → tono visual. */
export function ltvCacBand(r) {
  if (!isFinite(r)) return { tone: 'info', label: '—' };
  if (r < BENCHMARKS.LTV_CAC_MALO) return { tone: 'bad', label: 'destruye valor' };
  if (r < BENCHMARKS.LTV_CAC_SANO) return { tone: 'warn', label: 'riesgo' };
  if (r <= BENCHMARKS.LTV_CAC_ALTO) return { tone: 'ok', label: 'saludable' };
  return { tone: 'info', label: 'posible subinversión' };
}

/** Banda del payback en meses → tono visual. */
export function paybackBand(p) {
  if (!isFinite(p)) return { tone: 'info', label: '—' };
  if (p < BENCHMARKS.PAYBACK_EXCELENTE) return { tone: 'ok', label: 'excelente' };
  if (p <= BENCHMARKS.PAYBACK_SANO) return { tone: 'ok', label: 'saludable' };
  if (p <= BENCHMARKS.PAYBACK_LARGO) return { tone: 'info', label: 'zona neutra' };
  return { tone: 'warn', label: 'capital paciente' };
}

/** Banda del MER → tono visual (referencial, no toca el semáforo). */
export function merBand(m) {
  if (!isFinite(m)) return { tone: 'info', label: '—' };
  if (m < BENCHMARKS.MER_RIESGO) return { tone: 'warn', label: 'zona de riesgo' };
  if (m <= BENCHMARKS.MER_ALTO) return { tone: 'ok', label: 'saludable' };
  return { tone: 'ok', label: 'espacio para escalar' };
}

/** Semáforo (spec §11): 'invalid' | 'bad' | 'warn' | 'ok'. */
export function diagnose(m) {
  if (m.margenInvalido) return 'invalid';
  if (m.roasActual < m.roasBreakEven) return 'bad';
  if (m.roasActual < m.roasObjetivo) return 'warn';
  return 'ok';
}

/** Escenario Presupuesto: nuevo gasto en ads → umbrales recalculados. */
export function scenarioBudget(m, i, newAds) {
  const ventasNec = m.margenPct > 0 ? (newAds + i.fijos) / m.margenPct : Infinity;
  const ordenesNec = i.precio > 0 ? ventasNec / i.precio : Infinity;
  const roasReq = (newAds > 0 && m.margenPct > 0) ? (newAds + i.fijos) / (newAds * m.margenPct) : Infinity;
  const cpaObj = (isFinite(ordenesNec) && ordenesNec > 0) ? newAds / ordenesNec : Infinity;
  return { ventasNec, ordenesNec, roasReq, cpaObj };
}

/** Escenario Precio: nuevo precio → economía unitaria recalculada. */
export function scenarioPrice(i, newPrecio) {
  const comUnit = newPrecio * i.comisionPct;
  const perd = i.devolucionPct * (i.costoEnvio + comUnit);
  const costoVar = i.costoProducto + i.costoEnvio + comUnit + perd;
  const margenAbs = newPrecio - costoVar;
  const margenPct = newPrecio > 0 ? margenAbs / newPrecio : 0;
  const roasBreakEven = margenAbs > 0 ? newPrecio / margenAbs : Infinity;
  const roasObjetivo = (i.ads > 0 && margenPct > 0) ? (i.ads + i.fijos) / (i.ads * margenPct) : Infinity;
  return { margenAbs, margenPct, roasBreakEven, roasObjetivo, cacMaximo: margenAbs };
}

/** Escenario CVR: nueva conversión → CPA estimado vs CAC máximo. */
export function scenarioCvr(m, i, cvr) {
  const cpa = cvr > 0 ? i.cpc / cvr : Infinity;
  return { cpa, rentable: isFinite(cpa) && cpa <= m.cacMaximo };
}

/**
 * Recomendaciones deterministas (spec §11). Devuelve una lista de
 * { tone: 'ok'|'warn'|'orange'|'bad'|'info', title, body }.
 */
export function recommend(m, fm) {
  const status = diagnose(m);
  const recos = [];

  if (status === 'invalid') {
    recos.push({
      tone: 'bad', title: 'Corrige tu economía unitaria',
      body: 'Tus costos variables igualan o superan el precio. Sube precio o baja costo/envío/comisión antes de invertir en ads.',
    });
    return recos;
  }

  if (m.margenPct >= BENCHMARKS.MARGEN_MINIMO) {
    recos.push({
      tone: 'ok', title: 'Margen saludable',
      body: `Tu margen de contribución es ${fm.pct(m.margenPct)}, por encima del 30% recomendado. Tienes base para escalar.`,
    });
  } else {
    recos.push({
      tone: 'warn', title: 'Margen bajo',
      body: `Tu margen de contribución es ${fm.pct(m.margenPct)}, por debajo del 30% recomendado. Sube precio o baja costo variable antes de escalar.`,
    });
  }

  if (m.cpaActual != null) {
    if (m.cpaActual > m.cpaObjetivo) {
      recos.push({
        tone: 'warn', title: 'CPA por encima del objetivo',
        body: `Tu CPA actual (${fm.money(m.cpaActual)}) supera el CPA objetivo (${fm.money(m.cpaObjetivo)}) necesario para cubrir tu estructura. Optimiza tu conversión o reduce tu CPC.`,
      });
    } else {
      recos.push({
        tone: 'ok', title: 'CPA bajo control',
        body: `Tu CPA actual (${fm.money(m.cpaActual)}) está por debajo del objetivo (${fm.money(m.cpaObjetivo)}). Cada cliente entra a un costo sostenible.`,
      });
    }
  } else {
    recos.push({
      tone: 'info', title: 'Sin órdenes este periodo',
      body: 'Ingresa el número de órdenes para evaluar tu CPA actual; por ahora el diagnóstico usa solo el ROAS.',
    });
  }

  if (status === 'bad') {
    recos.push({
      tone: 'bad', title: 'Estás perdiendo dinero',
      body: `Tu ROAS (${fm.r2(m.roasActual)}) no cubre ni el costo variable (break-even ${fm.r2(m.roasBreakEven)}). No escales: corrige economía unitaria o creativos primero.`,
    });
  } else if (status === 'warn') {
    recos.push({
      tone: 'orange', title: 'Casi rentable: optimiza antes de escalar',
      body: 'Cubres el costo de producto pero no el total de tu estructura (ads + equipo + herramientas). Mejora CVR o sube tu ticket para cerrar la brecha.',
    });
  } else {
    recos.push({
      tone: 'ok', title: 'Rentable: tienes espacio para escalar',
      body: `Tu ROAS (${fm.r2(m.roasActual)}) supera el objetivo (${fm.r2(m.roasObjetivo)}). Puedes subir presupuesto con cuidado manteniendo el CPA.`,
    });
  }

  // ---- Módulo LTV / CAC real / MER ----
  if (isFinite(m.ratioLtvCac)) {
    if (m.ratioLtvCac < BENCHMARKS.LTV_CAC_MALO) {
      recos.push({
        tone: 'bad', title: 'Tu LTV/CAC destruye valor',
        body: `Cada cliente te deja ${fm.money(m.ltv)} en su vida útil pero te cuesta ${fm.money(m.cacReal)} adquirirlo (ratio ${m.ratioLtvCac.toFixed(2).replace('.', ',')}). Pierdes dinero por cliente: sube retención/frecuencia o baja tu CAC.`,
      });
    } else if (m.ratioLtvCac < BENCHMARKS.LTV_CAC_SANO) {
      recos.push({
        tone: 'warn', title: 'Ratio LTV/CAC en zona de riesgo',
        body: `Tu ratio LTV/CAC es ${m.ratioLtvCac.toFixed(2).replace('.', ',')} (sano: 3–5). El cliente paga su adquisición pero deja poco excedente para crecer.`,
      });
    } else if (m.ratioLtvCac > BENCHMARKS.LTV_CAC_ALTO) {
      recos.push({
        tone: 'info', title: 'Posible subinversión en adquisición',
        body: `Tu ratio LTV/CAC es ${m.ratioLtvCac.toFixed(2).replace('.', ',')} (>5). Podrías estar invirtiendo menos de lo que tu economía permite: hay espacio para adquirir más agresivamente.`,
      });
    }
  }

  if (isFinite(m.paybackMeses)) {
    if (m.paybackMeses > BENCHMARKS.PAYBACK_LARGO) {
      recos.push({
        tone: 'warn', title: 'Payback largo: exige capital paciente',
        body: `Recuperas el costo de adquirir un cliente en ${m.paybackMeses.toFixed(1).replace('.', ',')} meses (>18). Necesitas caja para sostener ese ciclo; evalúa acelerar la recompra o reducir el CAC.`,
      });
    } else if (m.paybackMeses < BENCHMARKS.PAYBACK_EXCELENTE) {
      recos.push({
        tone: 'ok', title: 'Payback excelente',
        body: `Recuperas la inversión por cliente en ${m.paybackMeses.toFixed(1).replace('.', ',')} meses (<6). Tu ciclo de caja soporta escalar adquisición.`,
      });
    }
    // 12–18 meses: zona neutra sin recomendación (umbral no definido por el curso).
  }

  if (m.cpaActual != null && isFinite(m.cacReal) && m.cpaActual < m.cacReal) {
    recos.push({
      tone: 'warn', title: 'CPA de plataforma ≠ CAC real',
      body: `Tu CPA de plataforma (${fm.money(m.cpaActual)}) se ve bien, pero tu CAC real —sumando equipo y herramientas— es ${fm.money(m.cacReal)}. No confundas los dos números frente a finanzas.`,
    });
  }

  if (isFinite(m.mer) && m.mer < BENCHMARKS.MER_RIESGO) {
    recos.push({
      tone: 'warn', title: 'MER en zona de riesgo',
      body: `Tus ingresos son solo ${m.mer.toFixed(2).replace('.', ',')}× todo tu gasto de marketing (ads + fijos). La banda sana de la industria es 3–5.`,
    });
  }

  return recos;
}

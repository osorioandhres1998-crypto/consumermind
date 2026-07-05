/**
 * BENCHMARKS POR VERTICAL — N2-C del plan enterprise
 * ------------------------------------------------------------
 * Calibra las bandas genéricas de ProfitGuard y el score objetivo del
 * Landing Analyzer según el tipo de negocio del proyecto. Los umbrales
 * genéricos (lib/profitability.js BENCHMARKS) vienen de los documentos
 * de CRO/marketing y NO especifican variación por vertical — estos
 * ajustes son de referencia consultiva (rangos habituales de mercado
 * por ciclo de ventas y modelo de ingresos), pensados para calibrarse
 * con cohortes reales del cliente. Fallback: sin vertical, se usan las
 * bandas genéricas existentes (comportamiento sin cambios).
 */

export const VERTICALS = {
  ecommerce: {
    label: 'E-commerce',
    // Ciclo de compra corto, ticket bajo/medio: MER y payback exigentes.
    mer: { riesgo: 3, sano: 5 },
    ltvCac: { malo: 1, sano: 3, alto: 5 },
    payback: { excelente: 3, sano: 6, largo: 12 }, // meses
    landingScoreTarget: 75,
    note: 'Ciclo de compra corto: se espera recuperar el CAC más rápido que en SaaS/servicios.',
  },
  saas: {
    label: 'SaaS',
    // Ciclo de ventas más largo, ingresos recurrentes: tolera paybacks mayores.
    mer: { riesgo: 2.5, sano: 4 },
    ltvCac: { malo: 1, sano: 3, alto: 7 }, // SaaS sano suele buscar LTV/CAC más alto (recurrencia)
    payback: { excelente: 6, sano: 12, largo: 18 },
    landingScoreTarget: 70,
    note: 'Ingresos recurrentes: el payback puede ser más largo si la retención es alta.',
  },
  servicios: {
    label: 'Servicios / Agencia',
    // Ticket alto, ciclo de decisión largo, volumen de leads bajo.
    mer: { riesgo: 2, sano: 3.5 },
    ltvCac: { malo: 1, sano: 2.5, alto: 5 },
    payback: { excelente: 4, sano: 9, largo: 15 },
    landingScoreTarget: 65,
    note: 'Ticket alto y ciclo de decisión largo: menos volumen, más valor por cliente.',
  },
};

/** Devuelve las bandas del vertical, o null si no aplica (usar genéricas). */
export function getVerticalBenchmarks(vertical) {
  return VERTICALS[vertical] || null;
}

/** Banda de MER ajustada por vertical (misma forma que merBand() genérico). */
export function merBandFor(vertical, value) {
  const v = getVerticalBenchmarks(vertical);
  if (!v || !isFinite(value)) return null;
  if (value < v.mer.riesgo) return { tone: 'warn', label: `zona de riesgo (${v.label})` };
  if (value <= v.mer.sano) return { tone: 'ok', label: `saludable (${v.label})` };
  return { tone: 'ok', label: `espacio para escalar (${v.label})` };
}

/** Banda de LTV/CAC ajustada por vertical. */
export function ltvCacBandFor(vertical, value) {
  const v = getVerticalBenchmarks(vertical);
  if (!v || !isFinite(value)) return null;
  if (value < v.ltvCac.malo) return { tone: 'bad', label: `destruye valor (${v.label})` };
  if (value < v.ltvCac.sano) return { tone: 'warn', label: `riesgo (${v.label})` };
  if (value <= v.ltvCac.alto) return { tone: 'ok', label: `saludable (${v.label})` };
  return { tone: 'info', label: `posible subinversión (${v.label})` };
}

/** Banda de payback (meses) ajustada por vertical. */
export function paybackBandFor(vertical, months) {
  const v = getVerticalBenchmarks(vertical);
  if (!v || !isFinite(months)) return null;
  if (months < v.payback.excelente) return { tone: 'ok', label: `excelente (${v.label})` };
  if (months <= v.payback.sano) return { tone: 'ok', label: `saludable (${v.label})` };
  if (months <= v.payback.largo) return { tone: 'info', label: `zona neutra (${v.label})` };
  return { tone: 'warn', label: `capital paciente (${v.label})` };
}

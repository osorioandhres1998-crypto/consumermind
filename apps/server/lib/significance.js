/**
 * SIGNIFICANCIA ESTADÍSTICA — Registro de experimentos A/B (N2-B)
 * ------------------------------------------------------------
 * Test z de dos proporciones (estándar de la industria CRO), determinista,
 * sin dependencias — mismo espíritu que el motor de ProfitGuard.
 *
 * H0: la tasa de conversión de A y B es igual.
 * Devuelve el z-score, el p-value (aprox. de dos colas) y si es
 * significativo al 95% (|z| >= 1.96).
 */

/** Aproximación de la función de error (Abramowitz & Stegun 7.1.26). */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

/** P(Z <= z) para una normal estándar, vía erf. */
function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Test z de dos proporciones independientes.
 * @param {number} visitorsA  visitantes de la variante A (control)
 * @param {number} conversionsA
 * @param {number} visitorsB  visitantes de la variante B
 * @param {number} conversionsB
 */
function twoProportionZTest(visitorsA, conversionsA, visitorsB, conversionsB) {
  if (visitorsA <= 0 || visitorsB <= 0) {
    return { z: null, pValue: null, significant: false, rateA: null, rateB: null, upliftPct: null, reason: 'Faltan visitantes en alguna variante.' };
  }
  const rateA = conversionsA / visitorsA;
  const rateB = conversionsB / visitorsB;
  const pooled = (conversionsA + conversionsB) / (visitorsA + visitorsB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / visitorsA + 1 / visitorsB));

  if (se === 0) {
    return { z: 0, pValue: 1, significant: false, rateA, rateB, upliftPct: 0, reason: 'Sin varianza (0% o 100% en ambas).' };
  }

  const z = (rateB - rateA) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z))); // dos colas
  const significant = Math.abs(z) >= 1.96; // 95%
  const upliftPct = rateA > 0 ? ((rateB - rateA) / rateA) * 100 : null;

  return { z: +z.toFixed(3), pValue: +pValue.toFixed(4), significant, rateA, rateB, upliftPct };
}

/**
 * Muestras necesarias por variante para detectar un uplift mínimo dado,
 * al 95% de confianza y 80% de poder (aproximación estándar de CRO).
 */
function samplesNeeded(baselineRate, minDetectableUplift) {
  if (baselineRate <= 0 || baselineRate >= 1 || minDetectableUplift <= 0) return null;
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minDetectableUplift);
  const zAlpha = 1.96, zBeta = 0.84; // 95% confianza, 80% poder
  const pBar = (p1 + p2) / 2;
  const n = Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2)
    / Math.pow(p2 - p1, 2);
  return Math.ceil(n);
}

module.exports = { twoProportionZTest, samplesNeeded };

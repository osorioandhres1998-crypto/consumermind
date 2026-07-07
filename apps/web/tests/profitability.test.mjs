/**
 * Tests ancla de ProfitGuard (CLAUDE.md §5.2 y §5.3).
 * Sin framework: `node apps/web/tests/profitability.test.mjs`.
 * Si un número ancla se mueve, es un bug: revertir el cambio.
 */

import assert from 'assert';
import { computeCore } from '../lib/profitability.js';

// --- Caso ancla de la spec (§14): economía unitaria ---
const a = computeCore({
  precio: 100000, costoProducto: 40000, costoEnvio: 8000,
  comisionPct: 0.03, devolucionPct: 0.05,
  ads: 2000000, fijos: 1700000, ingresos: 5000000, ordenes: 50,
  roasMode: 'auto', roasManual: 0,
});
assert.strictEqual(a.comisionUnit, 3000, 'comisión por orden');
assert.strictEqual(a.perdidaDevol, 550, 'pérdida por devolución');
assert.strictEqual(a.costoVarOrden, 51550, 'costo variable por orden');
assert.strictEqual(a.margenAbs, 48450, 'margen absoluto');
assert.strictEqual(+(a.margenPct * 100).toFixed(2), 48.45, 'margen %');
assert.strictEqual(a.cacMaximo, 48450, 'CAC máximo');
assert.strictEqual(+a.roasBreakEven.toFixed(3), 2.064, 'ROAS break-even');
// Defaults LTV neutros: frecuencia=1, retención=1 ⇒ ltv === cacMaximo
assert.strictEqual(a.ltv, a.cacMaximo, 'defaults LTV neutros');

// --- Caso de verificación LTV/MER (instrucciones del módulo, §9.7) ---
const v = computeCore({
  precio: 100000, costoProducto: 40000, costoEnvio: 8000,
  comisionPct: 0.03, devolucionPct: 0.05,
  ads: 2000000, fijos: 800000, ingresos: 4500000, ordenes: 45,
  clientesNuevos: 30, frecuenciaMensual: 0.5, retencionMeses: 12,
  roasMode: 'auto', roasManual: 0,
});
assert.strictEqual(Math.round(v.ltv), 290700, 'LTV');
assert.strictEqual(Math.round(v.cacReal), 93333, 'CAC real');
assert.strictEqual(+v.ratioLtvCac.toFixed(2), 3.11, 'ratio LTV/CAC');
assert.strictEqual(+v.paybackMeses.toFixed(2), 3.85, 'payback meses');
assert.strictEqual(+v.mer.toFixed(2), 1.61, 'MER');

console.log('✓ ProfitGuard: caso ancla y verificación LTV/MER exactos.');

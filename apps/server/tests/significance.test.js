/**
 * Tests ancla de significancia A/B (CLAUDE.md §5.4).
 * Sin framework: `node tests/significance.test.js`.
 */

const assert = require('assert');
const { twoProportionZTest, samplesNeeded } = require('../lib/significance');

// 1000/100 vs 1000/130 → z≈2.10, significativo al 95%
const s = twoProportionZTest(1000, 100, 1000, 130);
assert.strictEqual(s.z, 2.103, 'z-score del caso significativo');
assert.strictEqual(s.significant, true, 'debe ser significativo al 95%');
assert.strictEqual(s.upliftPct, 30, 'uplift +30%');

// 1000/100 vs 1000/105 → NO significativo
const n = twoProportionZTest(1000, 100, 1000, 105);
assert.strictEqual(n.significant, false, 'no debe ser significativo');

// Casos límite: sin visitantes → sin veredicto, no crash
const e = twoProportionZTest(0, 0, 100, 10);
assert.strictEqual(e.significant, false, 'sin visitantes en A: no significativo');
assert.strictEqual(e.z, null, 'sin visitantes: z nulo');

// Muestras necesarias: baseline 10%, detectar +20% → ~3837 por variante
assert.strictEqual(samplesNeeded(0.10, 0.20), 3837, 'muestras necesarias');

console.log('✓ Significancia A/B: casos ancla exactos.');

/**
 * Tests del motor del Landing Analyzer (sin framework: `node tests/landing-engine.test.js`).
 * Fixtures sintéticas: una landing "buena", una "vacía" y una con dark patterns.
 * Guardrail: la buena debe puntuar claramente por encima de la vacía, y los
 * dark patterns deben disparar alertas éticas.
 */

const assert = require('assert');
const { analyzeHtml } = require('../modules/landing/engine');

const GOOD = `<!DOCTYPE html><html><head>
<title>Duplica tus ventas</title><meta name="viewport" content="width=device-width">
<meta property="og:title" content="Duplica tus ventas">
</head><body>
<header></header>
<h1>Duplica tus ventas en 90 días sin contratar más equipo</h1>
<p>Te mostramos el sistema paso a paso, sin tecnicismos.</p>
<img src="hero.jpg" alt="clienta sonriendo usando el producto">
<button>Obtén tu auditoría gratis</button>
<section><img src="l1.png" alt="logo acme"><img src="l2.png" alt="logo globex"></section>
<section><h2>¿Cansado de invertir sin resultados?</h2><p>Sabemos lo que frustra ver tu pauta sin retorno.</p></section>
<section><h2>La solución: cómo funciona</h2><p>Descubre el método que pocos conocen para no perder presupuesto.</p></section>
<ul><li>Aumenta tu conversión</li><li>Ahorra 10 horas por semana</li><li>Resultados en 30 días</li></ul>
<div class="testimonial"><blockquote>Duplicamos ventas en 2 meses. — Laura Gómez, CEO de Tienda X</blockquote></div>
<p>Más de 1.200 empresas verificado en Trustpilot ya lo usan.</p>
<section><p>Precio: <del>$500.000</del> $290.000. Oferta termina el 15 de agosto de 2026. Garantía de 30 días.</p></section>
<details><summary>Preguntas frecuentes</summary><p>¿Puedo cancelar? Sí, te puedes dar de baja en cualquier momento.</p></details>
<form><input type="email" placeholder="Tu email"><input type="text" placeholder="Nombre"><button>Quiero mi auditoría</button>
<small>Datos protegidos (GDPR). No hacemos spam. Solo toma 30 segundos.</small></form>
</body></html>`;

const EMPTY = `<!DOCTYPE html><html><head><title>x</title></head><body><div id="root"></div></body></html>`;

const DARK = `<!DOCTYPE html><html><head><title>Oferta</title><meta name="viewport" content="width=device-width"></head><body>
<h1>Compra ya</h1>
<div class="countdown">00:14:59</div><script>setInterval(tick, 1000)</script>
<p>¡Solo hoy! Más de 900.000 usuarios.</p>
<div class="testimonial"><blockquote>increíble, me cambió la vida!!!</blockquote></div>
<p>$99.000* *aplican condiciones</p>
<form><input type="email"><input type="checkbox" checked> Acepto recibir ofertas<button>Enviar</button></form>
<a href="#">No, prefiero seguir perdiendo dinero</a>
</body></html>`;

// --- Landing buena ---
const g = analyzeHtml(GOOD, { url: 'https://ejemplo.com', bytes: GOOD.length });
assert.ok(g.score >= 75, `Landing buena debería puntuar >=75, dio ${g.score}`);
assert.ok(g.principles_active >= 6, `Buena: esperaba >=6 principios activos, dio ${g.principles_active}`);
assert.strictEqual(g.ethics_alerts, 0, `Buena: no debería tener alertas éticas, dio ${g.ethics_alerts}`);
assert.ok(!g.fetch_meta.js_suspected, 'Buena: no debería sospechar render JS');

// --- Landing vacía (render JS) ---
const e = analyzeHtml(EMPTY, { url: 'https://spa.com', bytes: EMPTY.length });
assert.ok(e.fetch_meta.js_suspected, 'Vacía: debería detectar render JS');
assert.ok(e.score < g.score - 30, `Vacía debería puntuar muy por debajo de la buena (${e.score} vs ${g.score})`);

// --- Landing con dark patterns ---
const d = analyzeHtml(DARK, { url: 'https://dark.com', bytes: DARK.length });
assert.ok(d.ethics_alerts >= 3, `Dark: esperaba >=3 alertas éticas, dio ${d.ethics_alerts}`);
const ids = d.ethics.filter((x) => x.verdict !== 'ok').map((x) => x.id);
assert.ok(ids.includes('urgencia_falsa'), 'Dark: debe detectar urgencia falsa');
assert.ok(ids.includes('prechecked'), 'Dark: debe detectar checkbox premarcado');
assert.ok(ids.includes('confirmshaming'), 'Dark: debe detectar confirmshaming');

console.log('✓ Todos los tests del motor pasan.');
console.log(`  buena: ${g.score}/100 (${g.principles_active}/9 principios, ${g.ethics_alerts} alertas)`);
console.log(`  vacía: ${e.score}/100 (js_suspected=${e.fetch_meta.js_suspected})`);
console.log(`  dark:  ${d.score}/100 (${d.ethics_alerts} alertas, ${d.ethics_warnings} a revisar)`);

/**
 * VALIDACIÓN DECLARATIVA DE INPUTS — Bloque 1.5 (seguridad)
 * ------------------------------------------------------------
 * Sustituye los checks manuales dispersos (`if (!x) return 400`) por un
 * esquema declarativo por endpoint. Sin dependencias (se evaluó zod, pero
 * agregar paquetes implica re-sincronizar el lock para el `npm ci` de
 * Railway — trampa #2 de CLAUDE.md — y esto cubre lo necesario).
 *
 * Uso:  router.post('/', validateBody({ name: { type: 'string', required: true, max: 200 } }), handler)
 * Reglas por campo: type ('string'|'number'|'integer'|'boolean'|'object'),
 * required, max/min (longitud en strings, valor en números), enum, pattern.
 * Los campos NO declarados en el esquema se ignoran (no strict).
 */

function checkField(value, rules, name) {
  if (value === undefined || value === null || value === '') {
    return rules.required ? `El campo "${name}" es obligatorio.` : null;
  }

  if (rules.type === 'string') {
    if (typeof value !== 'string') return `"${name}" debe ser texto.`;
    if (rules.max && value.length > rules.max) return `"${name}" supera el máximo de ${rules.max} caracteres.`;
    if (rules.pattern && !rules.pattern.test(value)) return `"${name}" no tiene el formato esperado.`;
  } else if (rules.type === 'number' || rules.type === 'integer') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!isFinite(n)) return `"${name}" debe ser un número.`;
    if (rules.type === 'integer' && !Number.isInteger(n)) return `"${name}" debe ser un entero.`;
    if (rules.min !== undefined && n < rules.min) return `"${name}" debe ser ≥ ${rules.min}.`;
    if (rules.max !== undefined && n > rules.max) return `"${name}" debe ser ≤ ${rules.max}.`;
  } else if (rules.type === 'boolean') {
    if (typeof value !== 'boolean') return `"${name}" debe ser verdadero/falso.`;
  } else if (rules.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return `"${name}" debe ser un objeto.`;
  }

  if (rules.enum && !rules.enum.includes(value)) {
    return `"${name}" debe ser uno de: ${rules.enum.join(', ')}.`;
  }
  return null;
}

/** Middleware Express: responde 400 con el primer error encontrado. */
function validateBody(schema) {
  return (req, res, next) => {
    const body = req.body || {};
    for (const [name, rules] of Object.entries(schema)) {
      const err = checkField(body[name], rules, name);
      if (err) return res.status(400).json({ error: err });
    }
    next();
  };
}

module.exports = { validateBody, checkField };

/**
 * RATE-LIMIT EN MEMORIA — Bloque 1.2 (seguridad)
 * ------------------------------------------------------------
 * Limita intentos en rutas de autenticación (fuerza bruta). Mismo patrón
 * en memoria que el rate-limit del copiloto: sin dependencias ni Redis
 * (suficiente para una instancia única en Railway).
 *
 * OJO: el navegador llega vía el proxy server-side de Next (Vercel), así
 * que la IP que ve Express es la del servidor de Vercel, compartida por
 * todos los usuarios. Por eso la clave combina IP + email del body:
 * limita por cuenta atacada sin castigar al resto de usuarios.
 */

const WINDOW_MS = 60 * 1000;

/**
 * Crea un middleware de rate-limit.
 * @param {number} max       intentos permitidos por ventana de 1 minuto
 * @param {string} name      etiqueta para logs
 */
function rateLimit(max, name) {
  const hits = new Map(); // clave -> timestamps[]

  // Poda periódica para que el Map no crezca sin límite.
  setInterval(() => {
    const now = Date.now();
    for (const [key, arr] of hits) {
      const alive = arr.filter((t) => now - t < WINDOW_MS);
      if (alive.length === 0) hits.delete(key);
      else hits.set(key, alive);
    }
  }, 5 * WINDOW_MS).unref();

  return (req, res, next) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ip = req.ip || req.socket?.remoteAddress || 'ip-desconocida';
    const key = `${ip}|${email}`;

    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
    arr.push(now);
    hits.set(key, arr);

    if (arr.length > max) {
      console.warn(`[rate-limit:${name}] bloqueado ${key} (${arr.length} intentos/min)`);
      return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto e intenta de nuevo.' });
    }
    next();
  };
}

module.exports = { rateLimit };

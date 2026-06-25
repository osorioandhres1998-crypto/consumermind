/** @type {import('next').NextConfig} */
// Las llamadas a /api/* las gestionan route handlers (app/api/...), que
// proxyan al backend Express adjuntando el JWT de sesión. Por eso ya no
// usamos rewrites: el navegador nunca habla con api.anthropic.com (CLAUDE.md).
const nextConfig = {};

module.exports = nextConfig;

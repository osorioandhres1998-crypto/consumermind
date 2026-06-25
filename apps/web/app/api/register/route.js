// Proxy PÚBLICO de registro (pre-auth) → backend Express /api/auth/register.
// Es una ruta estática, así que tiene prioridad sobre el catch-all autenticado.
const API_URL = process.env.API_URL || 'http://localhost:3001';

export async function POST(req) {
  const body = await req.text();
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

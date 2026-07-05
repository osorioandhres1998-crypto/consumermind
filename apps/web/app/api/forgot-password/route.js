// Proxy PÚBLICO (pre-auth) → backend Express /api/auth/forgot-password.
const API_URL = process.env.API_URL || 'http://localhost:3001';

export async function POST(req) {
  const body = await req.text();
  const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
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

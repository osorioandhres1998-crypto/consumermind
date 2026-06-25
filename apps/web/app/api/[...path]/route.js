/**
 * PROXY AUTENTICADO → backend Express.
 * ------------------------------------------------------------
 * Todas las llamadas del navegador a /api/* (salvo /api/auth y /api/register,
 * que son rutas estáticas con prioridad) pasan por aquí. Se ejecuta en el
 * servidor de Next: lee la sesión de NextAuth y adjunta el JWT del backend
 * como Authorization: Bearer. Así el token nunca queda expuesto al navegador
 * y el backend deriva el tenant de forma verificada.
 */

import { auth } from '../../../auth';

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function proxy(req, { params }) {
  const session = await auth();
  if (!session?.backendToken) {
    return Response.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const path = (params.path || []).join('/');
  const search = new URL(req.url).search;
  const method = req.method;
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await req.text();

  const res = await fetch(`${API_URL}/api/${path}${search}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.backendToken}`,
    },
    body,
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};

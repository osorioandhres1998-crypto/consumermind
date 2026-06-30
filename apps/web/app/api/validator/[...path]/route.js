/**
 * PROXY AUTENTICADO → microservicio Validator (FastAPI/Python).
 * ------------------------------------------------------------
 * Igual que el proxy del backend Express, pero apunta al servicio Validator
 * (VALIDATOR_URL). Adjunta el MISMO JWT del backend: el Validator lo verifica
 * con BACKEND_JWT_SECRET para derivar el tenant. El token nunca llega al navegador.
 *
 * El navegador llama a /api/validator/<ruta> → aquí se reenvía a
 * VALIDATOR_URL/<ruta>. Esta ruta es más específica que /api/[...path], así que
 * Next.js le da prioridad.
 */

import { auth } from '../../../../auth';

const VALIDATOR_URL = process.env.VALIDATOR_URL || 'http://localhost:8000';

async function proxy(req, { params }) {
  const session = await auth();
  if (!session?.backendToken) {
    return Response.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const path = (params.path || []).join('/');
  const search = new URL(req.url).search;
  const method = req.method;
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await req.text();

  const res = await fetch(`${VALIDATOR_URL}/${path}${search}`, {
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

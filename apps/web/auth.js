/**
 * CONFIGURACIÓN DE NEXTAUTH (Auth.js v5) — ConsumerMind
 * ------------------------------------------------------------
 * Sesión por JWT. El provider de credenciales delega la validación
 * en el backend Express (/api/auth/login), que devuelve un token
 * firmado. Ese token (backendToken) viaja en la sesión y luego lo
 * adjunta el proxy de /api a cada llamada al backend.
 *
 * La API key de Claude NUNCA pasa por aquí: vive solo en el backend.
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

const API_URL = process.env.API_URL || 'http://localhost:3001';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds) => {
        const res = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: creds?.email, password: creds?.password }),
        });
        if (!res.ok) return null;
        const data = await res.json(); // { token, user }
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          workspaceId: data.user.workspaceId,
          role: data.user.role,
          backendToken: data.token,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.backendToken = user.backendToken;
        token.workspaceId = user.workspaceId;
        token.role = user.role;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.backendToken = token.backendToken;
      if (session.user) {
        session.user.workspaceId = token.workspaceId;
        session.user.role = token.role;
      }
      return session;
    },
    // Protege las rutas de la app (dashboard, proyectos y módulos) vía middleware.
    authorized: ({ auth, request }) => {
      const p = request.nextUrl.pathname;
      const isProtected =
        p.startsWith('/dashboard') ||
        p.startsWith('/projects') ||
        p.startsWith('/strategy') ||
        p.startsWith('/copy-studio') ||
        p.startsWith('/validator') ||
        p.startsWith('/landing') ||
        p.startsWith('/profitability') ||
        p.startsWith('/team');
      if (isProtected) return !!auth;
      return true;
    },
  },
});

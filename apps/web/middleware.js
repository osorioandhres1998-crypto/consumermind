// Protege las rutas de la app usando el callback `authorized` de auth.js.
export { auth as middleware } from './auth';

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/projects/:path*',
    '/strategy/:path*',
    '/copy-studio/:path*',
    '/validator/:path*',
    '/landing/:path*',
    '/profitability/:path*',
    '/team/:path*',
  ],
};

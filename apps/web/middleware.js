// Protege las rutas de la app usando el callback `authorized` de auth.js.
export { auth as middleware } from './auth';

export const config = {
  matcher: ['/strategy/:path*', '/copy-studio/:path*'],
};

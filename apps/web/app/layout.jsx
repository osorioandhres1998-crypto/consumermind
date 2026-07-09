import './styles.css';
import Nav from '../components/Nav';
import Copilot from '../components/Copilot';
import AnalyticsProvider from '../components/AnalyticsProvider';
import { auth } from '../auth';

export const metadata = {
  title: 'Master Tool — Inteligencia de marketing',
  description: 'Valida, entiende y lanza tu producto: Validator, Strategy, Copy Studio, Landing Analyzer y Rentabilidad.',
};

export default async function RootLayout({ children }) {
  const session = await auth();
  return (
    <html lang="es">
      <body>
        <AnalyticsProvider userId={session?.user?.id || null} role={session?.user?.role || null} />
        <Nav />
        <div className="container">{children}</div>
        {/* Copiloto global: solo para usuarios logueados (en páginas públicas
            no debe montarse — sus llamadas a /api requieren sesión). */}
        {session?.user && <Copilot />}
      </body>
    </html>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '../auth';

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  return (
    <div>
      <div className="page-head">
        <h1>Master Tool</h1>
        <p>Plataforma de validación y estrategia de producto para equipos de marketing B2B.
           Valida tu MVP, descubre los sesgos que mueven a tu cliente y genera el copy que convierte.</p>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <span className="tag">Paso 1</span>
          <h3 style={{ margin: '10px 0 4px' }}>🧪 MVP Validator</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Simula audiencias y predice la aceptación de tu producto con un motor Monte Carlo
            antes de invertir.
          </p>
        </div>
        <div className="card">
          <span className="tag">Paso 2</span>
          <h3 style={{ margin: '10px 0 4px' }}>🎯 Strategy</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Detecta y rankea los sesgos cognitivos que más activarán a tu cliente frente a tu producto.
          </p>
        </div>
        <div className="card">
          <span className="tag">Paso 3</span>
          <h3 style={{ margin: '10px 0 4px' }}>✍️ Copy Studio</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Genera copy y ángulos creativos que explotan exactamente esos sesgos.
          </p>
        </div>
        <div className="card">
          <span className="tag">Paso 4</span>
          <h3 style={{ margin: '10px 0 4px' }}>💰 Calculadora de Rentabilidad</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Diagnostica si tu pauta gana o pierde dinero (ROAS, CAC, CPA) y simula cuánto puedes escalar.
          </p>
        </div>
        <div className="card">
          <span className="tag">Paso 5</span>
          <h3 style={{ margin: '10px 0 4px' }}>📊 Landing Analyzer</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Audita tu landing contra los estándares que convierten, con semáforo ético de dark patterns.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Link href="/register" className="btn">Crear cuenta</Link>
        <span style={{ margin: '0 10px', color: 'var(--muted)' }}>o</span>
        <Link href="/login" className="btn ghost">Entrar</Link>
      </div>
    </div>
  );
}

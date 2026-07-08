'use client';

/**
 * HUB DE HERRAMIENTAS — primera pantalla al entrar (rediseño solicitado).
 * Todas las herramientas se pueden usar al instante con valores manuales;
 * los proyectos (pestaña aparte) precargan los datos automáticamente.
 */

import Link from 'next/link';

const TOOLS = [
  { href: '/validator',     icon: '🧪', name: 'MVP Validator',                desc: 'Predice la aceptación del mercado con simulación Monte Carlo.', tag: 'Simulación' },
  { href: '/strategy',      icon: '🎯', name: 'Strategy',                     desc: 'Detecta los sesgos cognitivos que activarán a tu cliente.',     tag: 'IA' },
  { href: '/copy-studio',   icon: '✍️', name: 'Copy Studio',                  desc: 'Genera copy y ángulos que explotan esos sesgos.',               tag: 'IA' },
  { href: '/landing',       icon: '📊', name: 'Landing Analyzer',             desc: 'Audita cualquier landing: 41 checks + velocidad real de Google + semáforo ético.', tag: 'Auditoría' },
  { href: '/profitability', icon: '💰', name: 'Calculadora de Rentabilidad',  desc: 'ROAS, CAC, LTV, MER y simulador de escalado — con importador CSV de Meta/Google.', tag: 'Al instante' },
];

export default function ToolsHubPage() {
  return (
    <div>
      <div className="page-head">
        <h1>Herramientas</h1>
        <p>Úsalas al instante con tus propios valores — o abre un <Link href="/projects" style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>proyecto</Link> para que los datos se precarguen en todas.</p>
      </div>

      <div className="grid cols-2">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="card" style={{ display: 'block' }}>
            <div className="row">
              <h3 style={{ margin: 0 }}>{t.icon} {t.name}</h3>
              <span className="tag">{t.tag}</span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0 0', lineHeight: 1.6 }}>{t.desc}</p>
          </Link>
        ))}

        {/* Acceso directo a proyectos: el flujo completo con datos compartidos */}
        <Link href="/projects" className="card" style={{ display: 'block', background: 'var(--indigo-50)', border: '1px solid #c7d2fe' }}>
          <div className="row">
            <h3 style={{ margin: 0 }}>📁 Mis proyectos</h3>
            <span className="tag">Flujo completo</span>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0 0', lineHeight: 1.6 }}>
            Describe tu producto una vez y pruébalo en todas las herramientas con los datos precargados,
            historial, tendencias, experimentos A/B y copiloto IA.
          </p>
        </Link>
      </div>

      <div className="banner" style={{ marginTop: 22 }}>
        💡 <b>Tip:</b> las simulaciones y análisis hechos aquí (sin proyecto) no se asocian a ningún historial.
        Para comparar meses, correr experimentos y preguntar al copiloto, crea un proyecto.
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProject } from '../../../lib/api';

// Definición de los módulos del master-tool. `status` se calcula del historial.
const MODULES = [
  { key: 'validator',     icon: '🧪', name: 'MVP Validator', desc: 'Predice la aceptación del mercado con simulación Monte Carlo.', kind: 'simulation' },
  { key: 'strategy',      icon: '🎯', name: 'Strategy',      desc: 'Detecta los sesgos cognitivos que activarán a tu cliente.',   kind: 'analysis', module: 'strategy' },
  { key: 'copy-studio',   icon: '✍️', name: 'Copy Studio',   desc: 'Genera copy y ángulos que explotan esos sesgos.',            kind: 'analysis', module: 'copy_studio' },
  { key: 'landing',       icon: '📊', name: 'Landing Analyzer', desc: 'Evalúa tu landing contra estándares que convierten.',       soon: true },
  { key: 'profitability', icon: '💰', name: 'Calculadora de Rentabilidad', desc: 'Métricas de rentabilidad de campañas pagadas.',  soon: true },
];

export default function ProjectPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setProject(await getProject(id));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="empty"><div className="big">⏳</div>Cargando proyecto…</div>;
  if (error) return <div className="banner err">⚠️ {error}</div>;
  if (!project) return null;

  const analyses = project.analyses || [];
  const simulations = project.simulations || [];

  const statusFor = (m) => {
    if (m.soon) return null;
    if (m.kind === 'simulation') return simulations.length > 0;
    return analyses.some((a) => a.module === m.module);
  };

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href="/dashboard" style={{ color: 'var(--muted)', fontSize: 13 }}>← Mis proyectos</Link>
      </div>

      <div className="row" style={{ marginBottom: 18 }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>{project.name}</h1>
          <p>{project.product || 'Sin descripción del producto'}</p>
        </div>
        <Link href={`/projects/${id}/report`} className="btn ghost sm">📄 Informe</Link>
      </div>

      {/* Datos del proyecto reutilizados por los módulos */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="grid cols-2">
          <div><span className="stat l">Público objetivo</span><div>{project.customer || '—'}</div></div>
          <div style={{ display: 'flex', gap: 18 }}>
            <div><span className="stat l">Precio</span><div>{project.price || '—'}</div></div>
            <div><span className="stat l">Canal</span><div>{project.channel || '—'}</div></div>
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        {MODULES.map((m) => {
          const done = statusFor(m);
          const card = (
            <div className={`card${m.soon ? '' : ''}`} style={m.soon ? { opacity: 0.7 } : {}}>
              <div className="row">
                <h3 style={{ margin: 0 }}>{m.icon} {m.name}</h3>
                {m.soon
                  ? <span className="tag amber">🚧 En desarrollo</span>
                  : done
                    ? <span className="tag green">✓ Ejecutado</span>
                    : <span className="tag gray">Sin ejecutar</span>}
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0 0' }}>{m.desc}</p>
            </div>
          );
          if (m.soon) {
            return <Link key={m.key} href="/coming-soon">{card}</Link>;
          }
          return <Link key={m.key} href={`/projects/${id}/${m.key}`}>{card}</Link>;
        })}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProject, getProjectTimeline, updateProject } from '../../../lib/api';
import TrendChart from '../../../components/TrendChart';
import Copilot from '../../../components/Copilot';

// Definición de los módulos del master-tool. `status` se calcula del historial.
const MODULES = [
  { key: 'validator',     icon: '🧪', name: 'MVP Validator', desc: 'Predice la aceptación del mercado con simulación Monte Carlo.', kind: 'simulation' },
  { key: 'strategy',      icon: '🎯', name: 'Strategy',      desc: 'Detecta los sesgos cognitivos que activarán a tu cliente.',   kind: 'analysis', module: 'strategy' },
  { key: 'copy-studio',   icon: '✍️', name: 'Copy Studio',   desc: 'Genera copy y ángulos que explotan esos sesgos.',            kind: 'analysis', module: 'copy_studio' },
  { key: 'landing',       icon: '📊', name: 'Landing Analyzer', desc: 'Audita tu landing contra estándares que convierten + semáforo ético.', kind: 'analysis', module: 'landing' },
  { key: 'profitability', icon: '💰', name: 'Calculadora de Rentabilidad', desc: 'Diagnóstico de rentabilidad de tu pauta: ROAS, CAC y simulador de escalado.', kind: 'local' },
];

export default function ProjectPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setProject(await getProject(id));
        setTimeline(await getProjectTimeline(id).catch(() => []));
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
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/projects/${id}/experiments`} className="btn ghost sm">🧬 Experimentos</Link>
          <Link href={`/projects/${id}/report`} className="btn ghost sm">📄 Informe</Link>
        </div>
      </div>

      {/* Datos del proyecto reutilizados por los módulos */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="grid cols-2">
          <div><span className="stat l">Público objetivo</span><div>{project.customer || '—'}</div></div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div><span className="stat l">Precio</span><div>{project.price || '—'}</div></div>
            <div><span className="stat l">Canal</span><div>{project.channel || '—'}</div></div>
            <div>
              <span className="stat l">Vertical</span>
              <select
                value={project.vertical || ''}
                onChange={async (e) => {
                  const vertical = e.target.value || null;
                  setProject({ ...project, vertical });
                  try { await updateProject(id, { vertical }); } catch (_) { /* ya actualizado en UI */ }
                }}
                style={{ padding: '3px 6px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}
              >
                <option value="">Sin especificar</option>
                <option value="ecommerce">E-commerce</option>
                <option value="saas">SaaS</option>
                <option value="servicios">Servicios / Agencia</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Tendencias (N1-B): MER, ROAS y score de landing por mes */}
      {timeline && timeline.length > 0 && (() => {
        const merPoints = timeline.map((t) => {
          const m = t.metrics;
          const total = m ? (m.adsPeriodo || 0) + (m.fijosMarketing || 0) : 0;
          return { period: t.period, value: m && total > 0 ? (m.ingresosPeriodo || 0) / total : null };
        });
        const roasPoints = timeline.map((t) => {
          const m = t.metrics;
          return { period: t.period, value: m && m.adsPeriodo > 0 ? (m.ingresosPeriodo || 0) / m.adsPeriodo : null };
        });
        const landingPoints = timeline.map((t) => ({ period: t.period, value: t.landing_score }));

        const lastTwo = (pts) => pts.filter((p) => p.value != null).slice(-2);
        const delta = (pts) => {
          const [a, b] = lastTwo(pts);
          if (!a || !b) return null;
          return ((b.value - a.value) / a.value) * 100;
        };
        const DeltaTag = ({ pts }) => {
          const d = delta(pts);
          if (d == null) return null;
          const up = d >= 0;
          return <span className="tag" style={{ background: up ? '#f1faf4' : '#fdecea', color: up ? '#1f9d6b' : '#ef5350' }}>{up ? '↑' : '↓'} {Math.abs(d).toFixed(0)}% vs mes anterior</span>;
        };

        return (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>📈 Tendencias</h2>
            <div className="grid cols-2" style={{ gap: 14 }}>
              <div className="card">
                <div className="row" style={{ marginBottom: 4 }}><b style={{ fontSize: 13 }}>MER (ingresos / gasto total)</b><DeltaTag pts={merPoints} /></div>
                <TrendChart points={merPoints} label="" color="#0f9b8e" format={(v) => `${v.toFixed(1)}×`}
                  bands={[{ upTo: 3, color: '#f08b88' }, { upTo: 5, color: '#f7ca73' }, { upTo: 999, color: '#6fcaa6' }]} />
              </div>
              <div className="card">
                <div className="row" style={{ marginBottom: 4 }}><b style={{ fontSize: 13 }}>ROAS (ingresos / ads)</b><DeltaTag pts={roasPoints} /></div>
                <TrendChart points={roasPoints} label="" color="#e0941f" format={(v) => `${v.toFixed(1)}×`} />
              </div>
              {landingPoints.some((p) => p.value != null) && (
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <div className="row" style={{ marginBottom: 4 }}><b style={{ fontSize: 13 }}>Score de Landing Analyzer</b><DeltaTag pts={landingPoints} /></div>
                  <TrendChart points={landingPoints} label="" color="#4f46e5" format={(v) => `${Math.round(v)}/100`} yMax={100}
                    bands={[{ upTo: 50, color: '#f08b88' }, { upTo: 75, color: '#f7ca73' }, { upTo: 100, color: '#6fcaa6' }]} />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="grid cols-2">
        {MODULES.map((m) => {
          const done = statusFor(m);
          const card = (
            <div className={`card${m.soon ? '' : ''}`} style={m.soon ? { opacity: 0.7 } : {}}>
              <div className="row">
                <h3 style={{ margin: 0 }}>{m.icon} {m.name}</h3>
                {m.soon
                  ? <span className="tag amber">🚧 En desarrollo</span>
                  : m.kind === 'local'
                    ? <span className="tag">⚡ Al instante</span>
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

      <Copilot projectId={id} />
    </div>
  );
}

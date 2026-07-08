'use client';

/**
 * Componente reutilizable del Landing Analyzer.
 * - projectId presente → prefill de URL/vertical desde el proyecto, guarda ligado a él.
 * - projectId ausente (hub/standalone) → URL manual, análisis sin proyecto.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProject, apiFetch } from '../../lib/api';
import { getVerticalBenchmarks } from '../../lib/benchmarks-verticales';

const VERDICT = {
  ok:      { color: '#1f9d6b', bg: '#f1faf4', border: '#cfe9d9', label: 'OK' },
  revisar: { color: '#d98c1a', bg: '#fff8ea', border: '#f1e0ad', label: 'Revisar' },
  alerta:  { color: '#ef5350', bg: '#fdecea', border: '#f3c7c2', label: 'Alerta' },
};
const BAND = {
  green: { color: '#1f9d6b', label: 'Alta conversión' },
  amber: { color: '#d98c1a', label: 'Base sólida con brechas' },
  red:   { color: '#ef5350', label: 'Necesita rediseño' },
};

function ScoreCard({ title, value, sub, color, highlight }) {
  return (
    <div className="card" style={highlight ? { background: '#fdecea', border: '1px solid #f3c7c2' } : {}}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: highlight ? '#b23a36' : 'var(--muted)' }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: color || 'var(--text)', margin: '4px 0 2px' }}>{value}</div>
      <div style={{ fontSize: 12, color: highlight ? '#b23a36' : 'var(--muted)' }}>{sub}</div>
    </div>
  );
}

function DimensionBlock({ d }) {
  const [open, setOpen] = useState(false);
  const color = d.score >= 75 ? '#1f9d6b' : d.score >= 50 ? '#d98c1a' : '#ef5350';
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="row" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <b style={{ fontSize: 14 }}>{d.label}</b>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{d.passed}/{d.total} · <b style={{ color }}>{d.score}</b>/100 · peso {d.weight}%</span>
          </div>
          <div style={{ height: 8, background: '#eceef4', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${d.score}%`, height: '100%', background: color }} />
          </div>
        </div>
        <span style={{ marginLeft: 14, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {d.checks.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
              <span style={{ color: c.pass ? '#1f9d6b' : '#ef5350', fontWeight: 700, flex: 'none' }}>{c.pass ? '✓' : '✗'}</span>
              <div>
                <b>{c.label}</b>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{c.evidence}</div>
                {!c.pass && c.impact && <div style={{ color: 'var(--indigo-600)', fontSize: 12 }}>💡 {c.impact}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LandingTool({ projectId = null }) {
  const [url, setUrl] = useState('');
  const [pastedHtml, setPastedHtml] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [ready, setReady] = useState(!projectId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [vertical, setVertical] = useState('');

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const p = await getProject(projectId);
        if (p.landing_url) setUrl(p.landing_url);
        if (p.vertical) setVertical(p.vertical);
        const prev = (p.analyses || []).find((a) => a.module === 'landing');
        if (prev?.result) { setResult(prev.result); if (prev.input?.url && !p.landing_url) setUrl(prev.input.url); }
      } catch (e) {
        setError(e.message);
      } finally {
        setReady(true);
      }
    })();
  }, [projectId]);

  const vb = getVerticalBenchmarks(vertical);

  const run = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/landing/analyze', {
        method: 'POST',
        body: JSON.stringify({ url, projectId: projectId || undefined, html: showPaste && pastedHtml.trim() ? pastedHtml : undefined }),
      });
      setResult(data.result);
      if (!showPaste && data.result?.fetch_meta?.js_suspected) setShowPaste(true);
    } catch (err) {
      setError(err.message);
      setShowPaste(true);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return <div className="empty"><div className="big">⏳</div>Cargando…</div>;

  const r = result;
  const band = r ? BAND[r.band] || BAND.amber : null;

  return (
    <div>
      {projectId && (
        <div style={{ marginBottom: 8 }}>
          <Link href={`/projects/${projectId}`} style={{ color: 'var(--muted)', fontSize: 13 }}>← Volver al proyecto</Link>
        </div>
      )}
      <div className="page-head">
        <h1>📊 Landing Analyzer</h1>
        <p>Auditoría contra los estándares de landings que convierten: estructura, persuasión, carga cognitiva, copy, técnica y <b>semáforo ético</b> (dark patterns con riesgo regulatorio).</p>
      </div>

      <form className="card" onSubmit={run} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={{ flex: 1, minWidth: 260, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 14, fontFamily: 'ui-monospace, monospace' }}
            value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tu-landing.com" inputMode="url"
          />
          <button className="btn" type="submit" disabled={loading || !url.trim()}>
            {loading ? <><span className="spinner" /> Escaneando…</> : r ? '↻ Re-escanear' : '⚡ Escanear'}
          </button>
        </div>
        {showPaste && (
          <div style={{ marginTop: 12 }}>
            <div className="banner" style={{ marginBottom: 8 }}>
              ℹ️ Si la página se renderiza con JavaScript o bloquea bots, pega aquí el HTML completo
              (clic derecho → "Ver código fuente" → copiar todo) y vuelve a escanear.
            </div>
            <textarea
              style={{ width: '100%', minHeight: 120, padding: 10, border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              value={pastedHtml} onChange={(e) => setPastedHtml(e.target.value)} placeholder="<!DOCTYPE html>…"
            />
          </div>
        )}
      </form>

      {error && <div className="banner err" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

      {r && !loading && (
        <div>
          {r.fetch_meta?.js_suspected && (
            <div className="banner" style={{ marginBottom: 14 }}>
              ⚠️ El HTML recibido tiene muy poco contenido: la página parece renderizarse con JavaScript.
              El score puede ser injusto — usa el fallback de pegar el HTML para un análisis fiel.
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
            <ScoreCard title="Conversión" value={<span>{r.score}<span style={{ fontSize: 16, color: 'var(--muted)' }}>/100</span></span>} sub={band.label} color={band.color} />
            <ScoreCard title="Principios activos" value={<span>{r.principles_active}<span style={{ fontSize: 16, color: 'var(--muted)' }}>/9</span></span>} sub={`${9 - r.principles_active} sin explotar`} />
            <ScoreCard title="Alertas éticas" value={r.ethics_alerts} sub={r.ethics_alerts > 0 ? 'requieren revisión legal' : 'sin riesgos detectados'} color={r.ethics_alerts > 0 ? '#ef5350' : '#1f9d6b'} highlight={r.ethics_alerts > 0} />
          </div>

          {vb && (
            <div className="banner" style={{ marginBottom: 20, background: r.score >= vb.landingScoreTarget ? '#f1faf4' : '#fff8ea', borderColor: r.score >= vb.landingScoreTarget ? '#cfe9d9' : '#f1e0ad', color: 'var(--text)' }}>
              {r.score >= vb.landingScoreTarget ? '✅' : 'ℹ️'} Tu score ({r.score}) {r.score >= vb.landingScoreTarget ? 'supera' : 'está por debajo de'} el objetivo de referencia para <b>{vb.label}</b> ({vb.landingScoreTarget}/100).
            </div>
          )}

          {r.fetch_meta?.vitals ? (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="row" style={{ marginBottom: 10 }}>
                <b style={{ fontSize: 14 }}>⚡ Velocidad real (Google PageSpeed)</b>
                <span className="tag gray">móvil</span>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                {r.fetch_meta.vitals.lcpSeconds != null && (
                  <div><div style={{ fontSize: 22, fontWeight: 800, color: r.fetch_meta.vitals.lcpSeconds < 2.5 ? '#1f9d6b' : '#ef5350' }}>{r.fetch_meta.vitals.lcpSeconds}s</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>LCP (objetivo &lt;2.5s)</div></div>
                )}
                {r.fetch_meta.vitals.cls != null && (
                  <div><div style={{ fontSize: 22, fontWeight: 800, color: r.fetch_meta.vitals.cls < 0.1 ? '#1f9d6b' : '#ef5350' }}>{r.fetch_meta.vitals.cls}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>CLS (objetivo &lt;0.1)</div></div>
                )}
                {r.fetch_meta.vitals.performanceScore != null && (
                  <div><div style={{ fontSize: 22, fontWeight: 800, color: r.fetch_meta.vitals.performanceScore >= 50 ? '#1f9d6b' : '#ef5350' }}>{r.fetch_meta.vitals.performanceScore}/100</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Score de rendimiento</div></div>
                )}
              </div>
            </div>
          ) : !r.fetch_meta?.pasted && (
            <div className="banner" style={{ marginBottom: 20, fontSize: 12.5 }}>
              ℹ️ No se pudieron obtener datos reales de velocidad de Google (API no disponible en este momento) — la dimensión Técnica usó el proxy de peso del HTML.
            </div>
          )}

          <div className="row" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Semáforo ético</h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>dark patterns · riesgo GDPR / DMA</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {r.ethics.map((e) => {
              const v = VERDICT[e.verdict] || VERDICT.ok;
              return (
                <div key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: v.bg, border: `1px solid ${v.border}`, borderRadius: 10, padding: '11px 14px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: v.color, marginTop: 5, flex: 'none' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <b style={{ fontSize: 13.5 }}>{e.label}</b>
                      <span className="tag" style={{ background: v.bg, color: v.color, border: `1px solid ${v.border}` }}>{v.label}</span>
                      {e.risk && <span className="tag gray">{e.risk}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>{e.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <h2 style={{ margin: '0 0 10px', fontSize: 18 }}>Desglose por dimensión</h2>
          {Object.values(r.dimensions).map((d) => <DimensionBlock key={d.label} d={d} />)}

          {r.recommendations.length > 0 && (
            <>
              <h2 style={{ margin: '20px 0 10px', fontSize: 18 }}>Recomendaciones priorizadas</h2>
              <div className="card">
                {r.recommendations.map((rec, idx) => (
                  <div key={idx} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 13.5 }}><b>{idx + 1}. {rec.missing}</b> <span className="tag gray">{rec.dimension}</span></div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{rec.found}</div>
                    {rec.impact && <div style={{ fontSize: 12.5, color: 'var(--indigo-600)', marginTop: 2 }}>💡 {rec.impact}</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '18px 2px 0', lineHeight: 1.5 }}>
            Motor determinista: cada check muestra la evidencia encontrada. Los veredictos éticos señalan
            patrones observables que conviene revisar — no constituyen asesoría legal.
            Analizado: {r.fetch_meta?.analyzed_at ? new Date(r.fetch_meta.analyzed_at).toLocaleString('es') : '—'}
          </p>
        </div>
      )}
    </div>
  );
}

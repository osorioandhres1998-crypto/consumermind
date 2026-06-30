'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProject, apiFetch } from '../../../../lib/api';

const OBJECTION_LABELS = {
  precio_alto: 'Precio alto',
  valor_percibido_bajo: 'Valor percibido bajo',
  no_lo_necesita: 'No lo necesita',
};

const pct = (v) => `${(v * 100).toFixed(1)}%`;

// Medidor circular simple (SVG) para una probabilidad 0..1.
function Gauge({ value, label }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, value)) * c;
  const color = value >= 0.5 ? '#16a34a' : value >= 0.3 ? '#d97706' : '#dc2626';
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#eceef4" strokeWidth="12" />
        <circle
          cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={`${filled} ${c}`} strokeLinecap="round"
          transform="rotate(-90 65 65)"
        />
        <text x="65" y="60" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1e2230">{pct(value)}</text>
        <text x="65" y="80" textAnchor="middle" fontSize="11" fill="#6b7180">media</text>
      </svg>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Bar({ label, value, max = 1, color = 'var(--indigo)' }) {
  const w = max ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="row" style={{ marginBottom: 3 }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{pct(value)}</span>
      </div>
      <div style={{ height: 8, background: '#eceef4', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

export default function ProjectValidatorPage() {
  const { id } = useParams();
  const [form, setForm] = useState({ idea: '', target_audience: '' });
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const p = await getProject(id);
        setForm({
          idea: p.product || '',
          target_audience: p.customer || '',
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setReady(true);
      }
    })();
  }, [id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const run = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/validator/projects/${id}/validate`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return <div className="empty"><div className="big">⏳</div>Cargando…</div>;

  const maxObj = result ? Math.max(...(result.top_objections || []).map((o) => o.frequency), 0.001) : 1;
  const maxFeat = result ? Math.max(...(result.feature_importance || []).map((f) => f.importance), 0.001) : 1;

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/projects/${id}`} style={{ color: 'var(--muted)', fontSize: 13 }}>← Volver al proyecto</Link>
      </div>
      <div className="page-head">
        <h1>🧪 MVP Validator</h1>
        <p>Simula audiencias y predice la aceptación del mercado con un motor Monte Carlo (miles de iteraciones).</p>
      </div>

      <form className="card" onSubmit={run} style={{ marginBottom: 22 }}>
        <div className="field">
          <label>Idea / producto *</label>
          <textarea value={form.idea} onChange={set('idea')} placeholder="Describe la idea de producto (mín. 10 caracteres)" />
        </div>
        <div className="field">
          <label>Público objetivo *</label>
          <input value={form.target_audience} onChange={set('target_audience')} placeholder="A quién va dirigido" />
        </div>
        <button className="btn" type="submit" disabled={loading || form.idea.length < 10 || form.target_audience.length < 3}>
          {loading ? <><span className="spinner" /> Simulando…</> : '🧪 Validar MVP'}
        </button>
      </form>

      {error && <div className="banner err">⚠️ {error}</div>}
      {loading && <div className="banner">⏳ Generando audiencias y corriendo la simulación Monte Carlo…</div>}

      {result && !loading && (
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Resultado de la simulación</h2>
            <span className="tag gray">{result.audience_source === 'claude' ? 'IA (Claude)' : 'Heurístico'}</span>
          </div>

          {/* Métricas principales */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 30, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Gauge value={result.acceptance_rate?.mean ?? 0} label="Aceptación de mercado" />
              <Gauge value={result.purchase_intent_probability?.mean ?? 0} label="Intención de compra" />
            </div>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, margin: '8px 0 0' }}>
              IC 95%: aceptación [{pct(result.acceptance_rate?.ci_95_lower ?? 0)} – {pct(result.acceptance_rate?.ci_95_upper ?? 0)}]
            </p>
          </div>

          <div className="grid cols-2">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Principales objeciones</h3>
              {(result.top_objections || []).map((o) => (
                <Bar key={o.objection} label={OBJECTION_LABELS[o.objection] || o.objection} value={o.frequency} max={maxObj} color="#dc2626" />
              ))}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Importancia de características</h3>
              {(result.feature_importance || []).map((f) => (
                <Bar key={f.feature} label={f.feature} value={f.importance} max={maxFeat} color="var(--indigo)" />
              ))}
            </div>
          </div>

          {/* Arquetipos de audiencia */}
          {(result.archetypes || []).length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>Arquetipos de audiencia</h3>
              <div className="grid cols-2">
                {result.archetypes.map((a, i) => (
                  <div key={i} className="card" style={{ boxShadow: 'none' }}>
                    <b>{a.name || a.segment || `Arquetipo ${i + 1}`}</b>
                    {a.description && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>{a.description}</p>}
                    {typeof a.segment_share === 'number' && (
                      <span className="tag gray" style={{ marginTop: 6 }}>{pct(a.segment_share)} del mercado</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insights accionables */}
          {result.insights && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>Insights accionables</h3>
              {result.insights.summary && <p>{result.insights.summary}</p>}
              {Array.isArray(result.insights.recommendations) && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {result.insights.recommendations.map((r, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{typeof r === 'string' ? r : JSON.stringify(r)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="banner" style={{ marginTop: 16 }}>
            ✅ Simulación guardada en el proyecto. Si el resultado es bueno, continúa con <Link href={`/projects/${id}/strategy`}><b>Strategy</b></Link>.
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * Componente reutilizable del MVP Validator.
 * - projectId presente → prefill desde el proyecto, guarda ligado a él.
 * - projectId ausente (hub/standalone) → inputs manuales, simulación rápida
 *   contra POST /api/validator/validate (sin proyecto).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProject, apiFetch } from '../../lib/api';
import { track } from '../../lib/analytics';

const OBJECTION_LABELS = {
  precio_alto: 'Precio alto',
  valor_percibido_bajo: 'Valor percibido bajo',
  no_lo_necesita: 'No lo necesita',
};
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const pct0 = (v) => `${Math.round(v * 100)}%`;
const EMPTY_FORM = { idea: '', target_audience: '', price: '', alternatives: '', channel: '', insights_raw: '' };
const CONFIDENCE_TAG = { baja: 'red', media: 'amber', alta: 'green' };

function Gauge({ value, label }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, value)) * c;
  const color = value >= 0.5 ? '#16a34a' : value >= 0.3 ? '#d97706' : '#dc2626';
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#eceef4" strokeWidth="12" />
        <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="12" strokeDasharray={`${filled} ${c}`} strokeLinecap="round" transform="rotate(-90 65 65)" />
        <text x="65" y="60" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1e2230">{pct(value)}</text>
        <text x="65" y="80" textAnchor="middle" fontSize="11" fill="#6b7180">media</text>
      </svg>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/* Fase 1.1 — rúbrica con incertidumbre explícita: cada dimensión muestra su
   puntuación central y el rango [low, high] que el evaluador declara no saber. */
function RangeBar({ label, score, low, high, hypothesis }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row" style={{ marginBottom: 3 }}>
        <span style={{ fontSize: 13 }}>
          {label} {hypothesis && <span className="tag gray" style={{ marginLeft: 4 }}>hipótesis</span>}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{pct0(score)} <span style={{ opacity: .7 }}>({pct0(low)}–{pct0(high)})</span></span>
      </div>
      <div style={{ position: 'relative', height: 8, background: '#eceef4', borderRadius: 99 }}>
        <div style={{ position: 'absolute', left: `${low * 100}%`, width: `${Math.max(0, (high - low) * 100)}%`, height: '100%', background: 'var(--indigo-50)', border: '1px solid #c7d2fe', borderRadius: 99 }} />
        <div style={{ position: 'absolute', left: `calc(${score * 100}% - 5px)`, top: -2, width: 12, height: 12, borderRadius: '50%', background: 'var(--indigo)', boxShadow: '0 0 0 2px #fff' }} />
      </div>
    </div>
  );
}

function RubricCard({ rubric }) {
  if (!rubric) return null;
  const o = rubric.overall || {};
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Evaluación de la idea</h3>
        <span className={`tag ${CONFIDENCE_TAG[rubric.confidence] || 'gray'}`}>confianza {rubric.confidence}</span>
      </div>
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
        Puntuación global <b style={{ color: 'var(--text)' }}>{pct0(o.score ?? 0)}</b> · rango plausible {pct0(o.low ?? 0)}–{pct0(o.high ?? 0)}.
        El rango es lo que el modelo declara <b>no saber</b>: cuanto más ancho, más hipótesis y menos evidencia.
      </p>
      <div className="grid cols-2">
        <div>
          {(rubric.dimensions || []).map((d) => (
            <RangeBar key={d.key} label={d.label} score={d.score} low={d.low} high={d.high} hypothesis={d.is_hypothesis} />
          ))}
        </div>
        <div>
          {(rubric.dimensions || []).filter((d) => d.rationale).length > 0 && (
            <details open>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Justificación por dimensión</summary>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
                {rubric.dimensions.filter((d) => d.rationale).map((d) => (
                  <li key={d.key} style={{ marginBottom: 4 }}><b style={{ color: 'var(--text)' }}>{d.label}:</b> {d.rationale}</li>
                ))}
              </ul>
            </details>
          )}
          {(rubric.key_assumptions || []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Debe ser cierto para que funcione</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {rubric.key_assumptions.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
              </ul>
            </div>
          )}
          {(rubric.missing_info || []).length > 0 && (
            <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>
              <b>Para estrechar el rango:</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {rubric.missing_info.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Fase 1.2 — Monte Carlo v2: la banda p5–p95 es la incertidumbre declarada en
   la rúbrica propagada al resultado (no ruido de muestreo). */
function Band({ label, s, color = 'var(--indigo)' }) {
  if (!s) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13 }}><b>{pct0(s.p50)}</b> <span style={{ color: 'var(--muted)' }}>· plausible {pct0(s.p5)}–{pct0(s.p95)}</span></span>
      </div>
      <div style={{ position: 'relative', height: 10, background: '#eceef4', borderRadius: 99 }}>
        <div style={{ position: 'absolute', left: `${s.p5 * 100}%`, width: `${Math.max(0, (s.p95 - s.p5) * 100)}%`, height: '100%', background: color, opacity: .25, borderRadius: 99 }} />
        <div style={{ position: 'absolute', left: `${s.p25 * 100}%`, width: `${Math.max(0, (s.p75 - s.p25) * 100)}%`, height: '100%', background: color, opacity: .55, borderRadius: 99 }} />
        <div style={{ position: 'absolute', left: `calc(${s.p50 * 100}% - 1.5px)`, width: 3, height: '100%', background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function SimulationV2Card({ v2 }) {
  if (!v2) return null;
  const maxImp = Math.max(...(v2.sensitivity || []).map((x) => x.importance), 0.001);
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Adopción estimada</h3>
        <span className="tag">Monte Carlo v2 · {v2.execution_metrics?.n_iterations?.toLocaleString?.() || ''} escenarios</span>
      </div>
      <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>
        Cada escenario muestrea las dimensiones de la rúbrica dentro de su rango y simula la reacción de cada segmento con el precio propuesto.
        La banda es lo que no sabes todavía; la mediana, la estimación central.
      </p>
      <div className="grid cols-2">
        <div>
          <Band label="Adopción de la audiencia" s={v2.adoption} />
          <Band label="Intención de compra" s={v2.purchase_intent} color="#16a34a" />
          {(v2.by_segment || []).length > 1 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Por segmento</div>
              {v2.by_segment.map((sg) => (
                <div key={sg.name} style={{ marginBottom: 8 }}>
                  <div className="row" style={{ marginBottom: 3 }}>
                    <span style={{ fontSize: 13 }}>{sg.name} <span className="tag gray" style={{ marginLeft: 4 }}>{pct0(sg.share)} del mercado</span></span>
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{pct0(sg.adoption.p50)} <span style={{ opacity: .7 }}>({pct0(sg.adoption.p5)}–{pct0(sg.adoption.p95)})</span></span>
                  </div>
                  <div style={{ height: 6, background: '#eceef4', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${sg.adoption.p50 * 100}%`, height: '100%', background: 'var(--indigo)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Qué duda pesa más en el resultado</div>
          <p style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: 12.5 }}>Cuanto más alta, más conviene validar esa dimensión primero: es la que más mueve la adopción.</p>
          {(v2.sensitivity || []).map((x) => (
            <Bar key={x.key} label={x.label} value={x.importance} max={maxImp} />
          ))}
          {(v2.price_curve || []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Curva precio → adopción</div>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <tbody>
                  {v2.price_curve.map((p) => (
                    <tr key={p.multiplier} style={{ background: p.multiplier === 1 ? 'var(--indigo-50)' : 'transparent' }}>
                      <td style={{ padding: '4px 6px', fontWeight: p.multiplier === 1 ? 700 : 400 }}>{p.multiplier === 1 ? 'Precio propuesto' : `×${p.multiplier}`}</td>
                      <td style={{ padding: '4px 6px', color: 'var(--muted)' }}>{p.price}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}><b>{pct0(p.adoption_mean)}</b> <span style={{ color: 'var(--muted)' }}>({pct0(p.adoption_p5)}–{pct0(p.adoption_p95)})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
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

export default function ValidatorTool({ projectId = null }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [ready, setReady] = useState(!projectId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const p = await getProject(projectId);
        setForm({ ...EMPTY_FORM, idea: p.product || '', target_audience: p.customer || '', price: p.price || '', channel: p.channel || '' });
      } catch (e) {
        setError(e.message);
      } finally {
        setReady(true);
      }
    })();
  }, [projectId]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const run = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const path = projectId ? `/api/validator/projects/${projectId}/validate` : '/api/validator/validate';
      setResult(await apiFetch(path, { method: 'POST', body: JSON.stringify(form) }));
      track('tool_run', { tool: 'validator', mode: projectId ? 'project' : 'standalone' });
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
      {projectId && (
        <div style={{ marginBottom: 8 }}>
          <Link href={`/projects/${projectId}`} style={{ color: 'var(--muted)', fontSize: 13 }}>← Volver al proyecto</Link>
        </div>
      )}
      <div className="page-head">
        <h1>🧪 MVP Validator</h1>
        <p>Evalúa tu idea con una rúbrica que declara su incertidumbre, y simula la reacción de la audiencia. Cuanto más contexto real aportes, más estrecho el rango.</p>
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
        <details style={{ marginBottom: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--indigo-600)' }}>
            Contexto opcional — reduce la incertidumbre de la evaluación
          </summary>
          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Precio propuesto</label>
              <input value={form.price} onChange={set('price')} placeholder="$29/mes, $297 único…" />
            </div>
            <div className="field">
              <label>Canal principal</label>
              <input value={form.channel} onChange={set('channel')} placeholder="Instagram Ads, SEO, ventas directas…" />
            </div>
          </div>
          <div className="field">
            <label>¿Cómo resuelve hoy el problema tu audiencia?</label>
            <textarea value={form.alternatives} onChange={set('alternatives')} placeholder="Competidores, Excel, un freelancer, o simplemente no hacer nada…" />
          </div>
          <div className="field">
            <label>Evidencia real (entrevistas, ventas, soporte, redes)</label>
            <textarea value={form.insights_raw} onChange={set('insights_raw')} placeholder="Pega frases textuales de clientes potenciales. Sin evidencia, todo queda marcado como hipótesis." />
          </div>
        </details>
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

          <RubricCard rubric={result.rubric} />
          <SimulationV2Card v2={result.v2} />

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
            {!result.v2 && <div className="card">
              <h3 style={{ marginTop: 0 }}>Importancia de características</h3>
              {(result.feature_importance || []).map((f) => (
                <Bar key={f.feature} label={f.feature} value={f.importance} max={maxFeat} color="var(--indigo)" />
              ))}
            </div>}
          </div>

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

          {projectId && (
            <div className="banner" style={{ marginTop: 16 }}>
              ✅ Simulación guardada en el proyecto. Si el resultado es bueno, continúa con <Link href={`/projects/${projectId}/strategy`}><b>Strategy</b></Link>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

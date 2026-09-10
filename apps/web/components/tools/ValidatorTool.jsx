'use client';

/**
 * Componente reutilizable del MVP Validator.
 * - projectId presente → prefill desde el proyecto, guarda ligado a él.
 * - projectId ausente (hub/standalone) → inputs manuales, simulación rápida
 *   contra POST /api/validator/validate (sin proyecto).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProject, apiFetch, createExperiment } from '../../lib/api';
import { track } from '../../lib/analytics';

const OBJECTION_LABELS = {
  precio_alto: 'Precio alto',
  valor_percibido_bajo: 'Valor percibido bajo',
  no_lo_necesita: 'No lo necesita',
};
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const pct0 = (v) => `${Math.round(v * 100)}%`;
const EMPTY_FORM = { idea: '', target_audience: '', price: '', alternatives: '', channel: '', insights_raw: '', vertical: '' };
const VERTICAL_LABELS = { ecommerce: 'E-commerce', saas: 'SaaS', servicios: 'Servicios / Agencia' };
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
        <span style={{ display: 'flex', gap: 6 }}>
          {(rubric.evidence_sources || []).map((s) => <span key={s} className="tag green">evidencia: {s}</span>)}
          <span className={`tag ${CONFIDENCE_TAG[rubric.confidence] || 'gray'}`}>confianza {rubric.confidence}</span>
        </span>
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
      <p style={{ margin: '0 0 6px', color: 'var(--muted)', fontSize: 13 }}>
        Cada escenario muestrea las dimensiones de la rúbrica dentro de su rango y simula la reacción de cada segmento con el precio propuesto.
        La banda es lo que no sabes todavía; la mediana, la estimación central.
      </p>
      {v2.assumptions && (
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--muted)' }}>
          <span className="tag gray" style={{ marginRight: 6 }}>prior {pct0(v2.assumptions.prior_adoption_p0 ?? 0)} · {v2.assumptions.vertical_label || 'genérico'}</span>
          {v2.assumptions.vertical_note}
        </p>
      )}
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

/* Fase 1.3 — panel de personas sintéticas: señal RELATIVA (qué segmento
   responde mejor, qué objeción domina), nunca un % real de compra. */
const INTENT_COLOR = (i) => (i >= 4 ? '#16a34a' : i === 3 ? '#d97706' : '#dc2626');

function PanelCard({ panel }) {
  if (!panel || !(panel.responses || []).length) return null;
  const maxObj = Math.max(...(panel.objections || []).map((o) => o.share), 0.001);
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Panel de clientes simulados</h3>
        <span className="tag gray">{panel.source === 'claude' ? 'IA (Claude)' : 'Plantilla sin IA'}</span>
      </div>
      <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>
        Cada arquetipo leyó tu propuesta y respondió como en una entrevista corta. Úsalo para ver <b>qué segmento responde mejor</b> y <b>qué objeción domina</b>; no es un porcentaje real de compra.
      </p>
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="stat card" style={{ boxShadow: 'none' }}>
          <div className="n" style={{ color: INTENT_COLOR(Math.round(panel.intent_mean || 0)) }}>{panel.intent_mean ?? '–'}<span style={{ fontSize: 14, color: 'var(--muted)' }}> / 5</span></div>
          <div className="l">Intención media ponderada · {panel.intent_label}</div>
        </div>
        <div className="stat card" style={{ boxShadow: 'none' }}>
          <div className="n">{pct0(panel.top2box || 0)}</div>
          <div className="l">del mercado simulado con intención 4-5</div>
        </div>
      </div>
      {(panel.objections || []).length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Objeciones dominantes (entre quienes no comprarían)</div>
          {panel.objections.map((o) => (
            <div key={o.category} style={{ marginBottom: 10 }}>
              <Bar label={o.label} value={o.share} max={maxObj} color="#dc2626" />
              {o.quotes?.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -2, paddingLeft: 2 }}>
                  {o.quotes.map((q, i) => <div key={i}>“{q}”</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="grid cols-2">
        {panel.responses.map((r) => (
          <div key={r.persona} className="card" style={{ boxShadow: 'none', padding: 14 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <b style={{ fontSize: 14 }}>{r.persona}</b>
              <span className="tag" style={{ background: INTENT_COLOR(r.intent) + '1a', color: INTENT_COLOR(r.intent) }}>{'●'.repeat(r.intent)}{'○'.repeat(5 - r.intent)} {r.intent}/5</span>
            </div>
            {r.first_reaction && <p style={{ margin: '0 0 8px', fontSize: 13.5, fontStyle: 'italic' }}>“{r.first_reaction}”</p>}
            {r.main_objection && <p style={{ margin: '0 0 6px', fontSize: 13 }}><b style={{ color: '#dc2626' }}>Objeción:</b> {r.main_objection}</p>}
            {r.what_would_convince && <p style={{ margin: '0 0 6px', fontSize: 13 }}><b style={{ color: '#16a34a' }}>Lo convencería:</b> {r.what_would_convince}</p>}
            {r.question && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}><b>Preguntaría:</b> {r.question}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Fase 2.2 — señales de demanda externas (búsqueda web real). */
function SignalsCard({ signals }) {
  if (!signals) return null;
  if (signals.source === 'none' || !(signals.results || []).length) {
    return (
      <div className="banner" style={{ marginBottom: 14 }}>
        🔎 <b>Sin evidencia externa.</b> {signals.note || 'No se pudieron buscar señales de demanda.'} Sin ella, la rúbrica se apoya solo en tu descripción.
      </div>
    );
  }
  const sg = signals.signals;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Evidencia externa (búsqueda web)</h3>
        <span className="tag green">{signals.results.length} resultados · {signals.queries?.length || 0} búsquedas</span>
      </div>
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
        Lo que ya existe en el mercado sobre esta idea. Ancla la rúbrica: las dimensiones respaldadas por esto dejan de ser hipótesis puras. No sustituye hablar con clientes.
      </p>
      {sg ? (
        <div className="grid cols-2">
          <div>
            {sg.evidence_summary && <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 500 }}>{sg.evidence_summary}</p>}
            {sg.demand_indicators && <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}><b style={{ color: 'var(--text)' }}>Señal de demanda:</b> {sg.demand_indicators}</p>}
            {(sg.competitors || []).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Competidores y alternativas</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {sg.competitors.map((c, i) => (
                    <li key={i} style={{ marginBottom: 3 }}>
                      {c.url ? <a href={c.url} target="_blank" rel="noreferrer" style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>{c.name}</a> : <b>{c.name}</b>}
                      {c.note && <span style={{ color: 'var(--muted)' }}> — {c.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(sg.price_points || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sg.price_points.map((p, i) => <span key={i} className="tag amber">{p}</span>)}
              </div>
            )}
          </div>
          <div>
            {(sg.problem_language || []).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Cómo habla la gente del problema</div>
                {sg.problem_language.map((q, i) => <div key={i} style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--muted)', marginBottom: 3 }}>“{q}”</div>)}
              </div>
            )}
            {(sg.gaps || []).length > 0 && (
              <div className="banner" style={{ marginBottom: 0 }}>
                <b>No se pudo confirmar:</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{sg.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {signals.results.slice(0, 8).map((r, i) => (
            <li key={i} style={{ marginBottom: 4 }}><a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>{r.title || r.url}</a><span style={{ color: 'var(--muted)' }}> — {r.snippet}</span></li>
          ))}
        </ul>
      )}
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--muted)' }}>Ver las {signals.results.length} fuentes</summary>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
          {signals.results.map((r, i) => <li key={i}><a href={r.url} target="_blank" rel="noreferrer" style={{ color: 'var(--indigo-600)' }}>{r.title || r.url}</a></li>)}
        </ul>
      </details>
    </div>
  );
}

/* Fase 2.3 — Audience Research (JTBD): los segmentos de demanda que generan
   los arquetipos. Tabla comparativa: una columna por segmento. */
const JTBD_ROWS = [
  ['trigger_situation', 'Situación gatillo'],
  ['trigger_event', 'Evento detonante'],
  ['best_timing', 'Mejor momento'],
  ['job_functional', 'Job funcional'],
  ['job_emotional', 'Job emocional'],
  ['job_social', 'Job social'],
  ['main_pain', 'Dolor principal'],
  ['main_desire', 'Deseo principal'],
  ['sales_questions', 'Preguntas de venta'],
  ['evidence', 'Evidencia'],
];

function JtbdCard({ research }) {
  if (!research || !(research.segments || []).length) return null;
  const segs = research.segments;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Segmentos de demanda (Jobs-to-be-Done)</h3>
        <span className="tag gray">{research.source === 'claude' ? 'IA (Claude)' : 'Plantilla sin IA'}</span>
      </div>
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
        {research.summary} Cada segmento genera un arquetipo del panel: la simulación y las personas responden desde estas situaciones.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontWeight: 600 }}></th>
              {segs.map((s, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)', verticalAlign: 'top' }}>
                  {s.segment}
                  {s.is_hypothesis && <div><span className="tag gray" style={{ marginTop: 4 }}>hipótesis</span></div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {JTBD_ROWS.map(([key, label]) => (
              <tr key={key}>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{label}</td>
                {segs.map((s, i) => (
                  <td key={i} style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)', verticalAlign: 'top', fontStyle: key === 'evidence' ? 'italic' : 'normal' }}>{s[key] || '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Fase 3.1 — cómo validar de verdad: experimentos con métrica y umbral. */
function ExperimentsCard({ plan, projectId }) {
  const [saved, setSaved] = useState({});
  if (!plan || !(plan.experiments || []).length) return null;
  const register = async (e) => {
    setSaved((s) => ({ ...s, [e.key]: 'saving' }));
    try {
      await createExperiment(projectId, {
        hypothesis: `${e.name} — éxito si ${e.threshold}`,
        metricName: e.metric.slice(0, 80),
        variantALabel: 'Control (A)',
        variantBLabel: 'Variante (B)',
      });
      setSaved((s) => ({ ...s, [e.key]: 'ok' }));
    } catch (err) {
      setSaved((s) => ({ ...s, [e.key]: 'error' }));
    }
  };
  return (
    <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid var(--indigo)' }}>
      <h3 style={{ margin: '0 0 4px' }}>Cómo validarlo de verdad</h3>
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>{plan.sequence_note}</p>
      {plan.experiments.map((e) => (
        <div key={e.key} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--indigo)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{e.priority}</div>
          <div style={{ fontSize: 13 }}>
            <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}><b style={{ fontSize: 14 }}>{e.name}</b><span className="tag gray">{e.effort}</span></div>
            <p style={{ margin: '4px 0', color: 'var(--muted)' }}>{e.reason}</p>
            <p style={{ margin: '4px 0' }}><b>Cómo:</b> {e.how}</p>
            <p style={{ margin: '4px 0' }}><b>Métrica:</b> {e.metric}</p>
            <p style={{ margin: '4px 0' }}><b>Éxito si:</b> <span className="tag green">{e.threshold}</span></p>
            {projectId && (
              <button type="button" className="btn ghost sm" style={{ marginTop: 6 }} disabled={saved[e.key] === 'saving' || saved[e.key] === 'ok'} onClick={() => register(e)}>
                {saved[e.key] === 'ok' ? '✓ Registrado en Experimentos' : saved[e.key] === 'saving' ? 'Registrando…' : saved[e.key] === 'error' ? 'Error — reintentar' : '+ Registrar como experimento'}
              </button>
            )}
          </div>
        </div>
      ))}
      {projectId && (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
          Registra cada resultado en <Link href={`/projects/${projectId}/experiments`} style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>Experimentos</Link> del proyecto y audita la landing con <Link href={`/projects/${projectId}/landing`} style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>Landing Analyzer</Link>.
        </p>
      )}
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
        setForm({ ...EMPTY_FORM, idea: p.product || '', target_audience: p.customer || '', price: p.price || '', channel: p.channel || '', vertical: p.vertical || '' });
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
        <h1>🧪 MVP Validator <span className="tag" style={{ verticalAlign: 'middle' }}>pre-validación</span></h1>
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
            <label>Tipo de negocio (ajusta el prior de adopción)</label>
            <select value={form.vertical} onChange={set('vertical')}>
              <option value="">Genérico — sin vertical</option>
              {Object.entries(VERTICAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
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
          {/* Fase 1.4 — transparencia: confianza siempre visible y aviso claro
              cuando alguna pieza corrió sin IA (plantillas, no evaluación). */}
          {(() => {
            const heur = [
              result.audience_source !== 'claude' && 'arquetipos',
              result.rubric?.source === 'heuristic' && 'rúbrica',
              result.panel?.source === 'heuristic' && 'panel de clientes',
            ].filter(Boolean);
            return heur.length > 0 && (
              <div className="banner err" style={{ marginBottom: 12 }}>
                ⚠️ <b>Motor de IA no disponible</b> para: {heur.join(', ')}. Esas partes son plantillas genéricas y <b>no evalúan tu idea</b>. Revisa la clave de API del validator antes de tomar decisiones con este resultado.
              </div>
            );
          })()}
          <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Resultado de la pre-validación</h2>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {result.rubric && <span className={`tag ${CONFIDENCE_TAG[result.rubric.confidence] || 'gray'}`}>confianza {result.rubric.confidence}</span>}
              {result.rubric?.ensemble_runs > 1 && <span className="tag gray">mediana de {result.rubric.ensemble_runs} evaluaciones</span>}
              <span className="tag gray">{result.audience_source === 'claude' ? 'IA (Claude)' : 'Heurístico'}</span>
            </span>
          </div>
          {result.rubric && result.v2 && (
            <p style={{ margin: '0 0 14px', fontSize: 14.5, lineHeight: 1.6 }}>
              Puntuación de la idea <b>{pct0(result.rubric.overall?.score ?? 0)}</b> con confianza <b>{result.rubric.confidence}</b>; adopción estimada <b>{pct0(result.v2.adoption?.p50 ?? 0)}</b> (plausible {pct0(result.v2.adoption?.p5 ?? 0)}–{pct0(result.v2.adoption?.p95 ?? 0)}).
              {result.rubric.confidence === 'baja' && ' Con confianza baja, trata estas cifras como hipótesis a validar, no como predicción.'}
            </p>
          )}

          <SignalsCard signals={result.signals} />
          <RubricCard rubric={result.rubric} />
          <JtbdCard research={result.audience_research} />
          <SimulationV2Card v2={result.v2} />
          <PanelCard panel={result.panel} />
          <ExperimentsCard plan={result.experiments} projectId={projectId} />

          {/* Gauges v1 con "IC 95%": solo si no hay v2 (el IC medía ruido de muestreo, no incertidumbre real). */}
          {!result.v2 && <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 30, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Gauge value={result.acceptance_rate?.mean ?? 0} label="Aceptación de mercado" />
              <Gauge value={result.purchase_intent_probability?.mean ?? 0} label="Intención de compra" />
            </div>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, margin: '8px 0 0' }}>
              IC 95%: aceptación [{pct(result.acceptance_rate?.ci_95_lower ?? 0)} – {pct(result.acceptance_rate?.ci_95_upper ?? 0)}]
            </p>
          </div>}

          <div className="grid cols-2">
            {!result.panel?.responses?.length && <div className="card">
              <h3 style={{ marginTop: 0 }}>Principales objeciones</h3>
              {(result.top_objections || []).map((o) => (
                <Bar key={o.objection} label={OBJECTION_LABELS[o.objection] || o.objection} value={o.frequency} max={maxObj} color="#dc2626" />
              ))}
            </div>}
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
                    {a.jtbd_segment && <span className="tag" style={{ marginLeft: 6 }}>JTBD</span>}
                    {a.description && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>{a.description}</p>}
                    {a.jtbd?.trigger_situation && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}><b>Cuando:</b> {a.jtbd.trigger_situation}</p>}
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

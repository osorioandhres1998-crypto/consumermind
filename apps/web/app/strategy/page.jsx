'use client';

import { useState } from 'react';
import { useBiasAnalysis } from '../../hooks/useBiasAnalysis';
import { exportAnalysisPDF } from '../../lib/pdf';

function intensityColor(v) {
  if (v >= 75) return '#dc2626';
  if (v >= 55) return '#ea580c';
  if (v >= 40) return '#d97706';
  return '#ca8a04';
}

function BiasCard({ b }) {
  return (
    <div className="card bias">
      <div className="top">
        <h3 style={{ margin: 0 }}>{b.rank}. {b.name}</h3>
        <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {b.intensity}/100
          <span className="biasbar"><span style={{ width: `${b.intensity}%`, background: intensityColor(b.intensity) }} /></span>
        </span>
      </div>
      <div className="why">{b.why}</div>
      <div className="action">→ {b.action}</div>
    </div>
  );
}

export default function StrategyPage() {
  const { analyze, loading, result, error } = useBiasAnalysis();
  const [form, setForm] = useState({ product: '', customer: '', price: '', channel: '' });
  const [lastInput, setLastInput] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      setLastInput(form);
      await analyze(form);
    } catch (_) { /* el hook ya expone error */ }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Strategy</h1>
        <p>Describe el caso. El motor psicológico detecta los sesgos que más se activarán en este cliente frente a este producto.</p>
      </div>

      <form className="card" onSubmit={submit} style={{ marginBottom: 22 }}>
        <div className="grid cols-2">
          <div className="field">
            <label>Producto *</label>
            <input value={form.product} onChange={set('product')} placeholder="Ej. App de productividad por suscripción" />
          </div>
          <div className="field">
            <label>Perfil del cliente *</label>
            <input value={form.customer} onChange={set('customer')} placeholder="Ej. Profesional 30-45, ocupado, busca foco" />
          </div>
          <div className="field">
            <label>Precio</label>
            <input value={form.price} onChange={set('price')} placeholder="Ej. 12 €/mes (opcional)" />
          </div>
          <div className="field">
            <label>Canal</label>
            <input value={form.channel} onChange={set('channel')} placeholder="Ej. email, landing, ad (opcional)" />
          </div>
        </div>
        <button className="btn" type="submit" disabled={loading || !form.product || !form.customer}>
          {loading ? <><span className="spinner" /> Analizando…</> : '⚡ Analizar sesgos'}
        </button>
      </form>

      {error && <div className="banner err">⚠️ {error}</div>}
      {loading && <div className="banner">⏳ El motor está construyendo el prompt y consultando a Claude…</div>}

      {result && !loading && (
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Resultado</h2>
            <button className="btn ghost" onClick={() => exportAnalysisPDF({ result }, lastInput)}>⬇ Exportar PDF</button>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}>
              <span className="tag green">Conversión: {result.conversion_probability}</span>
              <span className="tag gray">Decisión: {result.decision_system}</span>
            </div>
            {result.summary && <p style={{ margin: '10px 0 0', fontSize: 15 }}>{result.summary}</p>}
          </div>

          <div className="grid">
            {(result.biases || []).map((b) => <BiasCard key={b.rank} b={b} />)}
          </div>

          <div className="grid cols-2" style={{ marginTop: 14 }}>
            {result.main_friction && (
              <div className="card"><b>Fricción principal</b><p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>{result.main_friction}</p></div>
            )}
            {result.recommended_trigger && (
              <div className="card"><b>Disparador recomendado</b><p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>{result.recommended_trigger}</p></div>
            )}
          </div>

          <div className="banner" style={{ marginTop: 16 }}>
            ✅ Este análisis quedó guardado en el workspace. Ya está disponible en <b>Copy Studio</b> para generar copy a partir de estos sesgos.
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProject, apiFetch } from '../../../../lib/api';
import { exportAnalysisPDF } from '../../../../lib/pdf';

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

export default function ProjectStrategyPage() {
  const { id } = useParams();
  const [form, setForm] = useState({ product: '', customer: '', price: '', channel: '' });
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Autocompleta el formulario con los datos del proyecto.
  useEffect(() => {
    (async () => {
      try {
        const p = await getProject(id);
        setForm({
          product: p.product || '',
          customer: p.customer || '',
          price: p.price || '',
          channel: p.channel || '',
        });
        // Si ya hay un análisis de Strategy en el proyecto, muéstralo.
        const prev = (p.analyses || []).find((a) => a.module === 'strategy');
        if (prev) setResult(prev.result);
      } catch (e) {
        setError(e.message);
      } finally {
        setReady(true);
      }
    })();
  }, [id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/strategy/analyze', {
        method: 'POST',
        body: JSON.stringify({ ...form, projectId: id }),
      });
      setResult(data.result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return <div className="empty"><div className="big">⏳</div>Cargando…</div>;

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/projects/${id}`} style={{ color: 'var(--muted)', fontSize: 13 }}>← Volver al proyecto</Link>
      </div>
      <div className="page-head">
        <h1>🎯 Strategy</h1>
        <p>El motor detecta los sesgos que más se activarán en este cliente frente a este producto. Datos tomados del proyecto (editables).</p>
      </div>

      <form className="card" onSubmit={submit} style={{ marginBottom: 22 }}>
        <div className="grid cols-2">
          <div className="field">
            <label>Producto *</label>
            <input value={form.product} onChange={set('product')} />
          </div>
          <div className="field">
            <label>Perfil del cliente *</label>
            <input value={form.customer} onChange={set('customer')} />
          </div>
          <div className="field">
            <label>Precio</label>
            <input value={form.price} onChange={set('price')} />
          </div>
          <div className="field">
            <label>Canal</label>
            <input value={form.channel} onChange={set('channel')} />
          </div>
        </div>
        <button className="btn" type="submit" disabled={loading || !form.product || !form.customer}>
          {loading ? <><span className="spinner" /> Analizando…</> : '⚡ Analizar sesgos'}
        </button>
      </form>

      {error && <div className="banner err">⚠️ {error}</div>}
      {loading && <div className="banner">⏳ El motor está construyendo el prompt y consultando al modelo…</div>}

      {result && !loading && (
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Resultado</h2>
            <button className="btn ghost" onClick={() => exportAnalysisPDF({ result }, form)}>⬇ Exportar PDF</button>
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
            ✅ Análisis guardado en el proyecto. Ya puedes ir a <Link href={`/projects/${id}/copy-studio`}><b>Copy Studio</b></Link> para generar copy con estos sesgos.
          </div>
        </div>
      )}
    </div>
  );
}

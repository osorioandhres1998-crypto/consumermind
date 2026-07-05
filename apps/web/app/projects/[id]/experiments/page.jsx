'use client';

/**
 * REGISTRO DE EXPERIMENTOS A/B — N2-B del plan enterprise.
 * Hipótesis → variante A/B → resultados → significancia estadística
 * (test z de dos proporciones, calculado en el backend, determinista).
 * Cierra el ciclo decidir (Copy Studio) → probar → medir.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { listExperiments, createExperiment, updateExperiment, deleteExperiment } from '../../../../lib/api';

function pct(v) { return v == null ? '—' : `${(v * 100).toFixed(2)}%`; }

function ExperimentCard({ exp, onUpdate, onDelete }) {
  const [form, setForm] = useState({
    visitorsA: exp.visitors_a, conversionsA: exp.conversions_a,
    visitorsB: exp.visitors_b, conversionsB: exp.conversions_b,
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      await onUpdate(exp.id, {
        visitorsA: +form.visitorsA || 0, conversionsA: +form.conversionsA || 0,
        visitorsB: +form.visitorsB || 0, conversionsB: +form.conversionsB || 0,
      });
    } finally {
      setSaving(false);
    }
  };

  const s = exp.stats;
  const verdictColor = s.significant ? '#1f9d6b' : '#d98c1a';
  const verdictText = s.z == null ? 'Faltan datos'
    : s.significant ? `✓ Significativo (p=${s.pValue})`
    : `Aún no significativo (p=${s.pValue ?? '—'})`;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <b style={{ fontSize: 14 }}>{exp.hypothesis}</b>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Métrica: {exp.metric_name} · {exp.status === 'concluded' ? 'Concluido' : 'En curso'}</div>
        </div>
        <button className="btn ghost sm" onClick={() => onDelete(exp.id)}>🗑</button>
      </div>

      <div className="grid cols-2" style={{ marginTop: 12, gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{exp.variant_a_label}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...fldStyle }} value={form.visitorsA} onChange={set('visitorsA')} placeholder="Visitantes" inputMode="numeric" />
            <input style={{ ...fldStyle }} value={form.conversionsA} onChange={set('conversionsA')} placeholder="Conversiones" inputMode="numeric" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Tasa: {pct(s.rateA)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{exp.variant_b_label}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...fldStyle }} value={form.visitorsB} onChange={set('visitorsB')} placeholder="Visitantes" inputMode="numeric" />
            <input style={{ ...fldStyle }} value={form.conversionsB} onChange={set('conversionsB')} placeholder="Conversiones" inputMode="numeric" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Tasa: {pct(s.rateB)}</div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Actualizar resultados'}</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: verdictColor }}>{verdictText}</span>
      </div>

      {s.upliftPct != null && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>
          Uplift de B vs A: <b style={{ color: s.upliftPct >= 0 ? '#1f9d6b' : '#ef5350' }}>{s.upliftPct >= 0 ? '+' : ''}{s.upliftPct.toFixed(1)}%</b>
          {exp.samples_needed_10pct && <> · Muestras necesarias por variante para detectar +10%: <b>{exp.samples_needed_10pct}</b></>}
        </div>
      )}
    </div>
  );
}

const fldStyle = { flex: 1, padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 };

export default function ExperimentsPage() {
  const { id } = useParams();
  const [experiments, setExperiments] = useState(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ hypothesis: '', metricName: 'conversión', variantALabel: 'Control (A)', variantBLabel: 'Variante (B)' });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try { setExperiments(await listExperiments(id)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, [id]);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createExperiment(id, newForm);
      setNewForm({ hypothesis: '', metricName: 'conversión', variantALabel: 'Control (A)', variantBLabel: 'Variante (B)' });
      setShowNew(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const onUpdate = async (expId, body) => { await updateExperiment(id, expId, body); await load(); };
  const onDelete = async (expId) => { if (confirm('¿Eliminar este experimento?')) { await deleteExperiment(id, expId); await load(); } };

  if (experiments === null) return <div className="empty"><div className="big">⏳</div>Cargando…</div>;

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/projects/${id}`} style={{ color: 'var(--muted)', fontSize: 13 }}>← Volver al proyecto</Link>
      </div>
      <div className="row" style={{ marginBottom: 18 }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>🧬 Experimentos A/B</h1>
          <p>Hipótesis → variante A/B → resultado → significancia estadística (test z, 95% de confianza).</p>
        </div>
        <button className="btn" onClick={() => setShowNew(!showNew)}>+ Nuevo experimento</button>
      </div>

      {error && <div className="banner err" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

      {showNew && (
        <form className="card" onSubmit={create} style={{ marginBottom: 18 }}>
          <div className="field">
            <label>Hipótesis</label>
            <input value={newForm.hypothesis} onChange={(e) => setNewForm({ ...newForm, hypothesis: e.target.value })} placeholder="Cambiar el CTA a 'Obtén tu guía gratis' aumentará la conversión" autoFocus />
          </div>
          <div className="grid cols-2">
            <div className="field"><label>Métrica</label><input value={newForm.metricName} onChange={(e) => setNewForm({ ...newForm, metricName: e.target.value })} /></div>
            <div className="field"><label>Etiqueta variante A</label><input value={newForm.variantALabel} onChange={(e) => setNewForm({ ...newForm, variantALabel: e.target.value })} /></div>
          </div>
          <div className="field"><label>Etiqueta variante B</label><input value={newForm.variantBLabel} onChange={(e) => setNewForm({ ...newForm, variantBLabel: e.target.value })} /></div>
          <button className="btn" type="submit" disabled={creating || !newForm.hypothesis.trim()}>{creating ? 'Creando…' : 'Crear experimento'}</button>
        </form>
      )}

      {experiments.length === 0 ? (
        <div className="empty">
          <div className="big">🧬</div>
          Aún no tienes experimentos registrados en este proyecto.
        </div>
      ) : (
        experiments.map((exp) => <ExperimentCard key={exp.id} exp={exp} onUpdate={onUpdate} onDelete={onDelete} />)
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '../../../lib/api';

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', product: '', customer: '', price: '', channel: '', landing_url: '', vertical: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const proj = await createProject(form);
      router.push(`/projects/${proj.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="page-head">
        <h1>Nuevo proyecto</h1>
        <p>Describe el producto y el cliente una sola vez. Todas las herramientas reutilizarán estos datos.</p>
      </div>

      {error && <div className="banner err">⚠️ {error}</div>}

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>Nombre del proyecto *</label>
          <input value={form.name} onChange={set('name')} placeholder="Lanzamiento App Fitness 2026" autoFocus />
        </div>
        <div className="field">
          <label>Producto / servicio</label>
          <textarea value={form.product} onChange={set('product')} placeholder="Libro de recetas saludables para bebés" />
        </div>
        <div className="field">
          <label>Público objetivo</label>
          <textarea value={form.customer} onChange={set('customer')} placeholder="Padres primerizos preocupados por la alimentación de su bebé" />
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label>Precio</label>
            <input value={form.price} onChange={set('price')} placeholder="$20" />
          </div>
          <div className="field">
            <label>Canal</label>
            <input value={form.channel} onChange={set('channel')} placeholder="landing / app / redes" />
          </div>
        </div>
        <div className="field">
          <label>URL de landing (opcional)</label>
          <input value={form.landing_url} onChange={set('landing_url')} placeholder="https://miproducto.com" />
        </div>
        <div className="field">
          <label>Vertical <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(opcional — calibra los benchmarks de ProfitGuard y Landing Analyzer)</span></label>
          <select value={form.vertical} onChange={set('vertical')}>
            <option value="">Sin especificar (bandas genéricas)</option>
            <option value="ecommerce">E-commerce</option>
            <option value="saas">SaaS</option>
            <option value="servicios">Servicios / Agencia</option>
          </select>
        </div>
        <button className="btn" type="submit" disabled={loading || !form.name.trim()}>
          {loading ? <><span className="spinner" /> Creando…</> : 'Crear proyecto'}
        </button>
      </form>
    </div>
  );
}

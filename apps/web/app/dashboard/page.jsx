'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listProjects, deleteProject } from '../../lib/api';

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setProjects(await listProjects());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (id, name) => {
    if (!confirm(`¿Eliminar el proyecto "${name}" y todo su historial?`)) return;
    try {
      await deleteProject(id);
      setProjects((ps) => ps.filter((p) => p.id !== id));
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 22 }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>Mis proyectos</h1>
          <p>Cada proyecto describe un producto una vez y lo recorre por todas las herramientas.</p>
        </div>
        <Link href="/projects/new" className="btn">+ Nuevo proyecto</Link>
      </div>

      {error && <div className="banner err">⚠️ {error}</div>}

      {loading ? (
        <div className="empty"><div className="big">⏳</div>Cargando proyectos…</div>
      ) : projects.length === 0 ? (
        <div className="empty">
          <div className="big">📁</div>
          Aún no tienes proyectos.
          <div style={{ marginTop: 14 }}>
            <Link href="/projects/new" className="btn">Crear el primero</Link>
          </div>
        </div>
      ) : (
        <div className="grid cols-2">
          {projects.map((p) => (
            <div key={p.id} className="card">
              <div className="row">
                <Link href={`/projects/${p.id}`} style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 4px' }}>{p.name}</h3>
                </Link>
                <button
                  className="btn ghost sm"
                  onClick={() => remove(p.id, p.name)}
                  title="Eliminar"
                >🗑</button>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: '4px 0 10px' }}>
                {p.product || 'Sin descripción del producto'}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {p.price && <span className="tag gray">{p.price}</span>}
                {p.channel && <span className="tag gray">{p.channel}</span>}
                <span className="tag gray">
                  {new Date(p.created_at).toLocaleDateString('es')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

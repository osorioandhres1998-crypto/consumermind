'use client';

/**
 * MIS PROYECTOS — lista del workspace (rediseño: sección propia, separada
 * del hub de herramientas). Cada tarjeta tiene "▶ Probar en Master Tool":
 * abre el proyecto con sus datos precargados en todas las herramientas,
 * para analizar muchos proyectos uno a la vez.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listProjects, deleteProject } from '../../lib/api';

export default function ProjectsPage() {
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
          <p>Describe un producto una vez — "Probar en Master Tool" precarga sus datos en todas las herramientas.</p>
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
                <h3 style={{ margin: '0 0 4px', flex: 1 }}>{p.name}</h3>
                <button
                  className="btn ghost sm"
                  onClick={() => remove(p.id, p.name)}
                  title="Eliminar"
                >🗑</button>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: '4px 0 10px' }}>
                {p.product || 'Sin descripción del producto'}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {p.price && <span className="tag gray">{p.price}</span>}
                {p.channel && <span className="tag gray">{p.channel}</span>}
                {p.vertical && <span className="tag gray">{p.vertical}</span>}
                <span className="tag gray">{new Date(p.created_at).toLocaleDateString('es')}</span>
              </div>
              <Link href={`/projects/${p.id}`} className="btn sm" style={{ width: '100%', justifyContent: 'center' }}>
                ▶ Probar en Master Tool
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

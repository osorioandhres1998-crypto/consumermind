'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProject } from '../../../../lib/api';
import { exportProjectReportPDF } from '../../../../lib/pdf';

export default function ProjectReportPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setProject(await getProject(id));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="empty"><div className="big">⏳</div>Cargando proyecto…</div>;
  if (error) return <div className="banner err">⚠️ {error}</div>;
  if (!project) return null;

  const sim = (project.simulations || [])[0];
  const strat = (project.analyses || []).find((a) => a.module === 'strategy');
  const copies = (project.analyses || []).filter((a) => a.module === 'copy_studio');

  const sections = [
    { icon: '🧪', name: 'MVP Validator', done: !!sim, detail: sim ? `Aceptación ${((sim.results?.acceptance_rate?.mean ?? 0) * 100).toFixed(1)}%` : 'Sin simulación' },
    { icon: '🎯', name: 'Strategy', done: !!strat, detail: strat ? `${(strat.result?.biases || []).length} sesgos detectados` : 'Sin análisis' },
    { icon: '✍️', name: 'Copy Studio', done: copies.length > 0, detail: copies.length ? `${copies.length} generación(es)` : 'Sin copy' },
  ];
  const anyDone = sections.some((s) => s.done);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/projects/${id}`} style={{ color: 'var(--muted)', fontSize: 13 }}>← Volver al proyecto</Link>
      </div>
      <div className="page-head">
        <h1>📄 Informe completo</h1>
        <p>Un solo PDF con la validación, la psicología y el copy de <b>{project.name}</b>.</p>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        {sections.map((s) => (
          <div className="row" key={s.name} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{s.icon} <b>{s.name}</b></span>
            {s.done
              ? <span className="tag green">✓ {s.detail}</span>
              : <span className="tag gray">{s.detail}</span>}
          </div>
        ))}
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 0' }}>
          El informe incluye las secciones ejecutadas; las pendientes aparecen marcadas como "sin ejecutar".
        </p>
      </div>

      {!anyDone && (
        <div className="banner" style={{ marginBottom: 14 }}>
          ℹ️ Aún no has ejecutado ninguna herramienta en este proyecto. El informe saldrá casi vacío —
          te recomendamos correr al menos el <Link href={`/projects/${id}/validator`}><b>Validator</b></Link> primero.
        </div>
      )}

      <button className="btn" onClick={() => exportProjectReportPDF(project)}>
        ⬇ Descargar informe PDF
      </button>
    </div>
  );
}

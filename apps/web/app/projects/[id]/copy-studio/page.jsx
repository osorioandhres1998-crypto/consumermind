'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProject, apiFetch } from '../../../../lib/api';
import { exportCopyPDF } from '../../../../lib/pdf';

function CopyResult({ data }) {
  const mode = data.mode || (data.result?.angles ? 'angles' : 'copy');
  const r = data.result;

  if (mode === 'angles') {
    return (
      <div className="grid">
        {(r.angles || []).map((a, i) => (
          <div className="card bias" key={i}>
            <div className="row"><h3 style={{ margin: 0 }}>{a.title}</h3><span className="tag">{a.bias}</span></div>
            <p style={{ margin: '8px 0 4px' }}>{a.big_idea}</p>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{a.execution}</p>
            <pre className="copy">{a.hook}</pre>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Headlines</h3>
        {(r.headlines || []).map((h, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <span className="tag" style={{ marginRight: 8 }}>{h.bias}</span>{h.text}
          </div>
        ))}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>CTA</h3>
        {(r.cta || []).map((c, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <span className="tag" style={{ marginRight: 8 }}>{c.bias}</span>{c.text}
          </div>
        ))}
      </div>
      {r.body && <div className="card"><h3 style={{ marginTop: 0 }}>Cuerpo</h3><pre className="copy">{r.body}</pre></div>}
      {r.subject_lines?.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Asuntos de email</h3>
          {r.subject_lines.map((s, i) => <div key={i} style={{ marginBottom: 6 }}>• {s}</div>)}
        </div>
      )}
    </div>
  );
}

export default function ProjectCopyStudioPage() {
  const { id } = useParams();
  const [ready, setReady] = useState(false);
  const [hasStrategy, setHasStrategy] = useState(false);
  const [mode, setMode] = useState('copy');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const p = await getProject(id);
        setHasStrategy((p.analyses || []).some((a) => a.module === 'strategy'));
      } catch (e) {
        setError(e.message);
      } finally {
        setReady(true);
      }
    })();
  }, [id]);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/copy-studio/generate', {
        method: 'POST',
        body: JSON.stringify({ projectId: id, mode }),
      });
      setResult(data);
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
        <h1>✍️ Copy Studio</h1>
        <p>Genera copy o ángulos que activan los sesgos detectados por Strategy en este proyecto.</p>
      </div>

      {!hasStrategy ? (
        <div className="empty">
          <div className="big">🎯</div>
          Primero ejecuta <b>Strategy</b> en este proyecto para detectar los sesgos.
          <div style={{ marginTop: 14 }}>
            <Link className="btn" href={`/projects/${id}/strategy`}>Ir a Strategy</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 22 }}>
            <div className="field">
              <label>Tipo de generación</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="copy">Copy (headlines, CTA, cuerpo, asuntos)</option>
                <option value="angles">Ángulos creativos</option>
              </select>
            </div>
            <button className="btn" onClick={run} disabled={loading}>
              {loading ? <><span className="spinner" /> Generando…</> : '⚡ Generar'}
            </button>
          </div>

          {error && <div className="banner err">⚠️ {error}</div>}
          {loading && <div className="banner">⏳ Generando a partir de los sesgos detectados…</div>}

          {result && !loading && (
            <div>
              <div className="row" style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>{(result.mode || mode) === 'angles' ? 'Ángulos creativos' : 'Copy'}</h2>
                <button className="btn ghost" onClick={() => exportCopyPDF(result)}>⬇ Exportar PDF</button>
              </div>
              <CopyResult data={result} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

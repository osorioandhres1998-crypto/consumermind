'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCopyGeneration } from '../../hooks/useCopyGeneration';
import { listStrategyAnalyses } from '../../lib/api';
import { exportCopyPDF } from '../../lib/pdf';
import CopyExportButtons from '../../components/CopyExportButtons';

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

export default function CopyStudioPage() {
  const { generate, loading, result, error } = useCopyGeneration();
  const [analyses, setAnalyses] = useState(null); // null = cargando
  const [listError, setListError] = useState(null);
  const [analysisId, setAnalysisId] = useState('');
  const [mode, setMode] = useState('copy');

  useEffect(() => {
    listStrategyAnalyses()
      .then((rows) => {
        setAnalyses(rows);
        if (rows[0]) setAnalysisId(rows[0].id);
      })
      .catch((e) => { setAnalyses([]); setListError(e.message); });
  }, []);

  const label = (a) => {
    const p = a.input?.product || 'caso';
    const c = a.input?.customer || '';
    return `${p}${c ? ' → ' + c : ''} · ${new Date(a.created_at).toLocaleDateString('es-ES')}`;
  };

  const run = async () => {
    try { await generate({ analysisId, mode }); } catch (_) { /* error en hook */ }
  };

  if (analyses === null) {
    return (
      <div>
        <div className="page-head"><h1>Copy Studio</h1><p>Genera copy a partir de un análisis de Strategy.</p></div>
        <div className="banner">⏳ Cargando análisis…</div>
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div>
        <div className="page-head"><h1>Copy Studio</h1><p>Genera copy a partir de un análisis de Strategy.</p></div>
        {listError && <div className="banner err">⚠️ {listError}</div>}
        <div className="empty">
          <div className="big">✍️</div>
          Primero necesitas un <b>análisis en Strategy</b>.<br /><br />
          <Link className="btn" href="/strategy">Ir a Strategy</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <h1>Copy Studio</h1>
        <p>Elige un análisis previo; el motor genera copy o ángulos que activan exactamente esos sesgos.</p>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="field">
          <label>Análisis de origen (de Strategy)</label>
          <select value={analysisId} onChange={(e) => setAnalysisId(e.target.value)}>
            {analyses.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Tipo de generación</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="copy">Copy (headlines, CTA, cuerpo, asuntos)</option>
            <option value="angles">Ángulos creativos</option>
          </select>
        </div>
        <button className="btn" onClick={run} disabled={loading || !analysisId}>
          {loading ? <><span className="spinner" /> Generando…</> : '⚡ Generar'}
        </button>
      </div>

      {error && <div className="banner err">⚠️ {error}</div>}
      {loading && <div className="banner">⏳ Generando a partir de los sesgos detectados…</div>}

      {result && !loading && (
        <div>
          <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{(result.mode || mode) === 'angles' ? 'Ángulos creativos' : 'Copy'}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <CopyExportButtons result={result} />
              <button className="btn ghost sm" onClick={() => exportCopyPDF(result)}>⬇ PDF</button>
            </div>
          </div>
          <CopyResult data={result} />
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * COPILOTO IA — global (botón flotante en toda la app para usuarios logueados).
 * Responde SOLO con los datos reales de UN proyecto. Si estás dentro de un
 * proyecto (/projects/<id>), lo autoselecciona; si no, muestra un selector
 * para elegir sobre cuál preguntar. Chat efímero (no se persiste).
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { askCopilot, listProjects } from '../lib/api';

const SUGGESTED = [
  '¿Por qué mi MER está en riesgo?',
  '¿Qué recomienda el análisis de landing?',
  '¿Cuál es el sesgo psicológico más fuerte de este proyecto?',
  '¿Debería escalar el presupuesto de ads?',
];

export default function Copilot() {
  const pathname = usePathname();
  // Autodetecta el proyecto actual desde la URL (/projects/<id>).
  const pathProjectId = useMemo(() => {
    const m = /^\/projects\/([0-9a-fA-F-]{8,})/.exec(pathname || '');
    return m ? m[1] : null;
  }, [pathname]);

  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(null); // lista para el selector
  const [selectedId, setSelectedId] = useState(pathProjectId || '');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Si navegas a un proyecto, se autoselecciona.
  useEffect(() => { if (pathProjectId) setSelectedId(pathProjectId); }, [pathProjectId]);

  // Al abrir sin proyecto en la URL, carga la lista para el selector.
  useEffect(() => {
    if (!open || projects !== null || pathProjectId) return;
    listProjects().then((ps) => {
      setProjects(ps);
      if (ps.length && !selectedId) setSelectedId(ps[0].id);
    }).catch(() => setProjects([]));
  }, [open, projects, pathProjectId, selectedId]);

  const send = async (q) => {
    const text = (q ?? question).trim();
    if (!text || loading || !selectedId) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setQuestion('');
    setLoading(true);
    setError('');
    try {
      const data = await askCopilot(selectedId, text);
      setMessages((m) => [...m, { role: 'assistant', text: data.answer, usedData: data.used_data, missing: data.missing_data }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Nombre del proyecto seleccionado (para el encabezado) cuando hay lista.
  const selectedName = projects?.find((p) => p.id === selectedId)?.name;

  return (
    <>
      <button
        className="btn"
        onClick={() => setOpen(!open)}
        style={{ position: 'fixed', bottom: 24, right: 24, borderRadius: 99, padding: '12px 18px', boxShadow: '0 4px 16px rgba(79,70,229,.35)', zIndex: 20 }}
      >
        {open ? '✕ Cerrar' : '🤖 Copiloto'}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 84, right: 24, width: 360, maxHeight: '65vh',
          background: '#fff', border: '1px solid var(--line)', borderRadius: 14,
          boxShadow: '0 12px 40px rgba(20,30,50,.2)', display: 'flex', flexDirection: 'column', zIndex: 20,
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 14 }}>
            🤖 Copiloto {selectedName ? `· ${selectedName}` : 'IA'}
          </div>

          {/* Selector de proyecto cuando no venimos de una vista de proyecto */}
          {!pathProjectId && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
              {projects === null ? (
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Cargando proyectos…</span>
              ) : projects.length === 0 ? (
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Crea un proyecto para preguntarle al copiloto.</span>
              ) : (
                <select
                  value={selectedId}
                  onChange={(e) => { setSelectedId(e.target.value); setMessages([]); }}
                  style={{ width: '100%', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}
                >
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 120 }}>
            {messages.length === 0 && (
              <div>
                <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 8px' }}>
                  Pregunta sobre este proyecto — respondo solo con sus datos reales.
                </p>
                {SUGGESTED.map((s) => (
                  <button key={s} className="btn ghost sm" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }} onClick={() => send(s)} disabled={!selectedId}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? 'var(--indigo)' : '#f4f5f7',
                color: m.role === 'user' ? '#fff' : 'var(--text)',
                borderRadius: 10, padding: '8px 12px', fontSize: 13, maxWidth: '85%',
              }}>
                {m.text}
                {m.missing && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.75 }}>⚠️ Falta un dato para responder del todo.</div>}
                {m.usedData?.length > 0 && (
                  <div style={{ fontSize: 10.5, marginTop: 5, opacity: 0.7 }}>
                    Datos usados: {m.usedData.join(' · ')}
                  </div>
                )}
              </div>
            ))}
            {loading && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}><span className="spinner" style={{ borderTopColor: 'var(--indigo)' }} /> Pensando…</div>}
            {error && <div className="banner err" style={{ fontSize: 12 }}>⚠️ {error}</div>}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--line)' }}
          >
            <input
              value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder={selectedId ? 'Escribe tu pregunta…' : 'Elige un proyecto primero'} disabled={!selectedId}
              style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }}
            />
            <button className="btn sm" type="submit" disabled={loading || !question.trim() || !selectedId}>➤</button>
          </form>
        </div>
      )}
    </>
  );
}

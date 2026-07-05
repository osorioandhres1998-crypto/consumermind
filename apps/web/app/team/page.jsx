'use client';

/**
 * EQUIPO — N3-A (multi-miembro y roles) + N3-B (marca blanca).
 * Solo el Owner administra invitaciones, miembros y el branding del PDF;
 * el resto del equipo ve la lista en modo lectura.
 */

import { useEffect, useState } from 'react';
import {
  getTeamOverview, createInvitation, revokeInvitation, removeMember, updateBranding, changePassword,
} from '../../lib/api';

const ROLE_LABEL = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer (solo lectura)' };

export default function TeamPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [creating, setCreating] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [brandColor, setBrandColor] = useState('');
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandMsg, setBrandMsg] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const load = async () => {
    try {
      const d = await getTeamOverview();
      setData(d);
      setBrandName(d.workspace?.brand_name || '');
      setBrandColor(d.workspace?.brand_color || '');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const isOwner = data?.myRole === 'owner';

  const invite = async () => {
    setCreating(true);
    try { await createInvitation(newRole); await load(); }
    catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  const copyLink = (token, id) => {
    const url = `${window.location.origin}/register?invite=${token}`;
    navigator.clipboard?.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const saveBranding = async () => {
    setSavingBrand(true);
    setBrandMsg('');
    try {
      await updateBranding(brandName, brandColor || null);
      setBrandMsg('✓ Marca guardada. Se aplicará al próximo informe PDF.');
    } catch (e) {
      setBrandMsg(`⚠️ ${e.message}`);
    } finally {
      setSavingBrand(false);
    }
  };

  if (!data) return error ? <div className="banner err">⚠️ {error}</div> : <div className="empty"><div className="big">⏳</div>Cargando…</div>;

  return (
    <div>
      <div className="page-head">
        <h1>👥 Equipo</h1>
        <p>Invita a tu equipo con roles (editor/viewer) y personaliza la marca de tus informes PDF.</p>
      </div>

      {error && <div className="banner err" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

      {/* Miembros */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Miembros del workspace</h3>
        {data.members.map((m) => (
          <div key={m.id} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div>
              <b>{m.name || m.email}</b> {m.name && <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>· {m.email}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="tag gray">{ROLE_LABEL[m.role] || m.role}</span>
              {isOwner && m.role !== 'owner' && (
                <button className="btn ghost sm" onClick={async () => { if (confirm(`¿Quitar a ${m.email} del workspace?`)) { await removeMember(m.id); await load(); } }}>🗑</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invitaciones (solo Owner puede crear) */}
      {isOwner && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Invitar por enlace</h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -8 }}>
            Genera un enlace y compártelo por donde quieras (no se envía email automático).
          </p>
          <div className="row" style={{ marginBottom: 14 }}>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
              <option value="editor">Editor (puede usar todas las herramientas)</option>
              <option value="viewer">Viewer (solo lectura)</option>
            </select>
            <button className="btn sm" onClick={invite} disabled={creating}>{creating ? 'Generando…' : '+ Generar invitación'}</button>
          </div>

          {data.invitations.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin invitaciones pendientes.</p>
          ) : (
            data.invitations.map((inv) => (
              <div key={inv.id} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontSize: 13 }}>
                  <span className="tag">{ROLE_LABEL[inv.role]}</span>{' '}
                  <span style={{ color: 'var(--muted)' }}>expira {new Date(inv.expires_at).toLocaleDateString('es')}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn ghost sm" onClick={() => copyLink(inv.token, inv.id)}>{copiedId === inv.id ? '✓ Copiado' : '🔗 Copiar enlace'}</button>
                  <button className="btn ghost sm" onClick={async () => { await revokeInvitation(inv.id); await load(); }}>Revocar</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Marca blanca del PDF (solo Owner) */}
      {isOwner && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>🎨 Marca blanca del informe PDF</h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -8 }}>
            Reemplaza "Master Tool" por el nombre y color de tu agencia en los informes exportados.
          </p>
          <div className="grid cols-2">
            <div className="field">
              <label>Nombre de marca</label>
              <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Mi Agencia" />
            </div>
            <div className="field">
              <label>Color (hex)</label>
              <input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} placeholder="#4338ca" />
            </div>
          </div>
          <button className="btn sm" onClick={saveBranding} disabled={savingBrand}>{savingBrand ? 'Guardando…' : 'Guardar marca'}</button>
          {brandMsg && <div style={{ fontSize: 12.5, marginTop: 8, color: brandMsg.startsWith('✓') ? '#1f9d6b' : '#ef5350' }}>{brandMsg}</div>}
        </div>
      )}

      <PasswordCard />
    </div>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await changePassword(currentPassword, newPassword);
      setMsg('✓ Contraseña actualizada.');
      setCurrentPassword(''); setNewPassword('');
    } catch (err) {
      setMsg(`⚠️ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 18 }}>
      <h3 style={{ marginTop: 0 }}>🔒 Cambiar mi contraseña</h3>
      <div className="grid cols-2">
        <div className="field">
          <label>Contraseña actual</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>Contraseña nueva (mín. 8)</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
      </div>
      <button className="btn sm" type="submit" disabled={saving || !currentPassword || newPassword.length < 8}>
        {saving ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith('✓') ? '#1f9d6b' : '#ef5350' }}>{msg}</div>}
    </form>
  );
}

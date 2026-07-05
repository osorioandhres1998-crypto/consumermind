'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'No se pudo procesar la solicitud.');
      }
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '40px auto' }}>
      <div className="page-head">
        <h1>Recuperar contraseña</h1>
        <p>Te enviaremos un enlace para crear una nueva contraseña.</p>
      </div>

      {sent ? (
        <div className="banner">
          ✅ Si <b>{email}</b> tiene una cuenta, te llegará un correo con el enlace en unos minutos.
          Revisa también spam. El enlace expira en 1 hora.
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          {error && <div className="banner err" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
          <button className="btn" type="submit" disabled={loading || !email}>
            {loading ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}

      <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 14 }}>
        <Link href="/login" style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>← Volver a entrar</Link>
      </p>
    </div>
  );
}

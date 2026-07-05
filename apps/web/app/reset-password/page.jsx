'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'No se pudo restablecer la contraseña.');
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ maxWidth: 400, margin: '40px auto' }}>
        <div className="banner err">⚠️ Enlace inválido. Solicita uno nuevo desde <Link href="/forgot-password">Recuperar contraseña</Link>.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '40px auto' }}>
      <div className="page-head">
        <h1>Nueva contraseña</h1>
        <p>Elige una contraseña nueva para tu cuenta.</p>
      </div>

      {done ? (
        <div className="banner">✅ Contraseña actualizada. Entrando al login…</div>
      ) : (
        <form className="card" onSubmit={submit}>
          <div className="field">
            <label>Contraseña nueva (mín. 8)</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', paddingRight: 40 }} autoFocus
              />
              <button
                type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          {error && <div className="banner err" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
          <button className="btn" type="submit" disabled={loading || password.length < 8}>
            {loading ? 'Guardando…' : 'Restablecer contraseña'}
          </button>
        </form>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const r = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (r?.error) {
      setError('Credenciales inválidas. Verifica tu email y contraseña.');
    } else if (r?.ok) {
      router.push('/dashboard');
    } else {
      setError('Error al iniciar sesión. Intenta de nuevo.');
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: '40px auto' }}>
      <div className="page-head"><h1>Entrar</h1><p>Accede a tu workspace.</p></div>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        </div>
        {error && <div className="banner err" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
        <button className="btn" type="submit" disabled={loading || !email || !password}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 14 }}>
        ¿No tienes cuenta? <Link href="/register" style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>Crear una</Link>
      </p>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthBackground from '../../components/AuthBackground';

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
    <div style={{ maxWidth: 380, margin: '0 auto' }}>
      <AuthBackground />
      <div className="auth-headline">
        <h1>Impulsa tu marketing</h1>
        <p>Entra a tu workspace y sigue tus campañas.</p>
      </div>
      <form className="card" onSubmit={submit}>
        <h2 style={{ margin: '0 0 2px', fontSize: 20 }}>Entrar</h2>
        <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 14 }}>Accede a tu workspace.</p>
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
        <Link href="/forgot-password" style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>¿Olvidaste tu contraseña?</Link>
      </p>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>
        ¿No tienes cuenta? <Link href="/register" style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>Crear una</Link>
      </p>
    </div>
  );
}

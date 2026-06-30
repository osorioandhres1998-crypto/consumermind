'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', workspaceName: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'No se pudo crear la cuenta.');
      }
      // Cuenta creada → inicia sesión y entra.
      const r = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
      if (r?.error) throw new Error('Cuenta creada, pero falló el inicio de sesión.');
      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <div className="page-head"><h1>Crear cuenta</h1><p>Crea tu workspace. Serás el Owner.</p></div>
      <form className="card" onSubmit={submit}>
        <div className="field"><label>Nombre</label><input value={form.name} onChange={set('name')} autoFocus /></div>
        <div className="field"><label>Email</label><input type="email" value={form.email} onChange={set('email')} /></div>
        <div className="field">
          <label>Contraseña (mín. 8)</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
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
        <div className="field"><label>Nombre del workspace (opcional)</label><input value={form.workspaceName} onChange={set('workspaceName')} placeholder="Mi equipo" /></div>
        {error && <div className="banner err" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
        <button className="btn" type="submit" disabled={loading || !form.email || form.password.length < 8}>
          {loading ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 14 }}>
        ¿Ya tienes cuenta? <Link href="/login" style={{ color: 'var(--indigo-600)', fontWeight: 600 }}>Entrar</Link>
      </p>
    </div>
  );
}

'use client';

/**
 * Fondo de las páginas de autenticación (login/register/forgot/reset).
 * - Gradiente diagonal índigo→violeta→azul en la sección superior.
 * - Ola orgánica asimétrica que corta el gradiente hacia el fondo claro.
 * - Círculos decorativos flotantes (uno solo con contorno/ring).
 * - Marca la <body> con `auth-page` para que el Nav se vuelva transparente
 *   y flote sobre el gradiente (ver styles.css). Se limpia al desmontar.
 */

import { useEffect } from 'react';

export default function AuthBackground() {
  useEffect(() => {
    document.body.classList.add('auth-page');
    return () => document.body.classList.remove('auth-page');
  }, []);

  return (
    <div className="auth-hero" aria-hidden="true">
      <div className="auth-grad" />
      {/* Círculos decorativos: rellenos semitransparentes + un ring */}
      <span className="auth-circle" style={{ width: 220, height: 220, top: '8%', left: '-60px', background: 'rgba(255,255,255,.12)' }} />
      <span className="auth-circle" style={{ width: 90, height: 90, top: '4%', left: '22%', background: 'rgba(255,255,255,.18)' }} />
      <span className="auth-circle" style={{ width: 130, height: 130, top: '26%', right: '10%', background: 'rgba(255,255,255,.10)' }} />
      <span className="auth-circle" style={{ width: 60, height: 60, top: '40%', right: '26%', background: 'rgba(255,255,255,.22)' }} />
      <span className="auth-circle" style={{ width: 140, height: 140, top: '30%', left: '6%', border: '2px solid rgba(255,255,255,.30)', background: 'transparent' }} />
      {/* Ola asimétrica hacia el fondo claro */}
      <svg className="auth-wave" viewBox="0 0 1440 160" preserveAspectRatio="none">
        <path fill="#f5f6fa" d="M0,64 C240,140 480,150 720,104 C960,58 1200,10 1440,54 L1440,160 L0,160 Z" />
      </svg>
    </div>
  );
}

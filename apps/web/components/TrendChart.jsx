'use client';

/**
 * TrendChart — gráfica de línea SVG genérica para series mensuales (N1-B).
 * Mismo patrón sin dependencias que las curvas de Validator/ProfitGuard.
 * `points`: [{ period: 'YYYY-MM', value: number|null }, ...] ordenados.
 * `bands` opcional: [{ upTo: number, color }] para pintar franjas de fondo
 * (ej. semáforo de MER/score) de abajo hacia arriba.
 */

import { useState } from 'react';

export default function TrendChart({ points, label, color = '#4f46e5', format = (v) => v, bands = null, yMax: yMaxProp }) {
  const L = 40, R = 352, Tp = 12, Bp = 120, W = R - L, H = Bp - Tp;
  const valid = points.filter((p) => p.value != null);
  if (valid.length === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '20px 0', textAlign: 'center' }}>Sin datos suficientes todavía.</div>;
  }

  const values = valid.map((p) => p.value);
  const yMax = yMaxProp || Math.max(...values) * 1.15 || 1;
  const yMin = 0;
  const n = points.length;
  const sx = (i) => (n <= 1 ? (L + R) / 2 : L + (i / (n - 1)) * W);
  const sy = (v) => Bp - ((v - yMin) / (yMax - yMin || 1)) * H;

  const linePoints = points.map((p, i) => (p.value != null ? `${sx(i).toFixed(1)} ${sy(p.value).toFixed(1)}` : null)).filter(Boolean);
  const line = 'M' + linePoints.join(' L');

  const [hover, setHover] = useState(null);
  const move = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width * 366;
    const i = Math.round(((relX - L) / W) * (n - 1));
    if (i >= 0 && i < n && points[i].value != null) setHover(i);
    else setHover(null);
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ position: 'relative' }} onMouseMove={move} onMouseLeave={() => setHover(null)}>
        <svg viewBox="0 0 366 132" style={{ width: '100%', height: 'auto', display: 'block' }}>
          {bands && bands.map((b, i) => {
            const prevUpTo = i === 0 ? yMin : bands[i - 1].upTo;
            const y1 = sy(Math.min(b.upTo, yMax)), y2 = sy(prevUpTo);
            return <rect key={i} x={L} y={y1} width={W} height={Math.max(0, y2 - y1)} fill={b.color} opacity="0.35" />;
          })}
          {[0, 1, 2, 3].map((i) => {
            const v = yMin + (yMax - yMin) * (i / 3);
            const y = sy(v);
            return (
              <g key={i}>
                <line x1={L} x2={R} y1={y} y2={y} stroke="#eef0f3" strokeWidth="1" />
                <text x={L - 5} y={y + 3} textAnchor="end" fontSize="8" fill="#aab0bb">{format(v)}</text>
              </g>
            );
          })}
          {points.map((p, i) => <text key={i} x={sx(i)} y="128" textAnchor="middle" fontSize="7.5" fill="#aab0bb">{p.period.slice(2)}</text>)}
          {linePoints.length > 1 && <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          {points.map((p, i) => p.value != null && (
            <circle key={i} cx={sx(i)} cy={sy(p.value)} r={hover === i ? 4.5 : 3} fill={color} stroke="#fff" strokeWidth="1.5" />
          ))}
        </svg>
        {hover != null && (
          <div style={{ position: 'absolute', left: `${(sx(hover) / 366) * 100}%`, top: 0, transform: 'translateX(-50%)', background: '#fff', border: '1px solid var(--line)', borderRadius: 7, boxShadow: '0 4px 12px rgba(20,30,50,.14)', padding: '4px 9px', pointerEvents: 'none', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700 }}>
            {points[hover].period}: <span style={{ color }}>{format(points[hover].value)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

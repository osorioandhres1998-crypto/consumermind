'use client';

/**
 * CALCULADORA DE RENTABILIDAD (ProfitGuard) — módulo del master-tool.
 * 100% client-side (spec ADR-001): el cálculo es instantáneo y no toca
 * el backend. El motor vive en lib/profitability.js (funciones puras).
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProject, saveMetricsSnapshot, listMetricsSnapshots } from '../../../../lib/api';
import {
  CURRENCIES, parseNum, computeCore, diagnose,
  scenarioBudget, scenarioPrice, scenarioCvr, recommend,
  ltvCacBand, paybackBand, merBand,
} from '../../../../lib/profitability';
import { detectAndAggregate, guessSource } from '../../../../lib/csv-import';
import { getVerticalBenchmarks, merBandFor, ltvCacBandFor, paybackBandFor } from '../../../../lib/benchmarks-verticales';

const TONES = {
  ok:     { color: '#1f9d6b', bg: '#f1faf4', border: '#cfe9d9' },
  warn:   { color: '#d98c1a', bg: '#fff8ea', border: '#f1e0ad' },
  orange: { color: '#e2730c', bg: '#fff3ea', border: '#f5d2b6' },
  bad:    { color: '#ef5350', bg: '#fdecea', border: '#f3c7c2' },
  info:   { color: '#9aa1ad', bg: '#f4f5f7', border: '#e4e7ec' },
};

const card = { background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '15px 16px', boxShadow: 'var(--shadow)' };
const lbl = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13, color: 'var(--muted)' };
const fld = { width: 110, textAlign: 'right', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' };
const secTitle = { fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 11px' };

function Metric({ label, value, sub, color = 'var(--text)' }) {
  return (
    <div style={{ ...card, padding: '13px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// Curva SVG genérica: fn(x) sobre dominio xd, con línea de referencia refY.
function Curve({ fn, xd, yd, refVal, refLabel, refColor = '#4f46e5', stroke = '#4f46e5', area = false, xLab, yLab, hover, tipLines }) {
  const L = 42, R = 352, Tp = 12, Bp = 128, W = R - L, H = Bp - Tp;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sx = (v) => L + (v - xd[0]) / (xd[1] - xd[0]) * W;
  const sy = (v) => Bp - (clamp(v, yd[0], yd[1]) - yd[0]) / (yd[1] - yd[0]) * H;
  const pts = [];
  for (let i = 0; i <= 60; i++) { const x = xd[0] + (xd[1] - xd[0]) * i / 60; pts.push(`${sx(x).toFixed(1)} ${sy(fn(x)).toFixed(1)}`); }
  const line = 'M' + pts.join(' L');
  const areaPath = `M${sx(xd[0]).toFixed(1)} ${Bp} L${pts.join(' L')} L${sx(xd[1]).toFixed(1)} ${Bp} Z`;
  const yTicks = [], xTicks = [];
  for (let i = 0; i <= 4; i++) { const v = yd[0] + (yd[1] - yd[0]) * i / 4; yTicks.push({ y: sy(v), label: yLab(v) }); }
  for (let i = 0; i <= 5; i++) { const v = xd[0] + (xd[1] - xd[0]) * i / 5; xTicks.push({ x: sx(v), label: xLab(v) }); }
  const refY = isFinite(refVal) ? clamp(sy(refVal), Tp, Bp) : Bp;

  const [hv, setHv] = useState(null);
  const move = (e) => { const r = e.currentTarget.getBoundingClientRect(); setHv(clamp(((e.clientX - r.left) / r.width * 366 - L) / W, 0, 1)); };
  let hoverEls = null, tip = null;
  if (hv != null && hover) {
    const xv = xd[0] + hv * (xd[1] - xd[0]);
    const yv = fn(xv);
    const lineX = L + hv * W, dotY = clamp(sy(yv), Tp, Bp);
    hoverEls = (
      <>
        <line x1={lineX} x2={lineX} y1={12} y2={128} stroke="#c7d2fe" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={lineX} cy={dotY} r="4" fill={stroke} stroke="#fff" strokeWidth="1.5" />
      </>
    );
    tip = (
      <div style={{ position: 'absolute', left: `${clamp(lineX / 366 * 100, 17, 83)}%`, top: `${clamp(dotY / 150 * 100 - 34, 3, 52)}%`, transform: 'translateX(-50%)', background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 4px 14px rgba(20,30,50,.14)', padding: '6px 10px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5, fontSize: 11, fontWeight: 600 }}>
        {tipLines(xv, yv).map((l, i) => <div key={i} style={{ color: l.color || 'var(--text)' }}>{l.text}</div>)}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', cursor: 'crosshair' }} onMouseMove={move} onMouseLeave={() => setHv(null)}>
      <svg viewBox="0 0 366 150" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {yTicks.map((g, i) => (
          <g key={i}>
            <line x1={L} x2={R} y1={g.y} y2={g.y} stroke="#eef0f3" strokeWidth="1" />
            <text x={L - 5} y={g.y + 3} textAnchor="end" fontSize="8" fill="#aab0bb">{g.label}</text>
          </g>
        ))}
        {xTicks.map((g, i) => <text key={i} x={g.x} y="146" textAnchor="middle" fontSize="7.5" fill="#aab0bb">{g.label}</text>)}
        {area && <path d={areaPath} fill="rgba(15,155,142,.13)" stroke="none" />}
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1={L} x2={R} y1={refY} y2={refY} stroke={refColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        <text x={R - 2} y={refY - 3} textAnchor="end" fontSize="8" fill={refColor} fontWeight="700">{refLabel}</text>
        {hoverEls}
      </svg>
      {tip}
    </div>
  );
}

export default function ProfitabilityPage() {
  const { id } = useParams();
  const [currency, setCurrency] = useState('COP');
  const [inp, setInp] = useState({
    precio: '100000', costoProducto: '40000', costoEnvio: '8000', comision: '3', devolucion: '5',
    adsPeriodo: '2000000', fijosMarketing: '1700000', cpc: '800',
    ingresosPeriodo: '5000000', ordenesPeriodo: '50', roasManual: '2.50',
    // Módulo LTV: defaults neutros (1 y 1 → ltv = CAC máximo; vacío → usa órdenes).
    frecuenciaMensual: '1', retencionMeses: '1', clientesNuevosPeriodo: '',
  });
  const [roasMode, setRoasMode] = useState('auto');
  const [tab, setTab] = useState('budget');
  const [adsMult, setAdsMult] = useState(1);
  const [precioMult, setPrecioMult] = useState(1);
  const [cvrSlider, setCvrSlider] = useState(20); // /1000 → 2.0%
  const [barHover, setBarHover] = useState(null);

  // Importador CSV (N1-A): parseo 100% en el navegador, el archivo nunca sale de aquí.
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState(null); // { ok, aggregated, headers, map, error }
  const [importSource, setImportSource] = useState('csv');
  const [snapPeriod, setSnapPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    const result = detectAndAggregate(text);
    setImportResult(result);
    setImportSource(result.ok ? guessSource(result.headers) : 'csv');
    setSaveMsg('');
  };

  const applyImport = () => {
    if (!importResult?.ok) return;
    const a = importResult.aggregated;
    setInp((s) => ({
      ...s,
      adsPeriodo: String(a.adsPeriodo),
      ingresosPeriodo: String(a.ingresosPeriodo),
      ordenesPeriodo: String(a.ordenesPeriodo),
      cpc: a.cpc > 0 ? String(a.cpc) : s.cpc,
    }));
    setRoasMode('auto');
  };

  const saveSnapshot = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await saveMetricsSnapshot({
        projectId: id, period: snapPeriod, source: importSource,
        metrics: {
          adsPeriodo: parseNum(inp.adsPeriodo), fijosMarketing: parseNum(inp.fijosMarketing),
          ingresosPeriodo: parseNum(inp.ingresosPeriodo), ordenesPeriodo: parseNum(inp.ordenesPeriodo),
          cpc: parseNum(inp.cpc), clientesNuevosPeriodo: parseNum(inp.clientesNuevosPeriodo) || null,
        },
      });
      setSaveMsg(`✓ Guardado como snapshot de ${snapPeriod}.`);
    } catch (e) {
      setSaveMsg(`⚠️ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Prefill del precio y vertical desde el proyecto, si es parseable.
  const [vertical, setVertical] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const p = await getProject(id);
        const n = parseNum(String(p.price || '').replace(/[^\d.,]/g, ''));
        if (n > 0) setInp((s) => ({ ...s, precio: String(n) }));
        if (p.vertical) setVertical(p.vertical);
      } catch (_) { /* la calculadora funciona sin proyecto */ }
    })();
  }, [id]);

  const set = (k) => (e) => setInp({ ...inp, [k]: e.target.value });

  const cur = CURRENCIES[currency] || CURRENCIES.COP;
  const fm = useMemo(() => {
    const nf = new Intl.NumberFormat(cur.locale, { maximumFractionDigits: cur.decimals });
    const nfi = new Intl.NumberFormat(cur.locale, { maximumFractionDigits: 0 });
    return {
      money: (n) => (!isFinite(n) ? '—' : `${cur.symbol} ${nf.format(n)}`),
      pct: (x, d = 1) => (!isFinite(x) ? '—' : `${(x * 100).toFixed(d).replace('.', ',')}%`),
      r2: (x) => (!isFinite(x) ? '∞' : `${x.toFixed(2).replace('.', ',')}×`),
      r2n: (x) => (!isFinite(x) ? '∞' : x.toFixed(2).replace('.', ',')),
      i0: (x) => (!isFinite(x) ? '—' : nfi.format(Math.round(x))),
      compact: (n) => {
        if (!isFinite(n)) return '—';
        const a = Math.abs(n);
        if (a >= 1e6) return `${cur.symbol}${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
        if (a >= 1e3) return `${cur.symbol}${(n / 1e3).toFixed(0)}K`;
        return `${cur.symbol}${Math.round(n)}`;
      },
    };
  }, [currency]);

  // Inputs numéricos + motor
  const i = useMemo(() => ({
    precio: parseNum(inp.precio), costoProducto: parseNum(inp.costoProducto), costoEnvio: parseNum(inp.costoEnvio),
    comisionPct: parseNum(inp.comision) / 100, devolucionPct: parseNum(inp.devolucion) / 100,
    ads: parseNum(inp.adsPeriodo), fijos: parseNum(inp.fijosMarketing), cpc: parseNum(inp.cpc),
    ingresos: parseNum(inp.ingresosPeriodo), ordenes: parseNum(inp.ordenesPeriodo),
    roasMode, roasManual: parseNum(inp.roasManual),
    frecuenciaMensual: parseNum(inp.frecuenciaMensual), retencionMeses: parseNum(inp.retencionMeses),
    clientesNuevos: parseNum(inp.clientesNuevosPeriodo),
  }), [inp, roasMode]);
  const m = useMemo(() => computeCore(i), [i]);
  const status = diagnose(m);
  const recos = useMemo(() => recommend(m, fm), [m, fm]);

  // Banner
  const BN = {
    invalid: { title: 'Sin margen', sub: 'Tus costos variables igualan o superan el precio. El margen es ≤ 0: ajusta precio o costos antes de pensar en ads.', ...TONES.bad },
    bad:  { title: 'Pierdes dinero', sub: `Tu ROAS (${fm.r2n(m.roasActual)}) no cubre el costo variable (break-even ${fm.r2n(m.roasBreakEven)}).`, ...TONES.bad },
    warn: { title: 'Cubres producto, no estructura', sub: `Tu ROAS (${fm.r2n(m.roasActual)}) cubre el costo variable, pero no alcanza el objetivo (${fm.r2n(m.roasObjetivo)}) para cubrir ads + estructura.`, ...TONES.warn },
    ok:   { title: 'Rentable', sub: `Tu ROAS (${fm.r2n(m.roasActual)}) supera el objetivo (${fm.r2n(m.roasObjetivo)}): cubres producto y estructura.`, ...TONES.ok },
  }[status];

  // Barra de zonas ROAS
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const scaleMax = Math.max(isFinite(m.roasObjetivo) ? m.roasObjetivo * 1.3 : 4, isFinite(m.roasActual) ? m.roasActual * 1.15 : 0, isFinite(m.roasBreakEven) ? m.roasBreakEven * 1.2 : 0, 3);
  const beRel = clamp((m.roasBreakEven / scaleMax) * 100, 0, 100);
  const objRel = clamp((m.roasObjetivo / scaleMax) * 100, 0, 100);
  const actRel = clamp((m.roasActual / scaleMax) * 100, 0, 100);
  let barTip = null;
  if (barHover != null) {
    const roasAt = barHover * scaleMax;
    const z = roasAt < m.roasBreakEven ? { c: '#ef5350', n: 'Pierdes' } : roasAt < m.roasObjetivo ? { c: '#d98c1a', n: 'Cubres' } : { c: '#1f9d6b', n: 'Rentable' };
    barTip = { left: clamp(barHover * 100, 6, 94), roas: fm.r2n(roasAt), ...z };
  }

  // Escenarios
  const simAds = i.ads * adsMult;
  const sb = scenarioBudget(m, i, simAds);
  const simPrecio = i.precio * precioMult;
  const sp = scenarioPrice(i, simPrecio);
  const cvr = cvrSlider / 1000;
  const sc = scenarioCvr(m, i, cvr);

  const segBtn = (on) => ({ flex: 1, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '8px 8px', borderRadius: 9, background: on ? '#fff' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', boxShadow: on ? '0 1px 3px rgba(20,30,50,.13)' : 'none' });
  const tile = (label, value, color = 'var(--text)') => (
    <div key={label} style={{ background: '#f7f8fa', border: '1px solid #edeef1', borderRadius: 9, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3, color }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/projects/${id}`} style={{ color: 'var(--muted)', fontSize: 13 }}>← Volver al proyecto</Link>
      </div>
      <div className="row" style={{ marginBottom: 18 }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1>💰 Calculadora de Rentabilidad</h1>
          <p>Convierte tu economía unitaria en un sistema de decisión: ¿ganas o pierdes con tu pauta, y cuánto puedes escalar?</p>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
          Moneda
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...fld, width: 110, textAlign: 'left', cursor: 'pointer' }}>
            {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c} · {CURRENCIES[c].symbol}</option>)}
          </select>
        </label>
      </div>

      {/* ===== Importador CSV (N1-A) — Meta Ads / Google Ads ===== */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row" style={{ cursor: 'pointer' }} onClick={() => setShowImport(!showImport)}>
          <b style={{ fontSize: 14 }}>📥 Importar datos reales (Meta Ads / Google Ads)</b>
          <span style={{ color: 'var(--muted)' }}>{showImport ? '▲' : '▼'}</span>
        </div>
        {showImport && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px' }}>
              Exporta el reporte de tu campaña desde Meta Ads Manager o Google Ads (formato CSV) y súbelo aquí.
              El archivo se procesa en tu navegador — nunca se envía al servidor.
            </p>
            <input
              type="file" accept=".csv,text/csv"
              onChange={(e) => handleFile(e.target.files?.[0])}
              style={{ fontSize: 13 }}
            />

            {importResult && !importResult.ok && (
              <div className="banner err" style={{ marginTop: 10 }}>⚠️ {importResult.error} — revisa que el archivo tenga una columna de gasto en ads.</div>
            )}

            {importResult?.ok && (
              <div style={{ marginTop: 12 }}>
                <div className="tag" style={{ marginBottom: 8 }}>
                  Detectado: {importSource === 'meta' ? 'Meta Ads' : importSource === 'google' ? 'Google Ads' : 'CSV genérico'} · {importResult.rowCount} filas
                </div>
                <div className="grid cols-2" style={{ gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5 }}>Gasto en ads: <b>{fm.money(importResult.aggregated.adsPeriodo)}</b></div>
                  <div style={{ fontSize: 12.5 }}>Ingresos atribuidos: <b>{fm.money(importResult.aggregated.ingresosPeriodo)}</b></div>
                  <div style={{ fontSize: 12.5 }}>Órdenes/conversiones: <b>{importResult.aggregated.ordenesPeriodo}</b></div>
                  <div style={{ fontSize: 12.5 }}>CPC promedio: <b>{fm.money(importResult.aggregated.cpc)}</b></div>
                </div>
                <button className="btn sm" type="button" onClick={applyImport}>Usar estos datos en la calculadora</button>
              </div>
            )}

            <div className="row" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Guardar como snapshot de:</span>
                <input type="month" value={snapPeriod} onChange={(e) => setSnapPeriod(e.target.value)} style={{ ...fld, width: 140 }} />
              </div>
              <button className="btn ghost sm" type="button" onClick={saveSnapshot} disabled={saving}>
                {saving ? 'Guardando…' : '💾 Guardar mes en el historial'}
              </button>
            </div>
            {saveMsg && <div style={{ fontSize: 12.5, marginTop: 8, color: saveMsg.startsWith('✓') ? '#1f9d6b' : '#ef5350' }}>{saveMsg}</div>}
          </div>
        )}
      </div>

      {/* ===== 1. INPUTS ===== */}
      <div style={secTitle}>1. Datos del negocio</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: 28 }}>
        <section style={card}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Economía unitaria</div>
          <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--muted)' }}>Por orden</p>
          <label style={lbl}><span>Precio de venta (AOV)</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: 'var(--muted)', fontSize: 12 }}>{cur.symbol}</span><input style={fld} value={inp.precio} onChange={set('precio')} inputMode="numeric" /></span></label>
          <label style={lbl}><span>Costo del producto</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: 'var(--muted)', fontSize: 12 }}>{cur.symbol}</span><input style={fld} value={inp.costoProducto} onChange={set('costoProducto')} inputMode="numeric" /></span></label>
          <label style={lbl}><span>Costo de envío</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: 'var(--muted)', fontSize: 12 }}>{cur.symbol}</span><input style={fld} value={inp.costoEnvio} onChange={set('costoEnvio')} inputMode="numeric" /></span></label>
          <label style={lbl}><span>Comisión pasarela</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><input style={{ ...fld, width: 60 }} value={inp.comision} onChange={set('comision')} inputMode="decimal" /><span style={{ color: 'var(--muted)', fontSize: 12 }}>%</span></span></label>
          <label style={lbl}><span>Devoluciones</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><input style={{ ...fld, width: 60 }} value={inp.devolucion} onChange={set('devolucion')} inputMode="decimal" /><span style={{ color: 'var(--muted)', fontSize: 12 }}>%</span></span></label>
        </section>

        <section style={card}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Marketing</div>
          <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--muted)' }}>Del periodo — mensual</p>
          <label style={lbl}><span>Gasto en ads</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: 'var(--muted)', fontSize: 12 }}>{cur.symbol}</span><input style={fld} value={inp.adsPeriodo} onChange={set('adsPeriodo')} inputMode="numeric" /></span></label>
          <label style={lbl}><span>Fijos de marketing</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: 'var(--muted)', fontSize: 12 }}>{cur.symbol}</span><input style={fld} value={inp.fijosMarketing} onChange={set('fijosMarketing')} inputMode="numeric" /></span></label>
          <label style={lbl}><span>CPC promedio</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: 'var(--muted)', fontSize: 12 }}>{cur.symbol}</span><input style={fld} value={inp.cpc} onChange={set('cpc')} inputMode="numeric" /></span></label>
        </section>

        <section style={card}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Desempeño</div>
          <p style={{ margin: '0 0 7px', fontSize: 11, color: 'var(--muted)' }}>Lo que pasó este periodo</p>
          <div style={{ display: 'flex', gap: 4, marginBottom: 3, padding: 3, background: '#f1f2f5', borderRadius: 9 }}>
            <button type="button" onClick={() => setRoasMode('auto')} style={segBtn(roasMode === 'auto')}>Desde ingresos</button>
            <button type="button" onClick={() => setRoasMode('manual')} style={segBtn(roasMode === 'manual')}>Escribir ROAS</button>
          </div>
          {roasMode === 'manual' && (
            <label style={lbl}><span>ROAS actual</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><input style={{ ...fld, width: 66 }} value={inp.roasManual} onChange={set('roasManual')} inputMode="decimal" /><span style={{ color: 'var(--muted)', fontSize: 12 }}>×</span></span></label>
          )}
          <label style={lbl}><span>Ingresos del periodo</span><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: 'var(--muted)', fontSize: 12 }}>{cur.symbol}</span><input style={fld} value={inp.ingresosPeriodo} onChange={set('ingresosPeriodo')} inputMode="numeric" /></span></label>
          <label style={lbl}><span>Nº de órdenes</span><input style={fld} value={inp.ordenesPeriodo} onChange={set('ordenesPeriodo')} inputMode="numeric" /></label>
          <label style={lbl}>
            <span>Clientes nuevos <span style={{ fontSize: 10, color: 'var(--muted)' }}>(vacío = usa órdenes)</span></span>
            <input
              style={fld} value={inp.clientesNuevosPeriodo} inputMode="numeric" placeholder="—"
              onChange={(e) => {
                // Un cliente nuevo aporta mínimo 1 orden: se clampa aquí, no en el cálculo.
                const v = e.target.value;
                const n = parseNum(v);
                const ord = parseNum(inp.ordenesPeriodo);
                setInp({ ...inp, clientesNuevosPeriodo: v !== '' && ord > 0 && n > ord ? String(ord) : v });
              }}
            />
          </label>
        </section>

        <section style={card}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Cliente / LTV</div>
          <p style={{ margin: '0 0 7px', fontSize: 11, color: 'var(--muted)' }}>Estimación declarada por ti — no son datos de cohortes reales</p>
          <label style={lbl}><span>Compras por cliente al mes</span><input style={{ ...fld, width: 66 }} value={inp.frecuenciaMensual} onChange={set('frecuenciaMensual')} inputMode="decimal" /></label>
          <label style={lbl}><span>Meses que permanece (retención)</span><input style={{ ...fld, width: 66 }} value={inp.retencionMeses} onChange={set('retencionMeses')} inputMode="decimal" /></label>
          <p style={{ margin: '6px 0 0', fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            Ej.: si compra cada 2 meses, frecuencia = 0,5. Con 1 y 1 el LTV equivale al margen de una sola orden.
          </p>
        </section>
      </div>

      {/* ===== 2. DIAGNÓSTICO ===== */}
      <div style={secTitle}>2. Diagnóstico</div>
      <div style={{ background: BN.bg, border: `1px solid ${BN.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 13, height: 13, borderRadius: '50%', background: BN.color, flex: 'none' }} />
              <div style={{ fontSize: 18, fontWeight: 800, color: BN.color }}>{BN.title}</div>
            </div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 7, lineHeight: 1.5, paddingLeft: 24 }}>{BN.sub}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)' }}>ROAS actual</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)' }}>{fm.r2n(m.roasActual)}</div>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <div
            style={{ position: 'relative', cursor: 'crosshair' }}
            onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setBarHover(clamp((e.clientX - r.left) / r.width, 0, 1)); }}
            onMouseLeave={() => setBarHover(null)}
          >
            <div style={{ position: 'relative', height: 13, borderRadius: 8, overflow: 'hidden', display: 'flex', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.06)' }}>
              <div style={{ width: `${beRel}%`, background: '#f08b88' }} />
              <div style={{ width: `${Math.max(0, objRel - beRel)}%`, background: '#f7ca73' }} />
              <div style={{ width: `${Math.max(0, 100 - objRel)}%`, background: '#6fcaa6' }} />
            </div>
            <div style={{ position: 'absolute', left: `${actRel}%`, top: -3, transform: 'translateX(-50%)' }}>
              <div style={{ width: 3, height: 19, background: 'var(--text)', borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
            </div>
            {barTip && (
              <div style={{ position: 'absolute', left: `${barTip.left}%`, top: -40, transform: 'translateX(-50%)', background: '#fff', border: '1px solid var(--line)', borderRadius: 7, boxShadow: '0 4px 12px rgba(20,30,50,.14)', padding: '4px 10px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5, fontSize: 11, fontWeight: 700 }}>
                <span style={{ color: 'var(--muted)' }}>ROAS </span><span>{barTip.roas}</span> · <span style={{ color: barTip.c }}>{barTip.n}</span>
              </div>
            )}
          </div>
          <div style={{ position: 'relative', height: 32, marginTop: 6, fontSize: 11, fontWeight: 600 }}>
            <div style={{ position: 'absolute', left: `${beRel}%`, transform: 'translateX(-50%)', textAlign: 'center' }}>
              <div style={{ color: '#d98c1a' }}>Break even</div><div style={{ color: 'var(--muted)' }}>{fm.r2n(m.roasBreakEven)}</div>
            </div>
            <div style={{ position: 'absolute', left: `${objRel}%`, transform: 'translateX(-50%)', textAlign: 'center' }}>
              <div style={{ color: '#1f9d6b' }}>Objetivo</div><div style={{ color: 'var(--muted)' }}>{fm.r2n(m.roasObjetivo)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ROAS / CPA actual — justo debajo del diagnóstico, antes de las métricas */}
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div style={{ background: '#fffaf0', border: '1px solid #f3e2c2', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#e0941f' }}>{fm.r2(m.roasActual)}</div>
          <div><div style={{ fontSize: 13, fontWeight: 700 }}>ROAS actual</div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Ingresos / Gasto en ads</div></div>
        </div>
        <div style={{ background: '#f0fbf9', border: '1px solid #c6ebe5', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f9b8e' }}>{m.cpaActual == null ? '—' : fm.money(m.cpaActual)}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>CPA actual</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {m.cpaActual == null ? 'Sin órdenes registradas'
                : m.cpaActual > m.cpaObjetivo ? `Por encima del objetivo (${fm.money(m.cpaObjetivo)})`
                : `Dentro del objetivo (${fm.money(m.cpaObjetivo)})`}
            </div>
          </div>
        </div>
      </div>

      {/* Métricas clave */}
      <div style={{ ...secTitle, fontSize: 10.5 }}>Métricas clave</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 11, marginBottom: 14 }}>
        <Metric label="Margen" value={m.margenInvalido ? '—' : fm.pct(m.margenPct, 2)} sub={`${fm.money(m.margenAbs)}/orden`} color="#22a06b" />
        <Metric label="CAC máximo" value={fm.money(m.cacMaximo)} sub="máx por cliente" />
        <Metric label="ROAS break-even" value={fm.r2n(m.roasBreakEven)} sub="cubre costo variable" />
        <Metric label="ROAS objetivo" value={fm.r2n(m.roasObjetivo)} sub="cubre ads + estructura" color="#e0941f" />
        <Metric label="Ventas necesarias" value={fm.money(m.ventasNec)} sub={`${fm.i0(m.ordenesNec)} órdenes/mes`} />
        <Metric label="CPA objetivo" value={fm.money(m.cpaObjetivo)} sub="costo máx adquisición" />
      </div>

      {/* Cliente y adquisición (LTV / CAC real / MER) */}
      {/* N2-C: si el proyecto tiene vertical, se usan sus bandas calibradas; si no, las genéricas (sin cambios). */}
      {(() => {
        const ltvCac = ltvCacBandFor(vertical, m.ratioLtvCac) || ltvCacBand(m.ratioLtvCac);
        const payback = paybackBandFor(vertical, m.paybackMeses) || paybackBand(m.paybackMeses);
        const mer = merBandFor(vertical, m.mer) || merBand(m.mer);
        const vb = getVerticalBenchmarks(vertical);
        return (
          <>
            <div style={{ ...secTitle, fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 8 }}>
              Cliente y adquisición
              {vb && <span className="tag" style={{ textTransform: 'none', fontWeight: 600 }}>Benchmarks: {vb.label}</span>}
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 11, marginBottom: 8 }}>
              <Metric label="LTV" value={fm.money(m.ltv)} sub={`valor de vida (${fm.money(m.ltvBruto)} bruto)`} color="#22a06b" />
              <Metric label="CAC real (blended)" value={fm.money(m.cacReal)} sub="(ads + fijos) / clientes nuevos" />
              <Metric
                label="Ratio LTV/CAC"
                value={isFinite(m.ratioLtvCac) ? m.ratioLtvCac.toFixed(2).replace('.', ',') : '∞'}
                sub={ltvCac.label}
                color={TONES[ltvCac.tone].color}
              />
              <Metric
                label="Payback"
                value={isFinite(m.paybackMeses) ? `${m.paybackMeses.toFixed(1).replace('.', ',')} meses` : '∞'}
                sub={payback.label}
                color={TONES[payback.tone].color}
              />
              <Metric
                label="MER"
                value={isFinite(m.mer) ? `${m.mer.toFixed(2).replace('.', ',')}×` : '∞'}
                sub={`${mer.label} · ingresos / gasto total mkt`}
                color={TONES[mer.tone].color}
              />
            </div>
            {vb && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 28px' }}>ℹ️ {vb.note}</p>}
            {!vb && <div style={{ marginBottom: 28 }} />}
          </>
        );
      })()}

      {/* ===== 3. RECOMENDACIONES ===== */}
      <div style={secTitle}>3. Recomendaciones</div>
      <div style={{ ...card, marginBottom: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recos.map((r, idx) => {
            const tone = TONES[r.tone] || TONES.info;
            return (
              <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 10, padding: '11px 13px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone.color, marginTop: 5, flex: 'none' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: tone.color }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, marginTop: 2 }}>{r.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== 4. SIMULADOR ===== */}
      <div style={secTitle}>4. Simulador de escenarios</div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 14, padding: 4, background: '#eceef1', borderRadius: 11 }}>
        <button type="button" onClick={() => setTab('budget')} style={segBtn(tab === 'budget')}>Presupuesto</button>
        <button type="button" onClick={() => setTab('price')} style={segBtn(tab === 'price')}>Precio</button>
        <button type="button" onClick={() => setTab('cvr')} style={segBtn(tab === 'cvr')}>CVR</button>
      </div>

      <div className="grid cols-2">
        {/* Controles del escenario */}
        <div style={{ ...card, padding: '18px 19px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--indigo)' }} />
            Escenario: {tab === 'budget' ? 'Presupuesto' : tab === 'price' ? 'Precio' : 'CVR'}
          </div>

          {tab === 'budget' && (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Presupuesto mensual en ads</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--indigo)' }}>{fm.money(simAds)}</span>
              </div>
              <input type="range" min="0.1" max="3" step="0.02" value={adsMult} onChange={(e) => setAdsMult(parseFloat(e.target.value))} style={{ width: '100%' }} />
              <div className="row" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--muted)' }}><span>{fm.money(i.ads * 0.1)}</span><span>{fm.money(i.ads * 3)}</span></div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>{`${(adsMult - 1) * 100 >= 0 ? '+' : ''}${((adsMult - 1) * 100).toFixed(0)}% vs actual (${fm.money(i.ads)})`}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                {tile('ROAS requerido', fm.r2(sb.roasReq), 'var(--indigo)')}
                {tile('Ventas necesarias', fm.money(sb.ventasNec))}
                {tile('Órdenes necesarias', fm.i0(sb.ordenesNec))}
                {tile('CPA objetivo', fm.money(sb.cpaObj))}
              </div>
            </>
          )}

          {tab === 'price' && (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Precio de venta</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--indigo)' }}>{fm.money(simPrecio)}</span>
              </div>
              <input type="range" min="0.5" max="1.6" step="0.01" value={precioMult} onChange={(e) => setPrecioMult(parseFloat(e.target.value))} style={{ width: '100%' }} />
              <div className="row" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--muted)' }}><span>{fm.money(i.precio * 0.5)}</span><span>{fm.money(i.precio * 1.6)}</span></div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>{`${(precioMult - 1) * 100 >= 0 ? '+' : ''}${((precioMult - 1) * 100).toFixed(0)}% vs actual (${fm.money(i.precio)})`}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                {tile('Margen contribución', sp.margenAbs > 0 ? fm.pct(sp.margenPct) : '—', '#22a06b')}
                {tile('ROAS break-even', fm.r2(sp.roasBreakEven))}
                {tile('CAC máximo', fm.money(sp.cacMaximo))}
                {tile('ROAS objetivo', fm.r2(sp.roasObjetivo), '#e0941f')}
              </div>
            </>
          )}

          {tab === 'cvr' && (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Conversión (CVR)</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--indigo)' }}>{(cvr * 100).toFixed(1).replace('.', ',')}%</span>
              </div>
              <input type="range" min="1" max="50" step="1" value={cvrSlider} onChange={(e) => setCvrSlider(parseFloat(e.target.value))} style={{ width: '100%' }} />
              <div className="row" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--muted)' }}><span>0,1%</span><span>5,0%</span></div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>CPC {fm.money(i.cpc)} · CVR objetivo</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                {tile('CPA estimado', fm.money(sc.cpa), 'var(--indigo)')}
                {tile('CAC máximo', fm.money(m.cacMaximo))}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: sc.rentable ? '#1f9d6b' : '#ef5350' }}>
                {sc.rentable ? '✓ Rentable: el CPA queda por debajo de tu CAC máximo' : '✗ Caro: el CPA supera tu CAC máximo'}
              </div>
            </>
          )}
        </div>

        {/* Curvas */}
        <div style={{ ...card, padding: '18px 19px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--indigo)' }} />
            Curvas de escenario
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, margin: '8px 0 2px' }}>Presupuesto → ROAS requerido</div>
          <Curve
            fn={(x) => (m.margenPct > 0 && x > 0) ? (x + i.fijos) / (x * m.margenPct) : 0}
            xd={[i.ads > 0 ? i.ads * 0.1 : 200000, i.ads > 0 ? i.ads * 3 : 6000000]}
            yd={[0, Math.max(Math.min((m.margenPct > 0 ? ((i.ads > 0 ? i.ads * 0.1 : 200000) + i.fijos) / ((i.ads > 0 ? i.ads * 0.1 : 200000) * m.margenPct) : 0), 12), (isFinite(m.roasObjetivo) ? m.roasObjetivo : 0) * 1.15, (isFinite(m.roasActual) ? m.roasActual : 0) * 1.15, 4)]}
            refVal={m.roasActual} refLabel="ROAS actual"
            xLab={(v) => (v / 1e6 >= 1 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`)}
            yLab={(v) => v.toFixed(0)}
            hover
            tipLines={(xv, yv) => [
              { text: `Presupuesto: ${fm.money(xv)}` },
              { text: `ROAS req.: ${fm.r2(yv)}`, color: 'var(--indigo)' },
            ]}
          />

          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, margin: '14px 0 2px' }}>CVR → CPA (línea roja = CAC máximo)</div>
          <Curve
            fn={(c) => (c > 0 ? i.cpc / c : 0)}
            xd={[0.007, 0.08]}
            yd={[0, Math.max(i.cpc / 0.007, isFinite(m.cacMaximo) ? m.cacMaximo * 1.1 : 0, 1)]}
            refVal={m.cacMaximo} refLabel="CAC máx" refColor="#ef5350"
            stroke="#0f9b8e" area
            xLab={(v) => `${(v * 100).toFixed(1)}%`}
            yLab={(v) => fm.compact(v)}
            hover
            tipLines={(xv, yv) => {
              const ok = yv <= m.cacMaximo;
              return [
                { text: `CVR: ${(xv * 100).toFixed(1).replace('.', ',')}%` },
                { text: `CPA: ${fm.money(yv)}`, color: '#0f9b8e' },
                { text: ok ? '✓ Rentable' : '✗ Caro', color: ok ? '#1f9d6b' : '#ef5350' },
              ];
            }}
          />
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '20px 2px 0', lineHeight: 1.5 }}>
        Cálculo 100% en tu navegador — nada se envía al servidor. Devoluciones modeladas como producto recuperable
        (se pierde envío + comisión). Benchmarks documentados en el motor de cálculo.
      </p>
    </div>
  );
}

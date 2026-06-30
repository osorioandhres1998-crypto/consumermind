import Link from 'next/link';

export default function ComingSoon() {
  return (
    <div className="empty" style={{ maxWidth: 560, margin: '40px auto' }}>
      <div className="big">🚧</div>
      <h2 style={{ margin: '0 0 8px' }}>Herramienta en desarrollo</h2>
      <p style={{ color: 'var(--muted)' }}>
        <b>Landing Analyzer</b> y la <b>Calculadora de Rentabilidad</b> son las próximas
        herramientas del master-tool. Estarán disponibles en una siguiente iteración.
      </p>
      <div style={{ marginTop: 16 }}>
        <Link href="/dashboard" className="btn">Volver a mis proyectos</Link>
      </div>
    </div>
  );
}

import Link from 'next/link';

export default function Home() {
  return (
    <div>
      <div className="page-head">
        <h1>ConsumerMind</h1>
        <p>Un único motor psicológico alimenta todos los módulos. La psicología se produce una vez y viaja entre Strategy y Copy Studio.</p>
      </div>

      <div className="grid cols-2">
        <Link href="/strategy" className="card">
          <span className="tag">Paso 1</span>
          <h3 style={{ margin: '10px 0 4px' }}>🎯 Strategy</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Describe un producto y un cliente. El motor detecta y rankea los sesgos
            cognitivos que más se activarán, con su intensidad y una táctica concreta.
          </p>
        </Link>
        <Link href="/copy-studio" className="card">
          <span className="tag">Paso 2</span>
          <h3 style={{ margin: '10px 0 4px' }}>✍️ Copy Studio</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            Toma un análisis de Strategy y genera copy o ángulos creativos que activan
            exactamente esos sesgos. Sin recalcular la psicología.
          </p>
        </Link>
      </div>

      <div className="banner" style={{ marginTop: 22 }}>
        🧠 La inferencia corre en el backend (Claude API). La <code>ANTHROPIC_API_KEY</code> vive
        solo en el servidor; el navegador habla únicamente con <code>/api/...</code>.
      </div>
    </div>
  );
}

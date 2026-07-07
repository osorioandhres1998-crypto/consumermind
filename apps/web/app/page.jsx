import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '../auth';

/**
 * LANDING PÚBLICA del master-tool (Bloque 3.1 de DEUDA-TECNICA.md).
 * Aplica el propio framework del Landing Analyzer (hero → problema →
 * solución → beneficios → herramientas → cómo funciona → FAQs → CTA final)
 * y sus reglas éticas: sin testimonios inventados ni urgencia falsa —
 * nuestra propia auditoría la marcaría en rojo.
 */

const TOOLS = [
  { icon: '🧪', name: 'MVP Validator', desc: 'Simula miles de escenarios de mercado (Monte Carlo) y predice la aceptación de tu producto antes de invertir un peso en pauta.' },
  { icon: '🎯', name: 'Strategy', desc: 'Detecta los sesgos psicológicos que más activarán a TU cliente frente a TU producto, con tácticas concretas para cada uno.' },
  { icon: '✍️', name: 'Copy Studio', desc: 'Genera headlines, CTAs y ángulos creativos anclados a esos sesgos — no copy genérico.' },
  { icon: '📊', name: 'Landing Analyzer', desc: 'Audita tu landing contra 41 estándares de conversión + velocidad real de Google + semáforo ético de dark patterns (GDPR/DMA).' },
  { icon: '💰', name: 'Calculadora de Rentabilidad', desc: 'ROAS break-even, CAC máximo, LTV, MER y payback — con importación directa de tus CSV de Meta y Google Ads.' },
];

const STEPS = [
  { n: '1', title: 'Describe tu producto una vez', desc: 'Creas un proyecto con producto, cliente y precio. Todas las herramientas lo reutilizan.' },
  { n: '2', title: 'Valida, entiende y construye', desc: 'Simula la aceptación, descubre la psicología de tu cliente, genera el copy y audita tu landing.' },
  { n: '3', title: 'Mide y decide con datos', desc: 'Importa tus métricas reales, registra experimentos A/B y pregúntale al copiloto IA qué hacer.' },
];

const FAQS = [
  { q: '¿Necesito conocimientos técnicos?', a: 'No. Describes tu producto en lenguaje normal y las herramientas hacen el trabajo: simulaciones, análisis psicológico, auditorías y cálculos financieros.' },
  { q: '¿Cómo predice la aceptación de un producto que aún no existe?', a: 'Con simulación Monte Carlo: genera arquetipos de tu público objetivo y corre miles de iteraciones de su reacción. Es una estimación estadística con intervalos de confianza — no una promesa, y así se presenta.' },
  { q: '¿Mis datos de campañas están seguros?', a: 'Los CSV de Meta/Google Ads se procesan en tu navegador: el archivo nunca se sube al servidor, solo el agregado mensual si decides guardarlo. Cada workspace está aislado a nivel de base de datos.' },
  { q: '¿El análisis de landing usa IA?', a: 'No — usa un motor determinista de reglas documentadas (basado en investigación de CRO), más los Core Web Vitals reales de Google. El mismo escaneo da siempre el mismo resultado, con la evidencia de cada hallazgo.' },
  { q: '¿Puedo trabajar con mi equipo o mis clientes?', a: 'Sí: invitaciones con roles (editor / solo lectura) y los informes PDF pueden llevar tu propia marca (marca blanca) si eres agencia.' },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  return (
    <div>
      {/* ===== HERO ===== */}
      <section style={{ textAlign: 'center', padding: '48px 0 36px' }}>
        <span className="tag" style={{ marginBottom: 16 }}>Para equipos de marketing B2B y agencias</span>
        <h1 style={{ fontSize: 40, margin: '16px 0 12px', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
          Valida tu producto antes de<br />quemar presupuesto en ads
        </h1>
        <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 560, margin: '0 auto 26px', lineHeight: 1.6 }}>
          Cinco herramientas conectadas — simulación de mercado, psicología del consumidor,
          copy, auditoría de landing y rentabilidad — sobre un solo proyecto.
        </p>
        <Link href="/register" className="btn" style={{ fontSize: 16, padding: '13px 26px' }}>
          Crear cuenta gratis
        </Link>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>
          Sin tarjeta de crédito · Incluye un proyecto de ejemplo para explorar
        </p>
      </section>

      {/* ===== PROBLEMA ===== */}
      <section className="card" style={{ margin: '18px 0', padding: 24 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>¿Te suena?</h2>
        <p style={{ color: 'var(--muted)', margin: 0, lineHeight: 1.7 }}>
          Lanzas la campaña, el presupuesto se va, y no sabes si el problema fue el producto,
          el mensaje, la landing o el precio. Las hojas de cálculo mezclan métricas por orden
          con métricas mensuales, el copy sale de la intuición y "escalar" es apostar.
        </p>
      </section>

      {/* ===== SOLUCIÓN + HERRAMIENTAS ===== */}
      <section style={{ margin: '32px 0' }}>
        <h2 style={{ fontSize: 22, margin: '0 0 4px' }}>Un sistema de decisión, no otra calculadora</h2>
        <p style={{ color: 'var(--muted)', margin: '0 0 18px' }}>
          Cada herramienta responde una pregunta concreta del ciclo — y todas comparten los datos del mismo proyecto.
        </p>
        <div className="grid cols-2">
          {TOOLS.map((t) => (
            <div className="card" key={t.name}>
              <h3 style={{ margin: '0 0 6px' }}>{t.icon} {t.name}</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{t.desc}</p>
            </div>
          ))}
          <div className="card" style={{ background: 'var(--indigo-50)', border: '1px solid #c7d2fe' }}>
            <h3 style={{ margin: '0 0 6px' }}>🤖 Copiloto IA</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
              Pregúntale "¿debería escalar el presupuesto?" y responde con TUS números —
              cita las cifras exactas de tu proyecto y te dice qué dato falta si no puede responder.
            </p>
          </div>
        </div>
      </section>

      {/* ===== CÓMO FUNCIONA ===== */}
      <section style={{ margin: '32px 0' }}>
        <h2 style={{ fontSize: 22, margin: '0 0 18px' }}>Cómo funciona</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {STEPS.map((s) => (
            <div className="card" key={s.n}>
              <span className="tag">{s.n}</span>
              <h3 style={{ margin: '10px 0 4px', fontSize: 15.5 }}>{s.title}</h3>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== TRANSPARENCIA (autoridad honesta, sin humo) ===== */}
      <section className="card" style={{ margin: '32px 0', padding: 24 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Construido con estándares, no con humo</h2>
        <ul style={{ color: 'var(--muted)', lineHeight: 1.9, margin: 0, paddingLeft: 20, fontSize: 14.5 }}>
          <li>Cada regla del auditor de landings cita su fuente y su impacto documentado en conversión.</li>
          <li>Los cálculos financieros pasan casos de prueba anclados en cada actualización (integración continua).</li>
          <li>El semáforo ético detecta dark patterns con riesgo regulatorio — y también nos lo aplicamos: en esta página no hay contadores inventados ni urgencia falsa.</li>
        </ul>
      </section>

      {/* ===== FAQS ===== */}
      <section style={{ margin: '32px 0' }}>
        <h2 style={{ fontSize: 22, margin: '0 0 14px' }}>Preguntas frecuentes</h2>
        {FAQS.map((f) => (
          <details key={f.q} className="card" style={{ marginBottom: 8, cursor: 'pointer' }}>
            <summary style={{ fontWeight: 600, fontSize: 14.5 }}>{f.q}</summary>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '10px 0 0', lineHeight: 1.6 }}>{f.a}</p>
          </details>
        ))}
      </section>

      {/* ===== CTA FINAL ===== */}
      <section style={{ textAlign: 'center', padding: '28px 0 44px' }}>
        <h2 style={{ fontSize: 24, margin: '0 0 8px' }}>Tu próximo lanzamiento, con datos desde el día uno</h2>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>Crea tu cuenta y explora el proyecto de ejemplo en menos de un minuto.</p>
        <Link href="/register" className="btn" style={{ fontSize: 16, padding: '13px 26px' }}>Crear cuenta gratis</Link>
        <span style={{ margin: '0 12px', color: 'var(--muted)' }}>o</span>
        <Link href="/login" className="btn ghost">Ya tengo cuenta</Link>
      </section>
    </div>
  );
}

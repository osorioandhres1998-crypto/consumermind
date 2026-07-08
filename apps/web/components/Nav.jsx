import Link from 'next/link';
import { auth, signOut } from '../auth';

export default async function Nav() {
  const session = await auth();

  return (
    <nav className="nav">
      <Link href={session?.user ? '/dashboard' : '/'} style={{ all: 'unset', cursor: 'pointer' }}>
        <span className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="logo">M</span>
          <b>Master Tool</b>
        </span>
      </Link>
      {session?.user && (
        <>
          <Link href="/dashboard">Herramientas</Link>
          <Link href="/projects">Proyectos</Link>
          <Link href="/team">Equipo</Link>
        </>
      )}
      <span className="spacer" />
      {session?.user ? (
        <>
          <span className="plan">{session.user.email} · {session.user.role}</span>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button className="btn ghost sm" type="submit">Salir</button>
          </form>
        </>
      ) : (
        <Link href="/login" className="active">Entrar</Link>
      )}
    </nav>
  );
}

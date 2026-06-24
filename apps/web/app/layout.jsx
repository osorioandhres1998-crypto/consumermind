import './styles.css';
import Nav from '../components/Nav';

export const metadata = {
  title: 'ConsumerMind — Inteligencia persuasiva',
  description: 'Motor psicológico compartido: Strategy + Copy Studio.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Nav />
        <div className="container">{children}</div>
      </body>
    </html>
  );
}

'use client';

/**
 * Botones de exportación accionable del copy (Bloque 3.4): copian al
 * portapapeles el texto formateado para cada plataforma, con los límites
 * de caracteres anotados. Se usa en ambos Copy Studio (standalone y proyecto).
 */

import { useState } from 'react';
import { buildMetaExport, buildGoogleRsaExport, buildEmailExport } from '../lib/copy-export';

export default function CopyExportButtons({ result }) {
  const [copied, setCopied] = useState('');

  const copy = (key, text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const mode = result?.mode || (result?.result?.angles ? 'angles' : 'copy');
  if (mode === 'angles') return null; // los ángulos no se pegan en plataformas de ads

  const emailText = buildEmailExport(result);

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn ghost sm" onClick={() => copy('meta', buildMetaExport(result))}>
        {copied === 'meta' ? '✓ Copiado' : '📋 Meta Ads'}
      </button>
      <button className="btn ghost sm" onClick={() => copy('google', buildGoogleRsaExport(result))}>
        {copied === 'google' ? '✓ Copiado' : '📋 Google RSA'}
      </button>
      {emailText && (
        <button className="btn ghost sm" onClick={() => copy('email', emailText)}>
          {copied === 'email' ? '✓ Copiado' : '📋 Asuntos email'}
        </button>
      )}
    </div>
  );
}

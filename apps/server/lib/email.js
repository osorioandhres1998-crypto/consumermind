/**
 * ENVÍO DE EMAIL — vía Resend (REST directo, sin SDK/dependencia nueva)
 * ------------------------------------------------------------
 * Degradación elegante (mismo patrón que Validator con Claude/heurístico):
 * si RESEND_API_KEY no está configurada, el email NO se envía pero la
 * función no falla — el link queda registrado en los logs del servidor
 * (Railway) para que puedas dárselo manualmente al usuario mientras tanto.
 */

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * @returns {{ sent: boolean }} sent=false cuando no hay API key (degradado a logs).
 */
async function sendEmail({ to, subject, html, textFallbackLog }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY no configurada. ${textFallbackLog || `Destinado a ${to}: ${subject}`}`);
    return { sent: false };
  }

  const from = process.env.RESEND_FROM || 'Master Tool <onboarding@resend.dev>';
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend respondió ${res.status}: ${body.slice(0, 300)}`);
      console.log(`[email] Fallback log — ${textFallbackLog || `${to}: ${subject}`}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] Error de red al enviar:', err.message);
    console.log(`[email] Fallback log — ${textFallbackLog || `${to}: ${subject}`}`);
    return { sent: false };
  }
}

module.exports = { sendEmail };

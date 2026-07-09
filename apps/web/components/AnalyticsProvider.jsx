'use client';

/**
 * Inicializa PostHog una vez y captura un pageview en cada cambio de ruta
 * (App Router no dispara navegación tradicional). Montado en el layout.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, trackPageview, identify } from '../lib/analytics';

export default function AnalyticsProvider({ userId = null, role = null }) {
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
    if (userId) identify(userId, { role });
  }, [userId, role]);

  useEffect(() => { if (pathname) trackPageview(pathname); }, [pathname]);

  return null;
}

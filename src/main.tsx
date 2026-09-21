import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { registerSW } from 'virtual:pwa-register';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/routes';
import { iniciarMotorSincronizacion } from '@/lib/offline-queue';
import { reanudarConsolidacionesPendientes } from '@/lib/consolidar-cierre-pendiente';
import { supabase } from '@/lib/supabase-client';
import '@/styles/tokens.css';
import '@/styles/components.css';
import '@/styles/splash.css';

// `registerType: 'autoUpdate'` (vite.config.ts) recarga solo en cuanto
// detecta un Service Worker nuevo — pero el navegador solo comprueba si hay
// build nuevo en momentos concretos (navegación, o cada ~24h de fondo), muy
// espaciado para alguien probando un despliegue recién hecho. Sin esto, un
// comercial (o quien esté verificando un cambio) podía seguir viendo la
// versión vieja de la app en una pestaña ya abierta un buen rato después de
// desplegar, sin ninguna pista de que hubiera una nueva. Se fuerza la
// comprobación cada 60s y al volver a la pestaña.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => void registration.update(), 60_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update();
    });
  },
});

// Sin esto, un fallo real en el móvil de un comercial era invisible salvo
// que alguien mirase la consola del navegador en el instante exacto en
// que ocurría (auditoría del 24/8, punto 5 — observabilidad). Se
// inicializa lo primero de todo, antes que cualquier otra cosa, para
// capturar hasta los fallos más tempranos del arranque. Si no hay DSN
// configurado (por ejemplo, en local sin la variable puesta), Sentry se
// queda simplemente inactivo — no rompe nada.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Datos comerciales cambian con visitas puntuales, no en tiempo real:
      // 60s de staleTime evita refetch agresivo en conexión móvil inestable.
      staleTime: 60_000,
      retry: 2,
    },
  },
});

// Arranca la cola offline al abrir la app — reintenta lo pendiente de una
// sesión anterior en cuanto detecta red, sin esperar a que el comercial
// abra Visita activa (09_arquitectura_tecnica.md §4).
iniciarMotorSincronizacion();
reanudarConsolidacionesPendientes();

// SOLO DESARROLLO — no hay pantalla de login construida todavía (no forma
// parte de las 11 pantallas del flujo crítico). Expone el cliente Supabase
// en window para poder autenticar manualmente desde la consola del
// navegador mientras se valida contra el entorno real. Eliminar o proteger
// tras construir la pantalla de login real.
if (import.meta.env.DEV) {
  (window as unknown as { __supabase: typeof supabase }).__supabase = supabase;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <p>Algo ha fallado. Recarga la página — si sigue pasando, avisa a Dirección Comercial.</p>
        </div>
      }
    >
      <QueryClientProvider client={queryClient}>
        {/* Flags de React Router v7 adoptados ya (son su comportamiento por
            defecto en v7): `v7_startTransition` envuelve el cambio de ruta en
            startTransition (navegación no urgente, mejor con Suspense);
            `v7_relativeSplatPath` cambia la resolución de rutas relativas
            dentro de rutas comodín — esta app no tiene ninguna, así que solo
            calla el aviso. Adoptarlos ahora achica el salto futuro a v7. */}
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

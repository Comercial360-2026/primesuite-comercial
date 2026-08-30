import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/routes';
import { iniciarMotorSincronizacion } from '@/lib/offline-queue';
import { supabase } from '@/lib/supabase-client';
import '@/styles/tokens.css';
import '@/styles/components.css';

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
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';

// Pantalla mínima de autenticación — pieza que faltaba desde el inicio del
// proyecto (ver nota histórica en main.tsx: "SOLO DESARROLLO — no hay
// pantalla de login construida todavía"). Sin esto, `useSesionActual()`
// nunca resuelve `comercial`, y cualquier pantalla que dependa de él
// (Alta rápida cliente, Ficha cliente, Repaso cliente, Visita activa)
// falla de forma silenciosa o inconsistente según el estado de sesión
// heredado del navegador.
export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const acceso = useAccionAsync();

  const destino = (location.state as { desde?: string } | null)?.desde ?? '/';

  async function iniciarSesion() {
    if (!email.trim() || !password) return;

    // Sin conexión, ni siquiera lo intenta contra el servidor — un intento
    // fallido por falta de red no debe mostrarse igual que una contraseña
    // incorrecta, o el comercial pierde tiempo revisando algo que está bien.
    if (!navigator.onLine) {
      acceso.establecerError('Sin conexión. Conéctate a internet para iniciar sesión.');
      return;
    }

    await acceso.ejecutar(
      async () => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },
      {
        onExito: () => navigate(destino, { replace: true }),
        mensajeError: (err) => {
          // "Failed to fetch" y variantes son el propio navegador
          // informando de que la petición nunca llegó a salir — red caída
          // a mitad del intento, no una credencial rechazada por el servidor.
          const mensaje = err instanceof Error ? err.message : '';
          if (/failed to fetch|network|Load failed/i.test(mensaje)) {
            return 'Sin conexión. Conéctate a internet para iniciar sesión.';
          }
          return 'Correo o contraseña incorrectos.';
        },
      }
    );
  }

  return (
    <div className="screen" style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>PrimeSuite</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>inicia sesión para continuar</div>
      </div>

      <div className="label" style={{ marginTop: 0 }}>correo</div>
      <input
        className={`field${acceso.error ? ' field--error' : ''}`}
        type="email"
        autoFocus
        autoCapitalize="none"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="nombre@primion.com"
      />

      <div className="label">contraseña</div>
      <input
        className={`field${acceso.error ? ' field--error' : ''}`}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void iniciarSesion();
        }}
        placeholder="••••••••"
      />
      {acceso.error && <div className="field-error-text">{acceso.error}</div>}

      <button
        className="btn btn-primary"
        style={{ marginTop: 'var(--space-3)' }}
        disabled={!email.trim() || !password || acceso.cargando}
        onClick={iniciarSesion}
      >
        {acceso.cargando ? 'entrando…' : 'entrar'}
      </button>
    </div>
  );
}

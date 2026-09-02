import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { Aviso } from '@/components/ui/aviso';

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
          // No nos fiamos de navigator.onLine (poco fiable en Safari de
          // iPhone: puede decir "sí hay red" en pleno modo avión) ni del
          // texto del error (cambia entre navegadores). En su lugar:
          // un error de Supabase con "status" es una respuesta real del
          // servidor (credenciales rechazadas de verdad). Sin "status",
          // la petición nunca llegó a salir — es un fallo de red, no de
          // credenciales.
          const tieneRespuestaDelServidor =
            !!err && typeof err === 'object' && 'status' in err && typeof (err as { status?: unknown }).status === 'number';
          if (!tieneRespuestaDelServidor) {
            return 'Sin conexión. Conéctate a internet para iniciar sesión.';
          }
          return 'Correo o contraseña incorrectos.';
        },
      }
    );
  }

  return (
    <div className="pantalla-suelta">
    <div className="screen" style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 500 }}>PrimeNotes</div>
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
      {acceso.error && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Aviso tipo="error">{acceso.error}</Aviso>
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: 'var(--space-3)' }}
        disabled={!email.trim() || !password || acceso.cargando}
        onClick={iniciarSesion}
      >
        {acceso.cargando ? 'Entrando…' : 'Entrar'}
      </button>
      <AvisoTardando visible={acceso.tardando} />
    </div>
    </div>
  );
}

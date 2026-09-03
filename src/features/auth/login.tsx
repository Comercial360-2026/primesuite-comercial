import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { solicitarAcceso } from '@/lib/gestionar-comercial';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { Aviso } from '@/components/ui/aviso';
import { LogoPrimeNotes } from '@/components/marca/marca';

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

  // "He perdido el acceso" — el comercial no puede entrar y avisa a
  // Dirección Comercial, que le reenvía el enlace. `enviado` fija el
  // mensaje final (siempre el mismo, exista o no el correo).
  const [recuperarAbierto, setRecuperarAbierto] = useState(false);
  const [emailRecuperar, setEmailRecuperar] = useState('');
  const [avisoEnviado, setAvisoEnviado] = useState(false);
  const recuperar = useAccionAsync();

  async function enviarAviso() {
    if (!emailRecuperar.trim().includes('@')) return;
    await recuperar.ejecutar(
      () => solicitarAcceso(emailRecuperar.trim()),
      {
        onExito: () => setAvisoEnviado(true),
        mensajeError: () => 'No se pudo enviar el aviso. Comprueba tu conexión e inténtalo de nuevo.',
      }
    );
  }

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
        <LogoPrimeNotes alto={34} />
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: 'var(--space-2)' }}>
          Inicia sesión para continuar
        </div>
      </div>

      <div className="label" style={{ marginTop: 0 }}>Correo</div>
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

      <div className="label">Contraseña</div>
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

      {avisoEnviado ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Aviso tipo="exito" titulo="Aviso enviado">
            Si el correo es de un comercial activo, tu responsable lo verá en la app y te reenviará el enlace de
            acceso. Vuelve a intentarlo cuando lo tengas.
          </Aviso>
        </div>
      ) : recuperarAbierto ? (
        <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--ink-100)', paddingTop: 'var(--space-3)' }}>
          <div className="label" style={{ marginTop: 0 }}>Tu correo</div>
          <input
            className="field"
            type="email"
            autoCapitalize="none"
            value={emailRecuperar}
            onChange={(e) => setEmailRecuperar(e.target.value)}
            placeholder="nombre@primion.com"
          />
          {recuperar.error && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <Aviso tipo="error">{recuperar.error}</Aviso>
            </div>
          )}
          <button
            className="btn btn-secondary"
            style={{ marginTop: 'var(--space-3)' }}
            disabled={!emailRecuperar.trim().includes('@') || recuperar.cargando}
            onClick={enviarAviso}
          >
            {recuperar.cargando ? 'Enviando…' : 'Avisar a mi responsable'}
          </button>
          <button
            type="button"
            className="btn-enlace"
            style={{ display: 'block', margin: 'var(--space-3) auto 0' }}
            onClick={() => {
              setRecuperarAbierto(false);
              recuperar.limpiarError();
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-enlace"
          style={{ display: 'block', margin: 'var(--space-4) auto 0' }}
          onClick={() => {
            setEmailRecuperar(email.trim());
            setRecuperarAbierto(true);
          }}
        >
          He perdido el acceso
        </button>
      )}
    </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { Aviso } from '@/components/ui/aviso';
import { LogoPrimeNotes } from '@/components/marca/marca';

// Fase 6a — el comercial llega aquí desde el enlace de un solo uso que le
// pasa Dirección Comercial (alta o "reenviar enlace"). El enlace es de
// tipo `recovery`: Supabase verifica el token y redirige a esta ruta con
// una sesión temporal en el hash; `detectSessionInUrl` la consume al
// cargar. Aquí el comercial elige su contraseña definitiva.
//
// Ruta FUERA de RequireSession (como /login): puede no haber `comercial`
// resuelto todavía, y un enlace caducado/usado llega sin sesión ninguna.

const MIN_LARGO = 8;

export function EstablecerContrasena() {
  const navigate = useNavigate();
  const guardado = useAccionAsync();

  // `undefined` = comprobando; `null` = sin sesión (enlace caducado o
  // abierto a mano); string = nombre del usuario (o '' si no hay nombre).
  const [nombre, setNombre] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [repite, setRepite] = useState('');

  useEffect(() => {
    let vivo = true;

    async function comprobar() {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      if (data.session) {
        setNombre((data.session.user.user_metadata?.nombre as string | undefined) ?? '');
      } else {
        setNombre((prev) => (prev === undefined ? null : prev));
      }
    }

    comprobar();
    // La sesión del enlace puede resolverse un instante después de montar.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (!vivo) return;
      if (sesion) setNombre((sesion.user.user_metadata?.nombre as string | undefined) ?? '');
    });

    // Red de seguridad: si tras un margen razonable sigue sin haber
    // sesión, es un enlace que ya no vale.
    const t = setTimeout(() => {
      if (vivo) setNombre((prev) => (prev === undefined ? null : prev));
    }, 4000);

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const cortas = password.length > 0 && password.length < MIN_LARGO;
  const noCoincide = repite.length > 0 && repite !== password;
  const puedeGuardar =
    password.length >= MIN_LARGO && repite === password && !guardado.cargando;

  async function guardar() {
    if (!puedeGuardar) return;
    await guardado.ejecutar(
      async () => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      },
      {
        onExito: () => navigate('/', { replace: true }),
        mensajeError: () =>
          'No se pudo guardar la contraseña. El enlace puede haber caducado — pide a tu responsable que te reenvíe uno.',
      }
    );
  }

  return (
    <div className="pantalla-suelta">
      <div className="screen" style={{ justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
          <LogoPrimeNotes alto={34} />
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: 'var(--space-2)' }}>
            Elige tu contraseña
          </div>
        </div>

        {nombre === undefined ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-400)', fontSize: 'var(--text-sm)' }}>
            Comprobando el enlace…
          </div>
        ) : nombre === null ? (
          <>
            <Aviso tipo="error" titulo="Este enlace ya no vale">
              Puede que haya caducado o que ya se haya usado. Pide a tu responsable que te reenvíe el enlace de
              acceso.
            </Aviso>
            <button className="btn btn-primary" style={{ marginTop: 'var(--space-3)' }} onClick={() => navigate('/login')}>
              Ir a iniciar sesión
            </button>
          </>
        ) : (
          <>
            <Aviso tipo="info" titulo={nombre ? `Bienvenido, ${nombre}` : 'Bienvenido'}>
              Crea una contraseña para entrar. La usarás a partir de ahora.
            </Aviso>

            <div className="label">Nueva contraseña</div>
            <input
              className={`field${cortas ? ' field--error' : ''}`}
              type="password"
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="al menos 8 caracteres"
            />

            <div className="label">Repite la contraseña</div>
            <input
              className={`field${noCoincide ? ' field--error' : ''}`}
              type="password"
              autoComplete="new-password"
              value={repite}
              onChange={(e) => setRepite(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void guardar();
              }}
              placeholder="••••••••"
            />
            {cortas && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--danger-600)', marginTop: 4 }}>
                Mínimo {MIN_LARGO} caracteres.
              </div>
            )}
            {noCoincide && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--danger-600)', marginTop: 4 }}>
                Las dos contraseñas no coinciden.
              </div>
            )}
            {guardado.error && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Aviso tipo="error">{guardado.error}</Aviso>
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-3)' }}
              disabled={!puedeGuardar}
              onClick={guardar}
            >
              {guardado.cargando ? 'Guardando…' : 'Guardar y entrar'}
            </button>
            <AvisoTardando visible={guardado.tardando} />
          </>
        )}
      </div>
    </div>
  );
}

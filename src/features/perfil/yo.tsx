import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { obtenerOperacionesConError } from '@/lib/offline-queue';
import { claveDuplicado } from '@/lib/nombres-cliente';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { CabeceraSeccion } from '@/components/ui/cabecera-seccion';
import { TarjetaAccion } from '@/components/ui/tarjeta-accion';

const LIMITE_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB, techo real del plan gratuito de Supabase
const DIAS_AVISO_BACKUP = 7;

// Tablas incluidas en la copia completa. Solo datos (filas), no los
// binarios de fotos/audios — esos ya tienen su propio backup por visita
// (ver mi-espacio.tsx / Fase B). Bajar todas las fotos de todos los
// clientes cada semana sería enorme y lento; esto es la red de seguridad
// para los DATOS, no para los archivos.
const TABLAS_BACKUP = [
  'cliente',
  'comercial',
  'visita',
  'visita_participante',
  'visita_interlocutor',
  'interlocutor',
  'hallazgo',
  'captura_libre',
  'oportunidad',
  'oportunidad_visita_seguimiento',
  'oportunidad_termino',
  'proximo_paso',
  'termino',
  'ubicacion',
] as const;

const ETIQUETA_ROL: Record<string, string> = {
  comercial: 'Comercial',
  direccion_comercial: 'Dirección comercial',
};

function formatearMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(0);
}

// Pantalla "Yo" — mismo sitio en el bottom nav para cualquier rol, siempre.
// El acceso a Vocabulario (antes ocupaba este mismo hueco del menú solo
// para direccion_comercial, quitándole a ese rol su propio acceso a "Yo" y
// por tanto al cierre de sesión) vive ahora dentro de esta pantalla, como
// una fila más — no compite por la posición fija del menú.
//
// Distribución (ver 08_sistema_diseno.md §"Sistema de filas"):
//   · cabecera de identidad (nombre + rol), sin sección
//   · aviso rojo "N sin sincronizar" si lo hay — destaca, no es una fila
//   · SeccionLista "Almacenamiento": Mi espacio + (dir. comercial) las
//     tarjetas de medidor de espacio y copia de seguridad, que llevan su
//     propio contenido rico y no encajan en una fila
//   · SeccionLista "Dirección comercial": accesos exclusivos de ese rol
//   · SeccionLista suelta: Cerrar sesión (fila roja, al final)
export function Yo() {
  const { comercial } = useSesionActual();
  const { cerrarVisita } = useVisitaActivaContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [errorExportacion, setErrorExportacion] = useState<string | null>(null);

  const esDireccionComercial = comercial?.rol === 'direccion_comercial';
  const etiquetaRol = comercial?.rol ? ETIQUETA_ROL[comercial.rol] ?? comercial.rol : '—';

  const { data: numSolicitudesPendientes } = useQuery({
    queryKey: ['num-solicitudes-reasignacion-pendientes'],
    enabled: esDireccionComercial,
    queryFn: async () => {
      const { count, error: err } = await supabase
        .from('solicitud_reasignacion')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente');
      if (err) throw err;
      return count ?? 0;
    },
  });

  // Nº de grupos de fichas de cliente duplicadas (mismo criterio de
  // agrupación que la pantalla de deduplicación). Sirve para el aviso en la
  // fila — que Dirección Comercial vea que hay algo que revisar sin tener
  // que entrar.
  const { data: numGruposDuplicados } = useQuery({
    queryKey: ['num-grupos-duplicados'],
    enabled: esDireccionComercial,
    queryFn: async () => {
      const { data, error: err } = await supabase.from('cliente').select('nombre, estado_fusion');
      if (err) throw err;
      const cuenta: Record<string, number> = {};
      for (const c of data ?? []) {
        if (c.estado_fusion !== 'activo') continue;
        const k = claveDuplicado(c.nombre);
        cuenta[k] = (cuenta[k] ?? 0) + 1;
      }
      return Object.values(cuenta).filter((n) => n >= 2).length;
    },
  });

  // Visible para cualquier comercial, no solo Dirección Comercial: es la
  // cola local de SU PROPIO dispositivo, no un dato compartido. Antes, un
  // fallo permanente (5 intentos agotados, o heredado de un padre que
  // falló) era invisible salvo mirando IndexedDB con herramientas de
  // desarrollador — ninguna pantalla lo mostraba nunca.
  const { data: operacionesConError, refetch: refetchErrores } = useQuery({
    queryKey: ['operaciones-con-error'],
    refetchOnMount: 'always',
    refetchInterval: 60_000,
    queryFn: obtenerOperacionesConError,
  });

  const ETIQUETA_ENTIDAD: Record<string, string> = {
    visita: 'visita',
    hallazgo: 'hallazgo',
    captura_libre: 'captura',
    oportunidad: 'oportunidad',
    proximo_paso: 'próximo paso',
    ubicacion: 'ubicación',
  };

  const { data: ultimoBackup } = useQuery({
    queryKey: ['ultimo-backup-completo'],
    enabled: esDireccionComercial,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('registro_backup_completo')
        .select('creado_en')
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (err) throw err;
      return data?.creado_en ?? null;
    },
  });

  const diasDesdeBackup = ultimoBackup
    ? Math.floor((Date.now() - new Date(ultimoBackup).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const backupPendiente = diasDesdeBackup === null || diasDesdeBackup >= DIAS_AVISO_BACKUP;

  async function hacerCopiaCompleta() {
    setExportando(true);
    setErrorExportacion(null);
    try {
      const resultado: Record<string, unknown> = {};
      for (const tabla of TABLAS_BACKUP) {
        const { data, error: err } = await supabase.from(tabla).select('*');
        // Si una tabla concreta falla (permiso, lo que sea), se anota el
        // fallo dentro del propio backup en vez de abortar todo el
        // proceso — mejor una copia con un hueco señalado que ninguna.
        resultado[tabla] = err ? { error: err.message } : data;
      }

      const fecha = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify({ generado_en: new Date().toISOString(), tablas: resultado }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `primesuite-backup-${fecha}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const { error: errLog } = await supabase
        .from('registro_backup_completo')
        .insert({ creado_por: comercial!.id });
      if (errLog) throw new Error(errLog.message);

      queryClient.invalidateQueries({ queryKey: ['ultimo-backup-completo'] });
    } catch (err) {
      setErrorExportacion(
        err instanceof Error ? `No se pudo completar la copia: ${err.message}` : 'No se pudo completar la copia.'
      );
    } finally {
      setExportando(false);
    }
  }

  // Aviso de espacio de Storage — solo visible para Dirección Comercial,
  // que es quien puede actuar (subir de plan, archivar, etc.). El plan
  // gratuito de Supabase da 1 GB fijo para siempre, no se renueva cada
  // mes — sin aviso previo, un comercial se encontraría un error al subir
  // una foto en mitad de una visita real, sin ningún margen de reacción.
  const { data: bytesUsados } = useQuery({
    queryKey: ['espacio-storage-usado'],
    enabled: esDireccionComercial,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error: err } = await supabase.rpc('fn_espacio_storage_usado');
      if (err) throw err;
      return data as number;
    },
  });

  const porcentajeUsado = bytesUsados != null ? (bytesUsados / LIMITE_STORAGE_BYTES) * 100 : null;
  const tonoEspacio =
    porcentajeUsado == null || porcentajeUsado < 70
      ? 'neutral'
      : porcentajeUsado < 90
        ? 'aviso'
        : 'riesgo';

  async function cerrarSesion() {
    setCerrando(true);
    setError(null);
    const { error: err } = await supabase.auth.signOut();
    setCerrando(false);
    if (err) {
      setError(err.message);
      return;
    }
    // El logout no recarga la página (navegación de React, no un F5 real),
    // así que el banner "visita en curso" — estado solo de memoria, ver
    // use-visita-activa-context.tsx — sobrevive al cierre de sesión si no
    // se limpia explícitamente aquí. Hueco real: mostraba la visita de la
    // sesión anterior como si perteneciera a la nueva sesión.
    cerrarVisita();
    navigate('/login', { replace: true });
  }

  const numErrores = operacionesConError?.length ?? 0;

  return (
    <div className="screen">
      <CabeceraSeccion titulo="Yo" icono="yo" />

      <div className="lista-agrupada">
        <div style={{ paddingInline: 'var(--fila-pad-x)' }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 500 }}>{comercial?.nombre ?? '—'}</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', marginTop: 2 }}>{etiquetaRol}</div>
        </div>

        {numErrores > 0 && (
          <div className="card card--riesgo">
            <div className="label" style={{ marginTop: 0, color: 'var(--risk-600)' }}>
              {numErrores} elemento{numErrores > 1 ? 's' : ''} sin sincronizar
            </div>
            <div style={{ fontSize: 'var(--text-sm)' }}>
              {Object.entries(
                operacionesConError!.reduce<Record<string, number>>((acc, op) => {
                  acc[op.entidad] = (acc[op.entidad] ?? 0) + 1;
                  return acc;
                }, {})
              )
                .map(([entidad, n]) => `${n} ${ETIQUETA_ENTIDAD[entidad] ?? entidad}${n > 1 ? '(s)' : ''}`)
                .join(', ')}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
              No se han podido guardar en el servidor. Comprueba tu conexión — el sistema lo sigue intentando solo.
            </div>
            <button
              className="btn btn-secondary"
              style={{ marginTop: 8, width: 'auto', padding: '0 16px' }}
              onClick={() => refetchErrores()}
            >
              Comprobar de nuevo
            </button>
          </div>
        )}

        <SeccionLista titulo="Almacenamiento">
          <FilaNavegable
            icono="almacenamiento"
            titulo="Mi espacio"
            subtitulo="Ver tu cuota y el tamaño de tus visitas"
            to="/mi-espacio"
          />
        </SeccionLista>

        {esDireccionComercial && bytesUsados != null && (
          <TarjetaAccion titulo="Espacio de almacenamiento" tono={tonoEspacio}>
            <div style={{ fontSize: 'var(--text-base)' }}>
              {formatearMB(bytesUsados)} MB de 1024 MB usados ({porcentajeUsado!.toFixed(0)}%)
            </div>
            {porcentajeUsado! >= 70 && (
              <div className="tarjeta-accion__estado">
                {porcentajeUsado! >= 90
                  ? 'Crítico — actúa pronto o los comerciales no podrán subir fotos ni audios.'
                  : 'Acercándose al límite del plan gratuito de Supabase.'}
              </div>
            )}
          </TarjetaAccion>
        )}

        {esDireccionComercial && (
          <TarjetaAccion
            titulo="Copia de seguridad completa"
            tono={backupPendiente ? 'aviso' : 'neutral'}
            accion={{
              etiqueta: 'Hacer copia completa ahora',
              icono: 'descargar',
              onClick: hacerCopiaCompleta,
              cargando: exportando,
              etiquetaCargando: 'Preparando copia…',
            }}
            error={errorExportacion ?? undefined}
          >
            <div>
              {diasDesdeBackup === null
                ? 'Todavía no has hecho ninguna copia completa.'
                : diasDesdeBackup === 0
                  ? 'Última copia: hoy.'
                  : `Última copia: hace ${diasDesdeBackup} día${diasDesdeBackup === 1 ? '' : 's'}.`}
            </div>
            {backupPendiente && (
              <div className="tarjeta-accion__estado">
                Supabase gratuito no hace copias automáticas — te recomendamos descargar una ahora.
              </div>
            )}
          </TarjetaAccion>
        )}

        {esDireccionComercial && (
          <SeccionLista titulo="Dirección comercial">
            <FilaNavegable
              icono="vocabulario"
              titulo="Gestionar vocabulario"
              subtitulo="Revisar propuestas y organizar el catálogo"
              to="/vocabulario"
            />
            <FilaNavegable
              icono="solicitudes"
              titulo="Solicitudes de ayuda"
              subtitulo="Comerciales que necesitan que alguien les sustituya en una visita"
              badge={numSolicitudesPendientes || undefined}
              tono={numSolicitudesPendientes ? 'aviso' : 'neutral'}
              to="/solicitudes-reasignacion"
            />
            <FilaNavegable
              icono="consumo"
              titulo="Consumo por comercial"
              subtitulo="Ver cuánto espacio usa cada comercial"
              to="/consumo-comerciales"
            />
            {!!numGruposDuplicados && (
              <FilaNavegable
                icono="duplicados"
                titulo="Clientes duplicados"
                subtitulo={
                  numGruposDuplicados === 1
                    ? 'Un grupo de fichas del mismo cliente — revisar y juntar'
                    : `${numGruposDuplicados} grupos de fichas del mismo cliente — revisar y juntar`
                }
                badge={numGruposDuplicados}
                tono="aviso"
                to="/deduplicacion"
              />
            )}
          </SeccionLista>
        )}

        <SeccionLista>
          <FilaNavegable
            icono="salir"
            titulo={cerrando ? 'Cerrando sesión…' : 'Cerrar sesión'}
            tono="riesgo"
            disabled={cerrando}
            onClick={cerrarSesion}
          />
        </SeccionLista>
        {error && (
          <div className="field-error-text" style={{ paddingInline: 'var(--fila-pad-x)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { useSesionActual } from '@/hooks/use-sesion-actual';

// Los avisos de "te han metido / te han sacado de una visita de equipo"
// que salen en "Yo" y encienden el punto de la pestaña. Tres casos:
//
//   · invitaciones = a MÍ me añadieron a una visita y aún no he dicho ni
//     que sí ni que no (visita_participante.estado = 'pendiente').
//   · rechazos = YO añadí a alguien y me ha rechazado; lo veo una vez y
//     al pulsar "Entendido" se marca rechazo_visto y desaparece.
//   · expulsiones = a MÍ me han quitado de una visita (estado
//     'expulsado'); mismo "Entendido".
//
// Y dos más, de reabrir una visita cerrada (visita_solicitud_reapertura):
//
//   · solicitudesReapertura = SOY responsable de la visita (o Dirección) y
//     un participante pide reabrirla — Aceptar/Rechazar, como invitaciones.
//   · rechazosReapertura = YO pedí reabrir y me han dicho que no; mismo
//     "Entendido" que rechazos. Una aceptación no avisa aparte: la visita ya
//     vuelve a estar en curso sola, sin nada que confirmar.
//
// Sin correos ni push: todo vive en la tabla y se consulta desde aquí.

interface InvitacionPendiente {
  id: string;
  visitaId: string;
  clienteNombre: string;
  fechaVisita: string;
  anadidoPorNombre: string;
}

interface RechazoSinVer {
  id: string;
  visitaId: string;
  clienteNombre: string;
  fechaVisita: string;
  comercialNombre: string;
}

interface AvisoVisita {
  id: string;
  visitaId: string;
  clienteNombre: string;
  fechaVisita: string;
}

interface VisitaEmbebida {
  fecha: string | null;
  cliente: { nombre: string } | null;
}

interface InvitacionCruda {
  id: string;
  visitaId: string;
  clienteNombre: string;
  fechaVisita: string;
  anadidoPorId: string | null;
}

interface RechazoCrudo {
  id: string;
  visitaId: string;
  clienteNombre: string;
  fechaVisita: string;
  comercialId: string;
}

interface SolicitudReaperturaPendiente {
  id: string;
  visitaId: string;
  clienteNombre: string;
  fechaVisita: string;
  solicitadoPorNombre: string;
}

interface SolicitudReaperturaCruda {
  id: string;
  visitaId: string;
  clienteNombre: string;
  fechaVisita: string;
  solicitadoPorId: string;
}

interface RechazoReaperturaSinVer {
  id: string;
  visitaId: string;
  clienteNombre: string;
  fechaVisita: string;
}

// Todo lo que hay que refrescar cuando una invitación cambia de estado:
// las dos listas de este hook, la lista del modal de participantes y los
// mapas de "solo mías" de las dos agendas.
const CLAVES_A_INVALIDAR = [
  ['invitaciones-visita'],
  ['rechazos-participacion'],
  ['expulsiones-participacion'],
  ['participantes-visita'],
  ['participantes-visitas-hoy'],
  ['agenda-participantes'],
];

// Al resolver una solicitud de reapertura la visita puede volver a estar en
// curso: además de sus propias claves, invalida las pantallas que muestran
// esa visita para que se enteren sin esperar al sondeo.
const CLAVES_A_INVALIDAR_REAPERTURA = [
  ['solicitudes-reapertura'],
  ['rechazos-reapertura'],
  ['detalle-visita-cerrada'],
  ['visita-objetivo'],
];

export function useAvisosParticipacion(): {
  invitaciones: InvitacionPendiente[];
  rechazos: RechazoSinVer[];
  expulsiones: AvisoVisita[];
  solicitudesReapertura: SolicitudReaperturaPendiente[];
  rechazosReapertura: RechazoReaperturaSinVer[];
  hayAvisos: boolean;
  aceptar: (id: string) => Promise<void>;
  rechazar: (id: string) => Promise<void>;
  marcarRechazoVisto: (id: string) => Promise<void>;
  marcarExpulsionVista: (id: string) => Promise<void>;
  aceptarReapertura: (id: string) => Promise<void>;
  rechazarReapertura: (id: string) => Promise<void>;
  marcarRechazoReaperturaVisto: (id: string) => Promise<void>;
} {
  const { comercial } = useSesionActual();
  const queryClient = useQueryClient();

  // id -> nombre de comerciales activos. Un comercial normal no puede
  // leer la tabla `comercial` (RLS), así que el nombre de quien te añadió
  // o de quien te rechazó se resuelve con esta RPC SECURITY DEFINER — el
  // embed directo devolvería null para ese rol.
  const { data: nombresPorId } = useQuery({
    queryKey: ['comerciales-nombres'],
    enabled: !!comercial,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.rpc('fn_comerciales_seleccionables');
      if (error) throw error;
      return new Map((data ?? []).map((c) => [c.id, c.nombre]));
    },
  });

  const { data: invitaciones } = useQuery({
    queryKey: ['invitaciones-visita', comercial?.id],
    enabled: !!comercial,
    staleTime: 60_000,
    refetchOnMount: 'always',
    queryFn: async (): Promise<InvitacionCruda[]> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('id, visita_id, creado_en, anadido_por, visita:visita_id(fecha, cliente:cliente_id(nombre))')
        .eq('comercial_id', comercial!.id)
        .eq('estado', 'pendiente')
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((f) => {
        const visita = f.visita as unknown as VisitaEmbebida | null;
        return {
          id: f.id,
          visitaId: f.visita_id,
          clienteNombre: visita?.cliente?.nombre ?? 'Cliente',
          fechaVisita: visita?.fecha ?? f.creado_en,
          anadidoPorId: f.anadido_por,
        };
      });
    },
  });

  const { data: rechazos } = useQuery({
    queryKey: ['rechazos-participacion', comercial?.id],
    enabled: !!comercial,
    staleTime: 60_000,
    refetchOnMount: 'always',
    queryFn: async (): Promise<RechazoCrudo[]> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('id, visita_id, comercial_id, visita:visita_id(fecha, cliente:cliente_id(nombre))')
        .eq('anadido_por', comercial!.id)
        .eq('estado', 'rechazado')
        .eq('rechazo_visto', false);
      if (error) throw error;
      return (data ?? []).map((f) => {
        const visita = f.visita as unknown as VisitaEmbebida | null;
        return {
          id: f.id,
          visitaId: f.visita_id,
          clienteNombre: visita?.cliente?.nombre ?? 'Cliente',
          fechaVisita: visita?.fecha ?? new Date().toISOString(),
          comercialId: f.comercial_id,
        };
      });
    },
  });

  const { data: expulsiones } = useQuery({
    queryKey: ['expulsiones-participacion', comercial?.id],
    enabled: !!comercial,
    staleTime: 60_000,
    refetchOnMount: 'always',
    queryFn: async (): Promise<AvisoVisita[]> => {
      const { data, error } = await supabase
        .from('visita_participante')
        .select('id, visita_id, visita:visita_id(fecha, cliente:cliente_id(nombre))')
        .eq('comercial_id', comercial!.id)
        .eq('estado', 'expulsado')
        .eq('rechazo_visto', false);
      if (error) throw error;
      return (data ?? []).map((f) => {
        const visita = f.visita as unknown as VisitaEmbebida | null;
        return {
          id: f.id,
          visitaId: f.visita_id,
          clienteNombre: visita?.cliente?.nombre ?? 'Cliente',
          fechaVisita: visita?.fecha ?? new Date().toISOString(),
        };
      });
    },
  });

  const invitacionesResueltas = useMemo<InvitacionPendiente[]>(
    () =>
      (invitaciones ?? []).map((f) => ({
        id: f.id,
        visitaId: f.visitaId,
        clienteNombre: f.clienteNombre,
        fechaVisita: f.fechaVisita,
        anadidoPorNombre: (f.anadidoPorId && nombresPorId?.get(f.anadidoPorId)) || 'Dirección Comercial',
      })),
    [invitaciones, nombresPorId]
  );

  const rechazosResueltos = useMemo<RechazoSinVer[]>(
    () =>
      (rechazos ?? []).map((f) => ({
        id: f.id,
        visitaId: f.visitaId,
        clienteNombre: f.clienteNombre,
        fechaVisita: f.fechaVisita,
        comercialNombre: nombresPorId?.get(f.comercialId) || 'Un compañero',
      })),
    [rechazos, nombresPorId]
  );

  // Pendientes de resolver por MÍ (soy responsable de esa visita, o
  // Dirección — la RLS ya acota cuáles veo). Sin visita_id embebido en el
  // nombre porque puede haber varias, una por visita distinta.
  const { data: solicitudesReapertura } = useQuery({
    queryKey: ['solicitudes-reapertura', comercial?.id],
    enabled: !!comercial,
    staleTime: 60_000,
    refetchOnMount: 'always',
    queryFn: async (): Promise<SolicitudReaperturaCruda[]> => {
      const { data, error } = await supabase
        .from('visita_solicitud_reapertura')
        .select('id, visita_id, solicitado_por, creado_en, visita:visita_id(fecha, cliente:cliente_id(nombre))')
        .eq('estado', 'pendiente')
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((f) => {
        const visita = f.visita as unknown as VisitaEmbebida | null;
        return {
          id: f.id,
          visitaId: f.visita_id,
          clienteNombre: visita?.cliente?.nombre ?? 'Cliente',
          fechaVisita: visita?.fecha ?? f.creado_en,
          solicitadoPorId: f.solicitado_por,
        };
      });
    },
  });

  const { data: rechazosReapertura } = useQuery({
    queryKey: ['rechazos-reapertura', comercial?.id],
    enabled: !!comercial,
    staleTime: 60_000,
    refetchOnMount: 'always',
    queryFn: async (): Promise<RechazoReaperturaSinVer[]> => {
      const { data, error } = await supabase
        .from('visita_solicitud_reapertura')
        .select('id, visita_id, visita:visita_id(fecha, cliente:cliente_id(nombre))')
        .eq('solicitado_por', comercial!.id)
        .eq('estado', 'rechazada')
        .eq('rechazo_visto', false);
      if (error) throw error;
      return (data ?? []).map((f) => {
        const visita = f.visita as unknown as VisitaEmbebida | null;
        return {
          id: f.id,
          visitaId: f.visita_id,
          clienteNombre: visita?.cliente?.nombre ?? 'Cliente',
          fechaVisita: visita?.fecha ?? new Date().toISOString(),
        };
      });
    },
  });

  const solicitudesReaperturaResueltas = useMemo<SolicitudReaperturaPendiente[]>(
    () =>
      (solicitudesReapertura ?? []).map((f) => ({
        id: f.id,
        visitaId: f.visitaId,
        clienteNombre: f.clienteNombre,
        fechaVisita: f.fechaVisita,
        solicitadoPorNombre: nombresPorId?.get(f.solicitadoPorId) || 'Un compañero',
      })),
    [solicitudesReapertura, nombresPorId]
  );

  const invalidar = useCallback(() => {
    for (const clave of CLAVES_A_INVALIDAR) {
      queryClient.invalidateQueries({ queryKey: clave });
    }
  }, [queryClient]);

  const invalidarReapertura = useCallback(() => {
    for (const clave of CLAVES_A_INVALIDAR_REAPERTURA) {
      queryClient.invalidateQueries({ queryKey: clave });
    }
  }, [queryClient]);

  const aceptar = useCallback(
    async (id: string) => {
      await conReintentoDeSesion(
        () => supabase.from('visita_participante').update({ estado: 'aceptado' }, { count: 'exact' }).eq('id', id),
        'No se ha podido aceptar (0 filas afectadas).'
      );
      invalidar();
    },
    [invalidar]
  );

  const rechazar = useCallback(
    async (id: string) => {
      // No se borra la fila: se deja como 'rechazado' para que quien te
      // añadió reciba el aviso. Queda fuera de la visita porque todas las
      // listas de participantes filtran estado <> 'rechazado'.
      await conReintentoDeSesion(
        () => supabase.from('visita_participante').update({ estado: 'rechazado' }, { count: 'exact' }).eq('id', id),
        'No se ha podido rechazar (0 filas afectadas).'
      );
      invalidar();
    },
    [invalidar]
  );

  // Sirve para los dos avisos que marcan "visto" en la misma columna:
  // el rechazo (lo ve quien añadió) y la expulsión (la ve el afectado).
  const marcarVisto = useCallback(
    async (id: string) => {
      await conReintentoDeSesion(
        () => supabase.from('visita_participante').update({ rechazo_visto: true }, { count: 'exact' }).eq('id', id),
        'No se ha podido marcar como visto (0 filas afectadas).'
      );
      invalidar();
    },
    [invalidar]
  );

  // `fn_resolver_solicitud_reapertura` es un RPC que no devuelve filas
  // afectadas (`returns void`): `conReintentoDeSesion` no sirve aquí (su
  // `esFallo` por defecto mira `count`, que en un RPC así siempre es null —
  // habría dado "no se pudo" incluso cuando la función funciona; la propia
  // función ya lanza excepción real si no autoriza o no encuentra la
  // solicitud, así que basta con comprobar `error` a mano, igual que el
  // resto de RPCs de la app (`eliminar_visita_completa`, etc.).
  const aceptarReapertura = useCallback(
    async (id: string) => {
      const { error } = await supabase.rpc('fn_resolver_solicitud_reapertura', {
        p_solicitud_id: id,
        p_aprobar: true,
      });
      if (error) throw new Error(error.message);
      invalidarReapertura();
    },
    [invalidarReapertura]
  );

  const rechazarReapertura = useCallback(
    async (id: string) => {
      const { error } = await supabase.rpc('fn_resolver_solicitud_reapertura', {
        p_solicitud_id: id,
        p_aprobar: false,
      });
      if (error) throw new Error(error.message);
      invalidarReapertura();
    },
    [invalidarReapertura]
  );

  const marcarRechazoReaperturaVisto = useCallback(
    async (id: string) => {
      await conReintentoDeSesion(
        () => supabase.from('visita_solicitud_reapertura').update({ rechazo_visto: true }, { count: 'exact' }).eq('id', id),
        'No se ha podido marcar como visto (0 filas afectadas).'
      );
      invalidarReapertura();
    },
    [invalidarReapertura]
  );

  return {
    invitaciones: invitacionesResueltas,
    rechazos: rechazosResueltos,
    expulsiones: expulsiones ?? [],
    solicitudesReapertura: solicitudesReaperturaResueltas,
    rechazosReapertura: rechazosReapertura ?? [],
    hayAvisos:
      invitacionesResueltas.length > 0 ||
      rechazosResueltos.length > 0 ||
      (expulsiones?.length ?? 0) > 0 ||
      solicitudesReaperturaResueltas.length > 0 ||
      (rechazosReapertura?.length ?? 0) > 0,
    aceptar,
    rechazar,
    marcarRechazoVisto: marcarVisto,
    marcarExpulsionVista: marcarVisto,
    aceptarReapertura,
    rechazarReapertura,
    marcarRechazoReaperturaVisto,
  };
}

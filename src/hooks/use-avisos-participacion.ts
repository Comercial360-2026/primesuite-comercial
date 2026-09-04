import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';

// Los avisos de "te han metido en una visita de equipo" que salen en "Yo"
// y encienden el punto de la pestaña. Dos caras del mismo hecho:
//
//   · invitaciones = a MÍ me añadieron a una visita y aún no he dicho ni
//     que sí ni que no (visita_participante.estado = 'pendiente').
//   · rechazos = YO añadí a alguien y me ha rechazado; lo veo una vez y
//     al pulsar "Entendido" se marca rechazo_visto y desaparece.
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

// Todo lo que hay que refrescar cuando una invitación cambia de estado:
// las dos listas de este hook, la lista del modal de participantes y los
// mapas de "solo mías" de las dos agendas.
const CLAVES_A_INVALIDAR = [
  ['invitaciones-visita'],
  ['rechazos-participacion'],
  ['participantes-visita'],
  ['participantes-visitas-hoy'],
  ['agenda-participantes'],
];

export function useAvisosParticipacion(): {
  invitaciones: InvitacionPendiente[];
  rechazos: RechazoSinVer[];
  hayAvisos: boolean;
  aceptar: (id: string) => Promise<void>;
  rechazar: (id: string) => Promise<void>;
  marcarRechazoVisto: (id: string) => Promise<void>;
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

  const invalidar = useCallback(() => {
    for (const clave of CLAVES_A_INVALIDAR) {
      queryClient.invalidateQueries({ queryKey: clave });
    }
  }, [queryClient]);

  const aceptar = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('visita_participante').update({ estado: 'aceptado' }).eq('id', id);
      if (error) throw error;
      invalidar();
    },
    [invalidar]
  );

  const rechazar = useCallback(
    async (id: string) => {
      // No se borra la fila: se deja como 'rechazado' para que quien te
      // añadió reciba el aviso. Queda fuera de la visita porque todas las
      // listas de participantes filtran estado <> 'rechazado'.
      const { error } = await supabase.from('visita_participante').update({ estado: 'rechazado' }).eq('id', id);
      if (error) throw error;
      invalidar();
    },
    [invalidar]
  );

  const marcarRechazoVisto = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('visita_participante').update({ rechazo_visto: true }).eq('id', id);
      if (error) throw error;
      invalidar();
    },
    [invalidar]
  );

  return {
    invitaciones: invitacionesResueltas,
    rechazos: rechazosResueltos,
    hayAvisos: invitacionesResueltas.length > 0 || rechazosResueltos.length > 0,
    aceptar,
    rechazar,
    marcarRechazoVisto,
  };
}

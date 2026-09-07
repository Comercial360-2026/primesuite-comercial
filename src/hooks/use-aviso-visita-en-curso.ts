import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

export interface AvisoVisitaEnCurso {
  id: string;
  objetivo: string | null;
  clienteNombre: string;
  /** True si la visita en curso es del MISMO cliente desde el que se va a
   *  arrancar. False = es otra visita propia, con otro cliente. */
  mismoCliente: boolean;
}

// Antes de arrancar una visita "sobre la marcha": ¿hay ya una visita EN CURSO
// que el comercial debería cerrar antes? Prioriza una del MISMO cliente (lo
// más probable es que sea esa la que quiere continuar); si no la hay, avisa
// igualmente de cualquier OTRA visita propia en curso — apilar visitas
// abiertas con clientes distintos también pasa sin querer (cada "Iniciar
// visita ahora" crea una) y antes no había ningún aviso. Devuelve la más
// reciente, o null.
export function useAvisoVisitaEnCurso(
  clienteId: string | undefined,
  comercialId: string | undefined,
) {
  return useQuery({
    queryKey: ['aviso-visita-en-curso', clienteId, comercialId],
    enabled: !!clienteId && !!comercialId,
    queryFn: async (): Promise<AvisoVisitaEnCurso | null> => {
      // 1) Misma cliente, sea de quien sea: motivo de aviso claro, y
      //    "Empezar otra" sigue disponible en el modal.
      const { data: mismo, error: e1 } = await supabase
        .from('visita')
        .select('id, objetivo, cliente:cliente_id(nombre)')
        .eq('cliente_id', clienteId!)
        .eq('estado_captura', 'en_curso')
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      if (mismo) {
        const cli = mismo.cliente as unknown as { nombre: string } | null;
        return {
          id: mismo.id,
          objetivo: mismo.objetivo,
          clienteNombre: cli?.nombre ?? 'este cliente',
          mismoCliente: true,
        };
      }

      // 2) Cualquier otra visita propia en curso (otro cliente).
      const { data: propia, error: e2 } = await supabase
        .from('visita_participante')
        .select(
          'visita:visita_id!inner(id, objetivo, estado_captura, fecha, cliente:cliente_id(nombre))'
        )
        .eq('comercial_id', comercialId!)
        .in('estado', ['pendiente', 'aceptado'])
        .eq('visita.estado_captura', 'en_curso')
        .order('visita(fecha)', { ascending: false })
        .limit(1);
      if (e2) throw e2;
      const v = propia?.[0]?.visita as unknown as
        | { id: string; objetivo: string | null; cliente: { nombre: string } | null }
        | undefined;
      if (!v) return null;
      return {
        id: v.id,
        objetivo: v.objetivo,
        clienteNombre: v.cliente?.nombre ?? 'otro cliente',
        mismoCliente: false,
      };
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

export interface AvisoVisitaEnCurso {
  id: string;
  objetivo: string | null;
  clienteNombre: string;
  /** Nombre del proyecto de esa visita, o null si es el General (P9, regla 4:
   *  el General no se nombra). */
  proyectoNombre: string | null;
  /** Cuándo se abrió esa visita (`visita.en_curso_desde`). Para el "lleva
   *  abierta desde…". */
  enCursoDesde: string | null;
  /** True si la visita en curso es del MISMO cliente desde el que se va a
   *  arrancar. False = es otra visita propia, con otro cliente. */
  mismoCliente: boolean;
  /** True si además es del MISMO proyecto. Con varios proyectos por cliente,
   *  arrancar en otro proyecto no es "continuar la misma visita". */
  mismoProyecto: boolean;
}

// Antes de arrancar una visita "sobre la marcha": ¿hay ya una visita EN CURSO
// que el comercial debería cerrar antes? Prioriza una del MISMO proyecto (lo
// que casi seguro quiere continuar), luego cualquiera del MISMO cliente
// (otro proyecto: se avisa pero no es "la misma visita"), y si no hay,
// cualquier OTRA visita propia en curso con otro cliente. Devuelve una, o null.
export function useAvisoVisitaEnCurso(
  clienteId: string | undefined,
  comercialId: string | undefined,
  proyectoIdActual?: string,
) {
  return useQuery({
    queryKey: ['aviso-visita-en-curso', clienteId, comercialId, proyectoIdActual ?? null],
    enabled: !!clienteId && !!comercialId,
    queryFn: async (): Promise<AvisoVisitaEnCurso | null> => {
      // 1) Visitas en curso de este cliente (varias si hay varios proyectos).
      const { data: mismas, error: e1 } = await supabase
        .from('visita')
        .select('id, objetivo, en_curso_desde, proyecto_id, proyecto:proyecto_id(nombre), cliente:cliente_id(nombre)')
        .eq('cliente_id', clienteId!)
        .eq('estado_captura', 'en_curso')
        .order('fecha', { ascending: false })
        .limit(5);
      if (e1) throw e1;

      if (mismas && mismas.length > 0) {
        // Preferir la del proyecto en el que se va a arrancar; si no, la más
        // reciente.
        const elegida =
          (proyectoIdActual && mismas.find((m) => m.proyecto_id === proyectoIdActual)) || mismas[0];
        const proy = elegida.proyecto as unknown as { nombre: string } | null;
        const cli = elegida.cliente as unknown as { nombre: string } | null;
        return {
          id: elegida.id,
          objetivo: elegida.objetivo,
          clienteNombre: cli?.nombre ?? 'este cliente',
          proyectoNombre: proy?.nombre ?? null,
          enCursoDesde: elegida.en_curso_desde,
          mismoCliente: true,
          mismoProyecto: !!proyectoIdActual && elegida.proyecto_id === proyectoIdActual,
        };
      }

      // 2) Cualquier otra visita propia en curso (otro cliente).
      const { data: propia, error: e2 } = await supabase
        .from('visita_participante')
        .select(
          'visita:visita_id!inner(id, objetivo, estado_captura, fecha, en_curso_desde, proyecto:proyecto_id(nombre), cliente:cliente_id(nombre))'
        )
        .eq('comercial_id', comercialId!)
        .in('estado', ['pendiente', 'aceptado'])
        .eq('visita.estado_captura', 'en_curso')
        .order('visita(fecha)', { ascending: false })
        .limit(1);
      if (e2) throw e2;
      const v = propia?.[0]?.visita as unknown as
        | {
            id: string;
            objetivo: string | null;
            en_curso_desde: string | null;
            proyecto: { nombre: string } | null;
            cliente: { nombre: string } | null;
          }
        | undefined;
      if (!v) return null;
      return {
        id: v.id,
        objetivo: v.objetivo,
        clienteNombre: v.cliente?.nombre ?? 'otro cliente',
        proyectoNombre: v.proyecto?.nombre ?? null,
        enCursoDesde: v.en_curso_desde,
        mismoCliente: false,
        mismoProyecto: false,
      };
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

export interface AvisoVisitaEnCurso {
  id: string;
  objetivo: string | null;
  clienteNombre: string;
  /** Nombre del proyecto de esa visita (siempre lo tiene; `null` solo si el
   *  join no lo trajo). */
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
  /** True si soy el responsable de esa visita. False = participo en una visita
   *  de otra persona (la acepté): el aviso lo dice distinto y no frena. */
  esMia: boolean;
  /** Quién la lleva, cuando no es mía. */
  responsableNombre: string | null;
}

// Antes de arrancar una visita "sobre la marcha": ¿hay ya una visita EN CURSO
// mía que debería cerrar antes? SOLO cuentan las que llevo yo o en las que ya
// he aceptado participar: una invitación sin aceptar NO es una visita mía (antes
// contaba y a un invitado le salía «ya tienes una visita en curso» sin haber
// abierto ninguna). Prioriza la del MISMO proyecto, luego la del MISMO cliente,
// y si no, cualquier otra mía; a igualdad, la que llevo yo. Devuelve una, o null.
export async function buscarVisitaEnCurso(
  clienteId: string,
  comercialId: string,
  proyectoIdActual?: string,
): Promise<AvisoVisitaEnCurso | null> {
  const { data, error } = await supabase
    .from('visita_participante')
    .select(
      'rol, visita:visita_id!inner(id, objetivo, estado_captura, fecha, en_curso_desde, cliente_id, proyecto_id, proyecto:proyecto_id(nombre), cliente:cliente_id(nombre))'
    )
    .eq('comercial_id', comercialId)
    .eq('estado', 'aceptado')
    .eq('visita.estado_captura', 'en_curso')
    .limit(20);
  if (error) throw error;

  type V = {
    id: string;
    objetivo: string | null;
    fecha: string;
    en_curso_desde: string | null;
    cliente_id: string;
    proyecto_id: string | null;
    proyecto: { nombre: string } | null;
    cliente: { nombre: string } | null;
  };
  const filas = (data ?? []).map((f) => ({ rol: f.rol as string, v: f.visita as unknown as V }));
  if (filas.length === 0) return null;

  const puntos = (f: (typeof filas)[number]) =>
    (f.v.cliente_id === clienteId ? 2 : 0) +
    (f.v.cliente_id === clienteId && proyectoIdActual && f.v.proyecto_id === proyectoIdActual ? 4 : 0) +
    (f.rol === 'responsable' ? 1 : 0);
  const elegida = [...filas].sort((x, y) => puntos(y) - puntos(x) || y.v.fecha.localeCompare(x.v.fecha))[0];
  const v = elegida.v;
  const esMia = elegida.rol === 'responsable';

  let responsableNombre: string | null = null;
  if (!esMia) {
    const { data: resp } = await supabase
      .from('visita_participante')
      .select('comercial_id')
      .eq('visita_id', v.id)
      .eq('rol', 'responsable')
      .maybeSingle();
    if (resp?.comercial_id) {
      const { data: nombres } = await supabase.rpc('fn_comerciales_seleccionables');
      responsableNombre = (nombres ?? []).find((c) => c.id === resp.comercial_id)?.nombre ?? null;
    }
  }

  return {
    id: v.id,
    objetivo: v.objetivo,
    clienteNombre: v.cliente?.nombre ?? 'este cliente',
    proyectoNombre: v.proyecto?.nombre ?? null,
    enCursoDesde: v.en_curso_desde,
    mismoCliente: v.cliente_id === clienteId,
    mismoProyecto: v.cliente_id === clienteId && !!proyectoIdActual && v.proyecto_id === proyectoIdActual,
    esMia,
    responsableNombre,
  };
}

export function useAvisoVisitaEnCurso(
  clienteId: string | undefined,
  comercialId: string | undefined,
  proyectoIdActual?: string,
) {
  return useQuery({
    queryKey: ['aviso-visita-en-curso', clienteId, comercialId, proyectoIdActual ?? null],
    enabled: !!clienteId && !!comercialId,
    queryFn: () => buscarVisitaEnCurso(clienteId!, comercialId!, proyectoIdActual),
  });
}

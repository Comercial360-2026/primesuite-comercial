import { supabase } from '@/lib/supabase-client';
import { type Area, mismaArea } from '@/lib/vocabulario';

// Lectura / escritura de las áreas de una oportunidad (tabla puente
// `oportunidad_area`) — réplica exacta de hallazgo-areas.ts, para que
// Categoría se comporte igual en las dos pantallas (antes Oportunidad
// usaba "Términos y soluciones", un mecanismo distinto sin razón de
// producto para serlo).

interface FilaAreaCruda {
  categoria_id: string | null;
  termino_id: string | null;
  categoria: { nombre: string } | null;
  termino: { nombre: string; parent: { nombre: string } | null } | null;
}

const SELECT_AREA =
  'oportunidad_id, categoria_id, termino_id, categoria:categoria_id(nombre), termino:termino_id(nombre, parent:parent_id(nombre))';

function aArea(f: FilaAreaCruda): Area | null {
  if (f.categoria_id && f.categoria) {
    return { tipo: 'categoria', id: f.categoria_id, nombre: f.categoria.nombre };
  }
  if (f.termino_id && f.termino) {
    const nombre = f.termino.parent
      ? `${f.termino.parent.nombre} › ${f.termino.nombre}`
      : f.termino.nombre;
    return { tipo: 'termino', id: f.termino_id, nombre };
  }
  return null;
}

export async function leerAreasDeOportunidad(oportunidadId: string): Promise<Area[]> {
  const { data, error } = await supabase
    .from('oportunidad_area')
    .select(SELECT_AREA)
    .eq('oportunidad_id', oportunidadId)
    .order('creado_en');
  if (error) throw error;
  return ((data ?? []) as unknown as FilaAreaCruda[])
    .map(aArea)
    .filter((a): a is Area => a !== null);
}

// Áreas de un lote de oportunidades, agrupadas por oportunidad_id — para
// las listas (actividad de proyecto, detalle de visita cerrada…).
export async function areasDeOportunidades(ids: string[]): Promise<Map<string, Area[]>> {
  const mapa = new Map<string, Area[]>();
  if (ids.length === 0) return mapa;
  const { data, error } = await supabase
    .from('oportunidad_area')
    .select(SELECT_AREA)
    .in('oportunidad_id', ids)
    .order('creado_en');
  if (error) throw error;
  for (const fila of (data ?? []) as unknown as (FilaAreaCruda & { oportunidad_id: string })[]) {
    const area = aArea(fila);
    if (!area) continue;
    const arr = mapa.get(fila.oportunidad_id) ?? [];
    arr.push(area);
    mapa.set(fila.oportunidad_id, arr);
  }
  return mapa;
}

// Deja las áreas de la oportunidad exactamente en `deseadas`: borra las que
// sobran e inserta las que faltan (diff, para no tocar filas que no
// cambian). La RLS de `oportunidad_area` ya acota a autor / Dirección.
export async function guardarAreasDeOportunidad(oportunidadId: string, deseadas: Area[]): Promise<void> {
  const actuales = await leerAreasDeOportunidad(oportunidadId);

  const sobran = actuales.filter((a) => !deseadas.some((d) => mismaArea(a, d)));
  const faltan = deseadas.filter((d) => !actuales.some((a) => mismaArea(a, d)));

  // Mismo encargo técnico que hallazgo_area: sin permiso, Supabase no da
  // error en un DELETE que no matchea ninguna fila por RLS — comprobar
  // `count` es la única forma de no decir "guardado ✓" sin haberse
  // borrado de verdad.
  for (const a of sobran) {
    const filtro = a.tipo === 'categoria' ? { categoria_id: a.id } : { termino_id: a.id };
    const { error, count } = await supabase
      .from('oportunidad_area')
      .delete({ count: 'exact' })
      .eq('oportunidad_id', oportunidadId)
      .match(filtro);
    if (error) throw error;
    if (!count) {
      throw new Error(`No se pudo quitar "${a.nombre}" (0 filas afectadas). Puede que no tengas permiso.`);
    }
  }

  if (faltan.length > 0) {
    const filas = faltan.map((a) => ({
      oportunidad_id: oportunidadId,
      categoria_id: a.tipo === 'categoria' ? a.id : null,
      termino_id: a.tipo === 'termino' ? a.id : null,
    }));
    const { error } = await supabase.from('oportunidad_area').insert(filas);
    if (error) throw error;
  }
}

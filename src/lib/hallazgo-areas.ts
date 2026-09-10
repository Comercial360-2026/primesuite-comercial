import { supabase } from '@/lib/supabase-client';
import { type Area, mismaArea } from '@/lib/vocabulario';

// Lectura / escritura de las áreas de un hallazgo (tabla puente
// `hallazgo_area`, prompt maestro 11 Fase 2). Un área es una categoría del
// catálogo o un término concreto; un hallazgo tiene varias.
//
// El nombre para pintar sale de los joins: para un término, la ruta
// "Padre › Hijo" si tiene padre (mismo criterio que el selector).

interface FilaAreaCruda {
  categoria_id: string | null;
  termino_id: string | null;
  categoria: { nombre: string } | null;
  termino: { nombre: string; parent: { nombre: string } | null } | null;
}

const SELECT_AREA =
  'hallazgo_id, categoria_id, termino_id, categoria:categoria_id(nombre), termino:termino_id(nombre, parent:parent_id(nombre))';

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

export async function leerAreasDeHallazgo(hallazgoId: string): Promise<Area[]> {
  const { data, error } = await supabase
    .from('hallazgo_area')
    .select(SELECT_AREA)
    .eq('hallazgo_id', hallazgoId)
    .order('creado_en');
  if (error) throw error;
  return ((data ?? []) as unknown as FilaAreaCruda[])
    .map(aArea)
    .filter((a): a is Area => a !== null);
}

// Áreas de un lote de hallazgos, agrupadas por hallazgo_id — para las
// listas (actividad de proyecto, detalle de visita cerrada…).
export async function areasDeHallazgos(ids: string[]): Promise<Map<string, Area[]>> {
  const mapa = new Map<string, Area[]>();
  if (ids.length === 0) return mapa;
  const { data, error } = await supabase
    .from('hallazgo_area')
    .select(SELECT_AREA)
    .in('hallazgo_id', ids)
    .order('creado_en');
  if (error) throw error;
  for (const fila of (data ?? []) as unknown as (FilaAreaCruda & { hallazgo_id: string })[]) {
    const area = aArea(fila);
    if (!area) continue;
    const arr = mapa.get(fila.hallazgo_id) ?? [];
    arr.push(area);
    mapa.set(fila.hallazgo_id, arr);
  }
  return mapa;
}

// Deja las áreas del hallazgo exactamente en `deseadas`: borra las que
// sobran e inserta las que faltan (diff, para no tocar filas que no
// cambian). La RLS de `hallazgo_area` ya acota a autor / Dirección.
export async function guardarAreasDeHallazgo(hallazgoId: string, deseadas: Area[]): Promise<void> {
  const actuales = await leerAreasDeHallazgo(hallazgoId);

  const sobran = actuales.filter((a) => !deseadas.some((d) => mismaArea(a, d)));
  const faltan = deseadas.filter((d) => !actuales.some((a) => mismaArea(a, d)));

  for (const a of sobran) {
    const filtro = a.tipo === 'categoria' ? { categoria_id: a.id } : { termino_id: a.id };
    const { error } = await supabase
      .from('hallazgo_area')
      .delete()
      .eq('hallazgo_id', hallazgoId)
      .match(filtro);
    if (error) throw error;
  }

  if (faltan.length > 0) {
    const filas = faltan.map((a) => ({
      hallazgo_id: hallazgoId,
      categoria_id: a.tipo === 'categoria' ? a.id : null,
      termino_id: a.tipo === 'termino' ? a.id : null,
    }));
    const { error } = await supabase.from('hallazgo_area').insert(filas);
    if (error) throw error;
  }
}

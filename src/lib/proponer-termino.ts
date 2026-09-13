import { supabase } from '@/lib/supabase-client';
import { NOMBRE_CATEGORIA_SIN_CLASIFICAR } from '@/lib/vocabulario';

// Proponer un término nuevo sobre la marcha desde un selector (SelectorTermino,
// SelectorAreas). Cae en la bandeja "Sin clasificar" (migración 80); si no
// existe, en la primera categoría como red de seguridad — Dirección lo
// recoloca al aprobarlo en Vocabulario › Pendientes. Devuelve el término
// recién creado para que el selector lo marque al momento.
export async function proponerTermino(nombre: string): Promise<{ id: string; nombre: string }> {
  const limpio = nombre.trim();
  if (!limpio) throw new Error('El término no puede estar vacío.');

  const { data: sesion } = await supabase.auth.getSession();
  const usuarioId = sesion.session?.user.id;

  const { data: cats, error: errCat } = await supabase
    .from('categoria_vocabulario')
    .select('id, nombre')
    .order('nombre');
  const categoriaDestino =
    cats?.find((c) => c.nombre.trim().toLowerCase() === NOMBRE_CATEGORIA_SIN_CLASIFICAR.toLowerCase()) ??
    cats?.[0];
  if (errCat || !categoriaDestino) {
    throw new Error('No se pudo determinar una categoría para el término nuevo.');
  }

  const { data: nuevo, error: errIns } = await supabase
    .from('termino')
    .insert({
      nombre: limpio,
      categoria_id: categoriaDestino.id,
      rol_funcional: 'ambos',
      propuesto_por_id: usuarioId,
      fecha_propuesta: new Date().toISOString(),
    })
    .select('id, nombre')
    .single();
  if (errIns || !nuevo) {
    throw new Error(errIns?.message ?? 'No se pudo proponer el término.');
  }
  return nuevo;
}

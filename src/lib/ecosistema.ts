import { supabase } from '@/lib/supabase-client';

// Carga del "Ecosistema" de un cliente: lo que sabemos que TIENE, derivado
// de sus hallazgos vivos (no archivados). Sale de la vista materializada
// `vw_ecosistema_actual_cliente` (la refresca un cron cada 10 min).
//
// Desde la Fase 4 del prompt maestro 11 la vista emite dos clases de fila:
//   - TÉRMINO — un modelo/tecnología concreto del catálogo ("MIFARE ›
//     DESFire EV2"). Se pinta como EcoTag normal.
//   - CATEGORÍA — un hallazgo marcado solo con su categoría ("Hardware"),
//     sin bajar al término. La vista ya omite la categoría si el cliente
//     tiene un término de esa misma categoría; aquí solo se pinta, en gris
//     tenue (`tipo="categoria"`).
//
// Lo consumen la Ficha de cliente y el Repaso pre-visita — antes cada una
// tenía su propia copia de esta consulta.

export interface EcoItem {
  /** termino_id o categoria_id — clave estable para React. */
  clave: string;
  tipo: 'termino' | 'categoria';
  /** Ruta "Padre › Hijo" para el término; nombre de la categoría. */
  nombre: string;
  naturaleza: string;
}

interface FilaEco {
  termino_id: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  naturaleza: string | null;
}

export async function cargarEcosistemaCliente(clienteId: string, limite?: number): Promise<EcoItem[]> {
  let consulta = supabase
    .from('vw_ecosistema_actual_cliente')
    .select('termino_id, categoria_id, categoria_nombre, naturaleza')
    .eq('cliente_id', clienteId);
  if (limite) consulta = consulta.limit(limite);
  const { data, error } = await consulta;
  if (error) throw error;

  const filas = (data ?? []) as FilaEco[];

  // Nombre de los términos (con ruta "Padre › Hijo" si es un modelo, mismo
  // criterio que SelectorTermino y Detalle de oportunidad).
  const terminoIds = filas.map((f) => f.termino_id).filter((x): x is string => !!x);
  const nombrePorTermino = new Map<string, string>();
  if (terminoIds.length) {
    const { data: terminos, error: errorTerminos } = await supabase
      .from('termino')
      .select('id, nombre, parent:parent_id(nombre)')
      .in('id', terminoIds);
    if (errorTerminos) throw errorTerminos;
    for (const t of (terminos ?? []) as unknown as { id: string; nombre: string; parent: { nombre: string } | null }[]) {
      nombrePorTermino.set(t.id, t.parent ? `${t.parent.nombre} › ${t.nombre}` : t.nombre);
    }
  }

  const items: EcoItem[] = [];
  for (const f of filas) {
    if (!f.naturaleza) continue;
    if (f.termino_id) {
      items.push({
        clave: f.termino_id,
        tipo: 'termino',
        nombre: nombrePorTermino.get(f.termino_id) ?? f.termino_id,
        naturaleza: f.naturaleza,
      });
    } else if (f.categoria_id && f.categoria_nombre) {
      items.push({ clave: f.categoria_id, tipo: 'categoria', nombre: f.categoria_nombre, naturaleza: f.naturaleza });
    }
  }

  // "Me preocupa" primero; dentro, los términos (más precisos) antes que las
  // categorías sueltas.
  items.sort((a, b) => {
    const ra = a.naturaleza === 'riesgo' ? 0 : 1;
    const rb = b.naturaleza === 'riesgo' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const ta = a.tipo === 'termino' ? 0 : 1;
    const tb = b.tipo === 'termino' ? 0 : 1;
    return ta - tb;
  });
  return items;
}

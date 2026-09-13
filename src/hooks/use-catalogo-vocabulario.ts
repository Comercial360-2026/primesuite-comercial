import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

// El catálogo de vocabulario tal y como lo consumen los selectores
// (SelectorTermino, SelectorAreas): las categorías en su orden real y los
// términos NO descartados, con los mapas derivados (padre→hijos, id→término)
// y los helpers de ruta ("MIFARE › DESFire EV2"). Antes esto vivía duplicado
// dentro de SelectorTermino; se extrae para que el selector de áreas
// (prompt maestro 11, Fase 2) hable exactamente el mismo idioma.

export interface CategoriaVocabulario {
  id: string;
  nombre: string;
  orden: number;
}

export interface TerminoVocabulario {
  id: string;
  nombre: string;
  categoria_id: string;
  estado_gobierno: string;
  parent_id: string | null;
  orden: number;
}

export function useCatalogoVocabulario() {
  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    queryFn: async (): Promise<CategoriaVocabulario[]> => {
      // Mismo orden que el catálogo (`cola-vocabulario.tsx`): primero el
      // `orden` manual que Dirección fija a mano, el nombre solo desempata.
      const { data, error } = await supabase
        .from('categoria_vocabulario')
        .select('id, nombre, orden')
        .order('orden')
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: terminos } = useQuery({
    queryKey: ['catalogo-terminos-selector'],
    queryFn: async (): Promise<TerminoVocabulario[]> => {
      const { data, error } = await supabase
        .from('termino')
        .select('id, nombre, categoria_id, estado_gobierno, parent_id, orden')
        .neq('estado_gobierno', 'descartado')
        .order('orden')
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });

  const terminosLista = useMemo(() => terminos ?? [], [terminos]);
  const categoriasLista = useMemo(() => categorias ?? [], [categorias]);

  const porId = useMemo(
    () => new Map(terminosLista.map((t) => [t.id, t])),
    [terminosLista]
  );

  const hijosPorPadre = useMemo(() => {
    const m = new Map<string, TerminoVocabulario[]>();
    for (const t of terminosLista) {
      if (!t.parent_id) continue;
      const arr = m.get(t.parent_id) ?? [];
      arr.push(t);
      m.set(t.parent_id, arr);
    }
    return m;
  }, [terminosLista]);

  // Términos de primer nivel de una categoría (un término cuyo padre no
  // existe / está descartado también cuenta como primer nivel).
  const primerNivelDe = useMemo(
    () => (categoriaId: string) =>
      terminosLista.filter(
        (t) => t.categoria_id === categoriaId && (!t.parent_id || !porId.get(t.parent_id))
      ),
    [terminosLista, porId]
  );

  // "MIFARE › DESFire EV2" para un modelo; solo el nombre para un término de
  // primer nivel (o si el padre está descartado y no aparece).
  function rutaDe(t: TerminoVocabulario): string {
    const padre = t.parent_id ? porId.get(t.parent_id) : undefined;
    return padre ? `${padre.nombre} › ${t.nombre}` : t.nombre;
  }
  // La ruta partida en dos para pintarla: el padre en gris, el modelo con peso.
  function partesRuta(t: TerminoVocabulario): { lead: string; tail: string } {
    const padre = t.parent_id ? porId.get(t.parent_id) : undefined;
    return padre ? { lead: `${padre.nombre} › `, tail: t.nombre } : { lead: '', tail: t.nombre };
  }

  return {
    categorias: categoriasLista,
    terminos: terminosLista,
    porId,
    hijosPorPadre,
    primerNivelDe,
    rutaDe,
    partesRuta,
  };
}

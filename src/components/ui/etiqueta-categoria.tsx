// Círculo de 2 letras delante del título de una SeccionLista, para
// distinguir de un vistazo qué tipo de contenido trae (Oportunidades,
// Notas...) — puramente visual, sin significado más allá de "esto es un
// hallazgo", así que el tono es FIJO por categoría, no por hash como el
// `Avatar` de una persona o un proyecto. Tonos elegidos aparte de
// verde/ámbar/rojo (ya significan el semáforo del cliente) y del borgoña
// de riesgo (ya significa acción destructiva).
export type CategoriaSeccion = 'oportunidad' | 'nota' | 'hallazgo' | 'paso' | 'visita';

const MAPA: Record<CategoriaSeccion, { siglas: string; tono: number; nombre: string }> = {
  oportunidad: { siglas: 'OP', tono: 5, nombre: 'Oportunidad' },
  nota: { siglas: 'NT', tono: 2, nombre: 'Nota' },
  hallazgo: { siglas: 'HZ', tono: 6, nombre: 'Hallazgo' },
  paso: { siglas: 'PP', tono: 8, nombre: 'Próximo paso' },
  visita: { siglas: 'VI', tono: 1, nombre: 'Visita' },
};

export function EtiquetaCategoria({ tipo }: { tipo: CategoriaSeccion }) {
  const c = MAPA[tipo];
  return (
    <span className={`avatar avatar--xs avatar--${c.tono}`} role="img" aria-label={c.nombre}>
      {c.siglas}
    </span>
  );
}

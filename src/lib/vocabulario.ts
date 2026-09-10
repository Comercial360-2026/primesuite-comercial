// Categoría fija "Sin clasificar": la bandeja donde caen los términos que
// los comerciales proponen sobre la marcha (SelectorTermino). La crea la
// migración 80; el cliente la localiza por su NOMBRE, no por un id fijo.
// Dirección la reubica al aprobar en Pendientes ("Aprobar en…").
export const NOMBRE_CATEGORIA_SIN_CLASIFICAR = 'Sin clasificar';

export function esCategoriaSinClasificar(nombre: string | null | undefined): boolean {
  return (nombre ?? '').trim().toLowerCase() === NOMBRE_CATEGORIA_SIN_CLASIFICAR.toLowerCase();
}

// El "área" de un hallazgo (prompt maestro 11, Fase 2): o una categoría del
// catálogo ("Hardware", "Software"…) o un término concreto. Lleva el
// `nombre` para pintar el chip sin volver a consultar; para persistir solo
// viaja `{ tipo, id }` (ver AreaHallazgoRef en offline-queue/types).
export type Area =
  | { tipo: 'categoria'; id: string; nombre: string }
  | { tipo: 'termino'; id: string; nombre: string };

export function mismaArea(a: Area, b: Area): boolean {
  return a.tipo === b.tipo && a.id === b.id;
}

// Categoría fija "Sin clasificar": la bandeja donde caen los términos que
// los comerciales proponen sobre la marcha (SelectorTermino). La crea la
// migración 80; el cliente la localiza por su NOMBRE, no por un id fijo.
// Dirección la reubica al aprobar en Pendientes ("Aprobar en…").
export const NOMBRE_CATEGORIA_SIN_CLASIFICAR = 'Sin clasificar';

export function esCategoriaSinClasificar(nombre: string | null | undefined): boolean {
  return (nombre ?? '').trim().toLowerCase() === NOMBRE_CATEGORIA_SIN_CLASIFICAR.toLowerCase();
}

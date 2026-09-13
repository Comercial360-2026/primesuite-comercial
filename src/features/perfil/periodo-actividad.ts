// Ventana temporal compartida por "Actividad por comercial" (lista + ficha
// de cada comercial). Recorrido §8: los totales eran siempre históricos y no
// servían para "¿quién está activo?". Por defecto se muestran los últimos 30
// días; "Todo" es el histórico completo. El valor por defecto no se escribe
// en la URL — solo "todo" viaja como `?dias=todo`, y así se arrastra de la
// lista a la ficha y de vuelta.

export type PeriodoActividad = '30d' | 'todo';

export function periodoDeParams(params: URLSearchParams): PeriodoActividad {
  return params.get('dias') === 'todo' ? 'todo' : '30d';
}

/** `p_desde` para las RPC de actividad: fecha ISO para "30d", null para "todo". */
export function desdeDePeriodo(periodo: PeriodoActividad): string | null {
  if (periodo === 'todo') return null;
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

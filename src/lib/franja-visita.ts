// Mañana / tarde / sin hora, para agrupar visitas dentro de un día en la
// Agenda y en Hoy. Se deriva de:
//   1. Si hay hora definida (visita.hora_definida) → la franja sale de la
//      hora. Corte a las 14:00, hora local.
//   2. Si NO hay hora pero el comercial marcó franja (visita.franja) →
//      'manana' o 'tarde' sin hora concreta.
//   3. Si no hay ni hora ni franja → 'sin_hora'.

export type Franja = 'manana' | 'tarde' | 'sin_hora';
export type FranjaElegible = 'manana' | 'tarde';

const CORTE_TARDE = 14;

export function franjaDe(
  fechaISO: string,
  horaDefinida: boolean,
  franja?: string | null
): Franja {
  if (horaDefinida) {
    return new Date(fechaISO).getHours() < CORTE_TARDE ? 'manana' : 'tarde';
  }
  if (franja === 'manana' || franja === 'tarde') return franja;
  return 'sin_hora';
}

// La franja del momento actual — para abrir esa sección por defecto en Hoy.
export function franjaActual(ahora: Date = new Date()): FranjaElegible {
  return ahora.getHours() < CORTE_TARDE ? 'manana' : 'tarde';
}

export function etiquetaFranja(f: Franja): string {
  return f === 'manana' ? 'mañana' : f === 'tarde' ? 'tarde' : 'sin hora';
}

// Orden dentro de un día: mañana → tarde → sin hora.
export const ordenFranja: Record<Franja, number> = { manana: 0, tarde: 1, sin_hora: 2 };

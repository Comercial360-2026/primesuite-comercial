// Mañana / tarde / sin hora, para agrupar visitas dentro de un día en la
// Agenda y en Hoy. Se deriva de la fecha de la visita y de si su hora está
// definida (visita.hora_definida): al planificar, el comercial puede meter
// una hora o dejarla en blanco. Corte a las 14:00, hora local.

export type Franja = 'manana' | 'tarde' | 'sin_hora';

const CORTE_TARDE = 14;

export function franjaDe(fechaISO: string, horaDefinida: boolean): Franja {
  if (!horaDefinida) return 'sin_hora';
  return new Date(fechaISO).getHours() < CORTE_TARDE ? 'manana' : 'tarde';
}

export function etiquetaFranja(f: Franja): string {
  return f === 'manana' ? 'mañana' : f === 'tarde' ? 'tarde' : 'sin hora';
}

// Orden dentro de un día: mañana → tarde → sin hora.
export const ordenFranja: Record<Franja, number> = { manana: 0, tarde: 1, sin_hora: 2 };

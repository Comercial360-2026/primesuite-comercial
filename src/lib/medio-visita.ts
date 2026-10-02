import type { NombreIcono } from '@/components/ui/iconos';

// Cómo se hace una visita. Un solo sitio: etiquetas, iconos y clases de color
// de Presencial / Teams / Llamada (columna `visita.medio`, migración 136).
// Presencial es lo de siempre y no lleva tono ni etiqueta en la agenda.
export type MedioVisita = 'presencial' | 'teams' | 'llamada';

export const MEDIO_VISITA: Record<MedioVisita, { etiqueta: string; frase: string; icono: NombreIcono }> = {
  presencial: { etiqueta: 'Presencial', frase: 'visita presencial', icono: 'ubicacion' },
  teams: { etiqueta: 'Teams', frase: 'reunión por Teams', icono: 'teams' },
  llamada: { etiqueta: 'Llamada', frase: 'llamada', icono: 'llamada' },
};

export const OPCIONES_MEDIO = [
  { valor: 'presencial', etiqueta: MEDIO_VISITA.presencial.etiqueta, icono: MEDIO_VISITA.presencial.icono },
  { valor: 'teams', etiqueta: MEDIO_VISITA.teams.etiqueta, icono: MEDIO_VISITA.teams.icono },
  { valor: 'llamada', etiqueta: MEDIO_VISITA.llamada.etiqueta, icono: MEDIO_VISITA.llamada.icono },
] as const;

/** Valor de BD → medio conocido (lo desconocido o null cuenta como presencial). */
export function medioDe(valor: string | null | undefined): MedioVisita {
  return valor === 'teams' || valor === 'llamada' ? valor : 'presencial';
}

export const esNoPresencial = (m: MedioVisita) => m !== 'presencial';

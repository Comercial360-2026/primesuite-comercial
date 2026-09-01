// Etiquetas legibles de los enums de texto libre de una visita (naturaleza
// de hallazgo, etapa y prioridad de oportunidad, tipo de visita). Un solo
// sitio en la app — la Edge Function del informe tiene su propia copia
// (runtime distinto, no puede importar de src/), pero deben coincidir.

export const NATURALEZA_ORDEN = [
  'riesgo',
  'proyecto_activo',
  'competencia',
  'oportunidad',
  'fortaleza',
  'contexto',
] as const;

export const NATURALEZA_LABEL: Record<string, string> = {
  riesgo: 'Riesgo',
  proyecto_activo: 'Proyecto activo',
  competencia: 'Competencia',
  oportunidad: 'Señal de oportunidad',
  fortaleza: 'Fortaleza',
  contexto: 'Contexto',
};

export const ETAPA_LABEL: Record<string, string> = {
  latente: 'Latente',
  cualificada: 'Cualificada',
  en_propuesta: 'En propuesta',
  ganada: 'Ganada',
  perdida: 'Perdida',
  descartada: 'Descartada',
};

export const PRIORIDAD_LABEL: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  estrategica: 'Estratégica',
};
export const PRIORIDAD_ORDEN: Record<string, number> = { estrategica: 0, alta: 1, media: 2, baja: 3 };

export const TIPO_VISITA_LABEL: Record<string, string> = {
  comercial: 'Comercial',
  demo: 'Demostración',
  tecnica: 'Técnica',
  seguimiento: 'Seguimiento',
  relacion: 'Relación',
};

export const ESTADO_PASO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  completado: 'Hecho',
  cancelado: 'Cancelado',
};

/** Devuelve la etiqueta del mapa, o el valor con "_"→" " y primera en mayúscula. */
export function etiqueta(mapa: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return '—';
  if (mapa[valor]) return mapa[valor];
  const limpio = valor.replace(/_/g, ' ');
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

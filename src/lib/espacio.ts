// Reparto blando del almacenamiento. El presupuesto (Storage de Supabase)
// es un pozo común: lo que importa es el total del equipo. La "cuota por
// comercial" (fn_cuota_comercial_bytes) es solo orientativa — un comercial
// puede pasarse de su parte mientras el pozo tenga sitio.
//
// Dos niveles de aviso:
//   - Tu parte: al 85% se avisa suave, NO bloquea (puede haber margen del
//     equipo).
//   - El pozo del equipo: manda. 85% aviso, 95% crítico, 98% bloqueo de
//     subidas (fotos/audios; las notas de texto siguen).

export const UMBRAL_MI_PARTE = 85; // %
export const UMBRAL_EQUIPO_AVISO = 85; // %
export const UMBRAL_EQUIPO_CRITICO = 95; // %
export const UMBRAL_EQUIPO_BLOQUEO = 98; // %

export type NivelEspacio =
  | 'ok'
  | 'aviso_mio'
  | 'aviso_equipo'
  | 'critico_equipo'
  | 'bloqueo';

export interface EstadoEspacio {
  miUso: number;
  cuotaBase: number;
  usadoTotal: number;
  presupuesto: number;
  pctMio: number;
  pctEquipo: number;
  nivel: NivelEspacio;
  puedeSubir: boolean;
}

export function evaluarEspacio(
  miUso: number,
  cuotaBase: number,
  usadoTotal: number,
  presupuesto: number
): EstadoEspacio {
  const pctMio = cuotaBase > 0 ? (miUso / cuotaBase) * 100 : 0;
  const pctEquipo = presupuesto > 0 ? (usadoTotal / presupuesto) * 100 : 0;

  let nivel: NivelEspacio = 'ok';
  if (pctEquipo >= UMBRAL_EQUIPO_BLOQUEO) nivel = 'bloqueo';
  else if (pctEquipo >= UMBRAL_EQUIPO_CRITICO) nivel = 'critico_equipo';
  else if (pctEquipo >= UMBRAL_EQUIPO_AVISO) nivel = 'aviso_equipo';
  else if (pctMio >= UMBRAL_MI_PARTE) nivel = 'aviso_mio';

  return {
    miUso,
    cuotaBase,
    usadoTotal,
    presupuesto,
    pctMio,
    pctEquipo,
    nivel,
    puedeSubir: nivel !== 'bloqueo',
  };
}

export function formatearMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

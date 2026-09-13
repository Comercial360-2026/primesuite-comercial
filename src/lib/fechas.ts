// Formato de fechas y horas — un solo sitio, para que en toda la app se
// escriban igual. Antes cada pantalla llamaba a `new Date(x).toLocale…`
// con opciones distintas: "9/9/2026", "9 sept", "martes, 9 de septiembre"…
// mezclados. Ver 08_sistema_diseno.md §"Formatos".
//
// Acepta un ISO string o un Date. Devuelve '' si el valor es nulo/ inválido.

type Entrada = string | number | Date | null | undefined;

function aDate(v: Entrada): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "9 sept 2026" — listas, metadatos, "última visita", "creada el"… */
export function fechaCorta(v: Entrada): string {
  const d = aDate(v);
  return d ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** "mar 9 sept" — chips y filas donde el año sobra (esta semana / mes). */
export function fechaDiaMes(v: Entrada): string {
  const d = aDate(v);
  return d ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '') : '';
}

/** "martes, 9 de septiembre de 2026" — cabeceras y fechas destacadas. */
export function fechaLarga(v: Entrada): string {
  const d = aDate(v);
  return d ? d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

/** "09:30". */
export function hora(v: Entrada): string {
  const d = aDate(v);
  return d ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
}

/** "hace un momento" / "hace 40 min" / "hace 3 h" / "ayer a las 18:40" /
 *  "el lun 8, 18:40" / "hace 3 semanas" — para algo VIVO cuya antigüedad
 *  importa al minuto/hora (una visita en curso). `haceRelativo` es de
 *  granularidad-día y aquí se queda corto ("abierta hoy" para algo de hace
 *  40 min). Siempre en pasado; para el futuro devuelve ''. */
export function desdeHace(v: Entrada): string {
  const d = aDate(v);
  if (!d) return '';
  const ms = Date.now() - d.getTime();
  if (ms < 0) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hoy0 = new Date();
  hoy0.setHours(0, 0, 0, 0);
  const d0 = new Date(d);
  d0.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy0.getTime() - d0.getTime()) / 86_400_000);
  if (dias === 0) return `hace ${Math.floor(min / 60)} h`;
  if (dias === 1) return `ayer a las ${hora(d)}`;
  if (dias < 7) return `el ${fechaDiaMes(d)}, ${hora(d)}`;
  return haceRelativo(d);
}

/** "hoy" / "ayer" / "hace 5 días" / "hace 3 semanas" / "hace 4 meses" — para
 *  el de un vistazo ("última visita hace 6 semanas", "vencido hace 9 días").
 *  Siempre en pasado; para fechas futuras devuelve "" (usar `fechaCorta`). */
export function haceRelativo(v: Entrada): string {
  const d = aDate(v);
  if (!d) return '';
  // Días de CALENDARIO, no periodos de 24 h: algo de ayer por la tarde visto
  // esta mañana es "ayer" aunque no hayan pasado 24 h. Se comparan las dos
  // fechas a medianoche local.
  const hoy0 = new Date();
  hoy0.setHours(0, 0, 0, 0);
  const d0 = new Date(d);
  d0.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy0.getTime() - d0.getTime()) / 86_400_000);
  if (dias < 0) return '';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 60) {
    const sem = Math.round(dias / 7);
    return sem === 1 ? 'hace 1 semana' : `hace ${sem} semanas`;
  }
  const meses = Math.round(dias / 30);
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}

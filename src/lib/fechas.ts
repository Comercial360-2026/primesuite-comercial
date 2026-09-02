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

/** "hoy" / "ayer" / "hace 5 días" / "hace 3 semanas" / "hace 4 meses" — para
 *  el de un vistazo ("última visita hace 6 semanas", "vencido hace 9 días").
 *  Siempre en pasado; para fechas futuras devuelve "" (usar `fechaCorta`). */
export function haceRelativo(v: Entrada): string {
  const d = aDate(v);
  if (!d) return '';
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
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

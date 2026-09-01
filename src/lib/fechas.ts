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
  return d ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
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

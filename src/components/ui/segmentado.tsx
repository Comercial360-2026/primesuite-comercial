import { Icono, type NombreIcono } from './iconos';

// Control segmentado — un filtro EXCLUYENTE de 2-3 posiciones ("solo lo
// mío" / "todos", "Agenda" / "Solo mías" / "Todas") se lee como un
// interruptor, no como chips sueltos compitiendo por atención. El chip
// normal (`.chip`/`.chip--on`) se queda para filtros que sí se pueden
// combinar (p. ej. las categorías de Vocabulario) — este componente es
// solo para el caso exclusivo. Mantenerlo en 3 opciones como máximo: con
// más, vuelve a ser una lista de chips. Aspecto en components.css
// (.segmentado*).
//
// Cada opción puede llevar `icono` (además o en vez de la etiqueta): un
// conmutador de vista ("por tipo" / "por zona") se lee mejor con un icono
// que con texto que no parece pulsable. `etiqueta` siempre se pasa: es el
// nombre accesible aunque no se pinte.

interface Opcion<T extends string> {
  valor: T;
  etiqueta: string;
  /** Si se pasa, se pinta el icono; con `soloIcono` la etiqueta no se ve. */
  icono?: NombreIcono;
}

interface Props<T extends string> {
  /** 2 o 3 posiciones. Con más, usa `.chip` en fila. */
  opciones: readonly [Opcion<T>, Opcion<T>] | readonly [Opcion<T>, Opcion<T>, Opcion<T>];
  valor: T;
  onCambio: (valor: T) => void;
  /** Pinta solo el icono de cada opción (la etiqueta queda como aria-label). */
  soloIcono?: boolean;
}

export function Segmentado<T extends string>({ opciones, valor, onCambio, soloIcono }: Props<T>) {
  return (
    <div className="segmentado" role="tablist">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="tab"
          aria-selected={valor === o.valor}
          aria-label={soloIcono ? o.etiqueta : undefined}
          title={soloIcono ? o.etiqueta : undefined}
          className={`segmentado__btn${valor === o.valor ? ' segmentado__btn--on' : ''}`}
          onClick={() => onCambio(o.valor)}
        >
          {o.icono && <Icono nombre={o.icono} size={16} />}
          {!(soloIcono && o.icono) && o.etiqueta}
        </button>
      ))}
    </div>
  );
}

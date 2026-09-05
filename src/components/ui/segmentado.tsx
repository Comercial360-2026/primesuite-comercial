// Control segmentado — un filtro BINARIO y EXCLUYENTE ("solo lo mío" /
// "todos", "pendiente" / "completado"...) se lee como un interruptor de dos
// posiciones, no como dos `chip` sueltos compitiendo por atención. El chip
// normal (`.chip`/`.chip--on`) se queda para filtros que sí se pueden
// combinar (p. ej. las categorías de Vocabulario) — este componente es
// solo para el caso exclusivo. Aspecto en components.css (.segmentado*).

interface Opcion<T extends string> {
  valor: T;
  etiqueta: string;
}

interface Props<T extends string> {
  opciones: readonly [Opcion<T>, Opcion<T>];
  valor: T;
  onCambio: (valor: T) => void;
}

export function Segmentado<T extends string>({ opciones, valor, onCambio }: Props<T>) {
  return (
    <div className="segmentado" role="tablist">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="tab"
          aria-selected={valor === o.valor}
          className={`segmentado__btn${valor === o.valor ? ' segmentado__btn--on' : ''}`}
          onClick={() => onCambio(o.valor)}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

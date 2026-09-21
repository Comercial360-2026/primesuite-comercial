import type { ReactNode } from 'react';

export interface BarraGrafico {
  id: string;
  /** Normalmente el nombre de la persona (con su `Avatar` delante). */
  etiqueta: ReactNode;
  /** Valor real, decide el ancho de la barra (relativo al máximo). */
  valor: number;
  /** Texto ya formateado a la derecha ("8 visitas", "4.8 MB · 3%"). */
  valorTexto: string;
  /** Color de relleno — `var(--avatar-N)` de esa persona, o un tono de
   *  estado (`var(--risk-600)`…), según lo que cuente el gráfico. */
  color: string;
}

interface Props {
  items: BarraGrafico[];
  /** Máximo fijo (p. ej. una cuota) en vez del mayor valor de la lista. */
  maximo?: number;
}

// Barras horizontales — sustituye una tabla de números sueltos por algo con
// lectura de un vistazo, sin librería externa (coherente con "sin
// dependencias visuales" del sistema: son <div> con ancho en %, mismo
// lenguaje que `.tarjeta-accion__barra`, ya usado en Mi espacio). La etiqueta de
// cada fila hace de leyenda — no hace falta una leyenda aparte cuando cada
// barra ya lleva su nombre al lado. El valor siempre se ve en texto: el
// color nunca es la única forma de leer el dato (accesibilidad, daltónico).
// Ver 08_sistema_diseno.md §"Gráficos por comercial".
export function GraficoBarras({ items, maximo }: Props) {
  const max = maximo ?? Math.max(1, ...items.map((i) => i.valor));

  return (
    <div className="grafico-barras">
      {items.map((item) => {
        const pct = Math.min((item.valor / max) * 100, 100);
        return (
          <div key={item.id} className="grafico-barras__fila">
            <span className="grafico-barras__etiqueta">{item.etiqueta}</span>
            <span className="grafico-barras__pista">
              <span
                className="grafico-barras__relleno"
                style={{ width: `${item.valor > 0 ? Math.max(pct, 3) : 0}%`, background: item.color }}
              />
            </span>
            <span className="grafico-barras__valor">{item.valorTexto}</span>
          </div>
        );
      })}
    </div>
  );
}

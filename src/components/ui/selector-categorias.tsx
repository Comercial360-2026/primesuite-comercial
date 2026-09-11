import { type Area, esCategoriaSinClasificar } from '@/lib/vocabulario';
import { useCatalogoVocabulario } from '@/hooks/use-catalogo-vocabulario';

interface SelectorCategoriasProps {
  seleccionadas: Area[];
  onCambio: (areas: Area[]) => void;
}

// Lista simple de categorías del catálogo: se marcan una o varias (Hallazgo,
// simplificado a "categorías + nota" — término/modelo queda reservado para
// más adelante, ver docs de la decisión). Tocar una ya marcada la quita.
// "Sin clasificar" queda fuera: es la bandeja de propuestas, no una
// categoría real.
export function SelectorCategorias({ seleccionadas, onCambio }: SelectorCategoriasProps) {
  const { categorias } = useCatalogoVocabulario();
  const lista = categorias.filter((c) => !esCategoriaSinClasificar(c.nombre));

  function alternar(c: { id: string; nombre: string }) {
    const marcada = seleccionadas.some((a) => a.id === c.id);
    onCambio(
      marcada
        ? seleccionadas.filter((a) => a.id !== c.id)
        : [...seleccionadas, { tipo: 'categoria', id: c.id, nombre: c.nombre }]
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {lista.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chip${seleccionadas.some((a) => a.id === c.id) ? ' chip--on' : ''}`}
          onClick={() => alternar(c)}
        >
          {c.nombre}
        </button>
      ))}
    </div>
  );
}

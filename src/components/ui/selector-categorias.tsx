import { type Area, esCategoriaSinClasificar } from '@/lib/vocabulario';
import { useCatalogoVocabulario } from '@/hooks/use-catalogo-vocabulario';

interface SelectorCategoriasProps {
  seleccionada: Area | null;
  onCambio: (area: Area | null) => void;
}

// Lista simple de categorías del catálogo: se marca UNA (Hallazgo,
// simplificado a "categoría + nota" — término/modelo queda reservado para
// más adelante, ver docs de la decisión). Tocar la ya marcada la quita.
// "Sin clasificar" queda fuera: es la bandeja de propuestas, no una
// categoría real.
export function SelectorCategorias({ seleccionada, onCambio }: SelectorCategoriasProps) {
  const { categorias } = useCatalogoVocabulario();
  const lista = categorias.filter((c) => !esCategoriaSinClasificar(c.nombre));

  function alternar(c: { id: string; nombre: string }) {
    onCambio(seleccionada?.id === c.id ? null : { tipo: 'categoria', id: c.id, nombre: c.nombre });
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {lista.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chip${seleccionada?.id === c.id ? ' chip--on' : ''}`}
          onClick={() => alternar(c)}
        >
          {c.nombre}
        </button>
      ))}
    </div>
  );
}

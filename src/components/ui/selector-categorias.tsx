import { type Area, esCategoriaSinClasificar } from '@/lib/vocabulario';
import { useCatalogoVocabulario } from '@/hooks/use-catalogo-vocabulario';

interface SelectorCategoriasProps {
  seleccionadas: Area[];
  onCambio: (areas: Area[]) => void;
}

// Lista simple de categorías del catálogo, para marcar en caliente desde
// "Anotar": tocas una o varias, sin buscador ni bajar al término. El
// detalle fino (buscar, término/modelo, proponer uno nuevo) se afina luego
// en la ficha del hallazgo (SelectorAreas). "Sin clasificar" queda fuera:
// es la bandeja de propuestas, no una categoría real.
export function SelectorCategorias({ seleccionadas, onCambio }: SelectorCategoriasProps) {
  const { categorias } = useCatalogoVocabulario();
  const lista = categorias.filter((c) => !esCategoriaSinClasificar(c.nombre));

  const estaSel = (id: string) =>
    seleccionadas.some((a) => a.tipo === 'categoria' && a.id === id);

  function alternar(c: { id: string; nombre: string }) {
    onCambio(
      estaSel(c.id)
        ? seleccionadas.filter((a) => !(a.tipo === 'categoria' && a.id === c.id))
        : [...seleccionadas, { tipo: 'categoria', id: c.id, nombre: c.nombre }]
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {lista.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chip${estaSel(c.id) ? ' chip--on' : ''}`}
          onClick={() => alternar(c)}
        >
          {c.nombre}
        </button>
      ))}
    </div>
  );
}

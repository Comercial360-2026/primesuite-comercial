import { useLocation, useNavigate } from 'react-router-dom';
import { haceRelativo } from '@/lib/fechas';
import { desde } from '@/lib/volver-a';
import { Icono } from '@/components/ui/iconos';
import { useVisitasSinCerrar } from '@/hooks/use-visitas-sin-cerrar';

// Línea de aviso arriba de la ficha de cliente / proyecto: "N visita(s) sin
// cerrar — ábrela". Las visitas abiertas no se cierran solas (ver
// migración 102), así que se empuja a cerrarlas desde donde el comercial
// mira el cliente. Con una, enlaza directo a esa visita; con varias, a Hoy.
export function AvisoVisitasSinCerrar({
  clienteId,
  proyectoId,
}: {
  clienteId?: string;
  proyectoId?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useVisitasSinCerrar({ clienteId, proyectoId });
  if (!data || data.total === 0) return null;

  const una = data.total === 1;
  return (
    <div
      className="ficha-vitals"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 'var(--text-xs)', color: 'var(--warning-600)',
      }}
    >
      <Icono nombre="atencion" size={13} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {una ? (
          <>
            1 visita sin cerrar
            {data.primeraDesde && <> · abierta {haceRelativo(data.primeraDesde)}</>}.
          </>
        ) : (
          <>{data.total} visitas sin cerrar.</>
        )}
      </span>
      <button
        type="button"
        onClick={() =>
          navigate(una && data.primeraId ? `/visita/${data.primeraId}` : '/', {
            state: desde(location),
          })
        }
        style={{
          flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer',
          color: 'var(--brand-600)', font: 'inherit', fontSize: 'var(--text-xs)',
          display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2,
        }}
      >
        {una ? 'Abrir' : 'Verlas'}
        <Icono nombre="chevron" size={16} />
      </button>
    </div>
  );
}

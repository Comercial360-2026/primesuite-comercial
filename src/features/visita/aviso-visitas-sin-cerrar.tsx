import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { desdeHace } from '@/lib/fechas';
import { desde } from '@/lib/volver-a';
import { Icono } from '@/components/ui/iconos';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitasSinCerrar } from '@/hooks/use-visitas-sin-cerrar';
import { PanelVisitasAbiertas } from './panel-visitas-abiertas';

// Línea de aviso arriba de la ficha de cliente / proyecto: "N visita(s) sin
// cerrar". Las visitas abiertas no se cierran solas (ver migración 102), así
// que se empuja a cerrarlas desde donde el comercial mira el cliente.
//   · 1 visita  → enlaza directo a esa visita.
//   · 2+        → abre un panel con la lista SIN salir de esta pantalla;
//                 desde ahí se va, se cierra o se descarta cada una.
export function AvisoVisitasSinCerrar({
  clienteId,
  proyectoId,
}: {
  clienteId?: string;
  proyectoId?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { comercial } = useSesionActual();
  const { data } = useVisitasSinCerrar({ clienteId, proyectoId, comercialId: comercial?.id });
  const [panelAbierto, setPanelAbierto] = useState(false);

  if (!data || data.total === 0) return null;

  const una = data.total === 1;
  return (
    <>
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
              {data.primeraDesde && <> · abierta {desdeHace(data.primeraDesde)}</>}.
            </>
          ) : (
            <>{data.total} visitas sin cerrar.</>
          )}
        </span>
        <button
          type="button"
          onClick={() =>
            una && data.primeraId
              ? navigate(`/visita/${data.primeraId}`, { state: desde(location) })
              : setPanelAbierto(true)
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

      {panelAbierto && (
        <PanelVisitasAbiertas visitas={data.lista} onCerrar={() => setPanelAbierto(false)} />
      )}
    </>
  );
}

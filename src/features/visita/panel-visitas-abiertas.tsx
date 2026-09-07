import { useLocation, useNavigate } from 'react-router-dom';
import { desde } from '@/lib/volver-a';
import { useBorrarVisita } from '@/hooks/use-borrar-visita';
import { Modal } from '@/components/ui/modal';
import { FilaVisitaAbierta, type VisitaAbierta } from './fila-visita-abierta';
import { ConfirmarBorradoVisita } from './confirmar-borrado-visita';

// El panel que abre el aviso de "N visitas sin cerrar". No navega fuera:
// enseña la lista donde estabas. Desde cada fila puedes ir a la visita,
// cerrarla (flujo de cierre) o descartarla (borrado con confirmación de qué
// arrastra). Mismo panel en la visita en curso y en las fichas.
export function PanelVisitasAbiertas({
  visitas,
  onCerrar,
}: {
  visitas: VisitaAbierta[];
  onCerrar: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const borrar = useBorrarVisita();
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  // Más antigua primero: la que más urge cerrar, arriba.
  const ordenadas = [...visitas].sort((a, b) => {
    const ta = a.desde ? new Date(a.desde).getTime() : Infinity;
    const tb = b.desde ? new Date(b.desde).getTime() : Infinity;
    return ta - tb;
  });

  function irA(id: string) {
    onCerrar();
    navigate(`/visita/${id}`, { state: desde(location) });
  }
  function cerrarVisita(id: string) {
    onCerrar();
    navigate(`/visita/${id}/cierre`, { state: desde(location) });
  }

  return (
    <Modal titulo="visitas abiertas sin cerrar" onCerrar={onCerrar}>
      {ordenadas.length === 0 ? (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', margin: '10px 0 4px' }}>
          Ya no queda ninguna visita abierta.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 8,
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          {!online && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
              Sin conexión: cerrar y descartar no están disponibles ahora.
            </div>
          )}
          {ordenadas.map((v) =>
            borrar.visitaBorrarId === v.id ? (
              <ConfirmarBorradoVisita key={v.id} ctrl={borrar} />
            ) : (
              <FilaVisitaAbierta
                key={v.id}
                visita={v}
                puedeAccionar={online}
                onAbrir={() => irA(v.id)}
                onCerrar={() => cerrarVisita(v.id)}
                onDescartar={() => void borrar.pedir(v.id)}
              />
            )
          )}
        </div>
      )}
    </Modal>
  );
}

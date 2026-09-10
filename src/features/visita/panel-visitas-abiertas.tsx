import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { desde } from '@/lib/volver-a';
import { useBorrarVisita } from '@/hooks/use-borrar-visita';
import { Modal } from '@/components/ui/modal';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { FilaVisitaAbierta, type VisitaAbierta } from './fila-visita-abierta';

// El panel que abre el aviso de "N visitas sin cerrar". No navega fuera:
// enseña la lista donde estabas. Cada fila abre la visita; cerrar y descartar
// van por el modo "Seleccionar" (casillas + BarraSeleccion), no botones por
// fila. Mismo panel en la visita en curso y en las fichas.
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

  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  // Más antigua primero: la que más urge cerrar, arriba. Solo las propias son
  // seleccionables (a las de otro comercial no se les puede hacer nada).
  const ordenadas = [...visitas].sort((a, b) => {
    const ta = a.desde ? new Date(a.desde).getTime() : Infinity;
    const tb = b.desde ? new Date(b.desde).getTime() : Infinity;
    return ta - tb;
  });
  const propias = ordenadas.filter((v) => v.esMia ?? true);

  useEffect(() => {
    setMarcadas((prev) => {
      const vivos = new Set(propias.map((v) => v.id));
      const filtrado = [...prev].filter((id) => vivos.has(id));
      return filtrado.length === prev.size ? prev : new Set(filtrado);
    });
  }, [propias]);

  const marcadasArr = [...marcadas];

  function salirSeleccion() {
    setSeleccionando(false);
    setMarcadas(new Set());
    setConfirmandoDescarte(false);
  }
  function toggleMarcada(id: string) {
    setMarcadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function irA(id: string) {
    onCerrar();
    navigate(`/visita/${id}`, { state: desde(location) });
  }

  return (
    <Modal titulo="visitas abiertas sin cerrar" onCerrar={onCerrar}>
      {ordenadas.length === 0 ? (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', margin: '10px 0 4px' }}>
          Ya no queda ninguna visita abierta.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {!online && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
              Sin conexión: cerrar y descartar no están disponibles ahora.
            </div>
          )}

          {!seleccionando && propias.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="chip" onClick={() => setSeleccionando(true)}>
                Seleccionar
              </button>
            </div>
          )}

          {seleccionando && !confirmandoDescarte && (
            <BarraSeleccion
              n={marcadasArr.length}
              onCancelar={salirSeleccion}
              acciones={[
                {
                  etiqueta: 'Cerrar',
                  icono: 'check',
                  disabled: marcadasArr.length !== 1 || !online,
                  onClick: () => {
                    const id = marcadasArr[0];
                    onCerrar();
                    navigate(`/visita/${id}/cierre`, { state: desde(location) });
                  },
                },
                {
                  etiqueta: `Descartar${marcadasArr.length ? ` (${marcadasArr.length})` : ''}`,
                  icono: 'borrar',
                  tono: 'riesgo',
                  disabled: marcadasArr.length === 0 || !online,
                  onClick: () => setConfirmandoDescarte(true),
                },
              ]}
            />
          )}

          {confirmandoDescarte && (
            <ConfirmacionBorrado
              confirmar={`Sí, descartar ${marcadasArr.length}`}
              cargandoTexto="Descartando…"
              cargando={borrar.borrando.cargando}
              error={borrar.borrando.error}
              onCancelar={() => setConfirmandoDescarte(false)}
              onConfirmar={async () => {
                await borrar.borrarVarias(marcadasArr);
                salirSeleccion();
              }}
            >
              Se descartan {marcadasArr.length} {marcadasArr.length === 1 ? 'visita' : 'visitas'} y todo su
              contenido (fotos, audios, notas, hallazgos, oportunidades…).
            </ConfirmacionBorrado>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
            {ordenadas.map((v) => (
              <FilaVisitaAbierta
                key={v.id}
                visita={v}
                onAbrir={() => irA(v.id)}
                seleccion={
                  seleccionando
                    ? { activa: true, marcada: marcadas.has(v.id), onToggle: () => toggleMarcada(v.id) }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAvisosParticipacion } from '@/hooks/use-avisos-participacion';
import { Aviso } from '@/components/ui/aviso';
import { fechaCorta } from '@/lib/fechas';
import { esSinRed } from '@/lib/red';

// Invitaciones a una visita de equipo sin contestar, arriba en Hoy: antes solo
// salían en Yo (con un punto en la pestaña) y quien no entraba allí no sabía que
// tenía que aceptar. Mientras no se acepta, la visita NO cuenta como «en curso»
// suya (no frena «Iniciar visita»). Aceptar una visita ya en curso lleva a ella.
export function InvitacionesHoy() {
  const { invitaciones, aceptar, rechazar } = useAvisosParticipacion();
  const navigate = useNavigate();
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (invitaciones.length === 0) return null;

  async function resolver(id: string, accion: () => Promise<void>, alAcabar?: () => void) {
    setProcesando(id);
    setError(null);
    try {
      await accion();
      alAcabar?.();
    } catch (err) {
      setError(esSinRed(err) ? 'Sin conexión. Inténtalo cuando tengas red.' : 'No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {invitaciones.map((inv) => (
        <div key={inv.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Aviso tipo="info" titulo={`${inv.anadidoPorNombre} te ha añadido a una visita`}>
            {inv.clienteNombre} · {fechaCorta(inv.fechaVisita)}
            {inv.enCurso ? ' · ya en curso' : ''}
          </Aviso>
          <div className="fila-btns">
            <button
              type="button"
              className="btn btn-primary"
              disabled={procesando === inv.id}
              onClick={() =>
                resolver(inv.id, () => aceptar(inv.id), inv.enCurso ? () => navigate(`/visita/${inv.visitaId}`) : undefined)
              }
            >
              {procesando === inv.id ? 'Guardando…' : inv.enCurso ? 'Aceptar y abrir' : 'Aceptar'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={procesando === inv.id}
              onClick={() => resolver(inv.id, () => rechazar(inv.id))}
            >
              Rechazar
            </button>
          </div>
        </div>
      ))}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uuid } from '@/lib/uuid';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAvisoVisitaEnCurso } from '@/hooks/use-aviso-visita-en-curso';
import { ObjetivoVisitaModal } from '@/features/visita/objetivo-visita-modal';
import { VisitaEnCursoModal } from '@/features/visita/visita-en-curso-modal';
import { Icono } from '@/components/ui/iconos';
import type { ProyectoDelCliente } from '@/hooks/use-proyectos-cliente';

// La barra fija de abajo de un proyecto: dos botones en la misma línea —
// "Iniciar visita" (primario, lo diario) y "Planificar otro día" (secundario,
// abre el flujo único /planificar ya apuntando a este cliente y proyecto).
// Son acciones hermanas, no una principal + una escondida. Se comparte entre
// la Ficha de proyecto y la Ficha de cliente (ver actividad-proyecto.tsx). Va
// como hermano de `.screen__scroll` para quedar fija.

interface Props {
  clienteId: string;
  /** Proyecto de partida: el que se usa si no hay que elegir (ficha de
   *  proyecto) y el preseleccionado si sí (ficha de cliente → el General). */
  proyectoId: string;
  clienteNombre?: string;
  /** Todos los proyectos del cliente. Solo lo pasa la ficha de cliente: con
   *  2+, la ventana "¿A qué vas?" pide a cuál va la visita. La ficha de un
   *  proyecto concreto no lo pasa — allí la visita va a ese proyecto. */
  proyectos?: ProyectoDelCliente[];
}

export function AccionesProyecto({ clienteId, proyectoId, clienteNombre, proyectos }: Props) {
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const { iniciarVisita } = useVisitaActivaContext();
  const { encolar } = useSyncQueue(undefined);

  // Ventana "¿A qué vas?" antes de arrancar una visita sobre la marcha — el
  // objetivo es obligatorio también aquí, igual que al planificar. Si ya hay
  // una visita en curso con este cliente (en cualquiera de sus proyectos),
  // se avisa antes (enCursoModal).
  const [objetivoAdHocAbierto, setObjetivoAdHocAbierto] = useState(false);
  const [enCursoModalAbierto, setEnCursoModalAbierto] = useState(false);
  const { data: visitaEnCurso } = useAvisoVisitaEnCurso(clienteId, comercial?.id);

  function pedirIniciarVisitaAdHoc() {
    if (visitaEnCurso) setEnCursoModalAbierto(true);
    else setObjetivoAdHocAbierto(true);
  }

  // La lanza la ventana "¿A qué vas?" (ObjetivoVisitaModal) — de ahí llega el
  // `objetivo`, ya validado como no vacío. Lanza en caso de fallo para que la
  // propia ventana muestre el error; si va bien, navega y la ventana se
  // desmonta con la pantalla.
  async function iniciarVisitaAdHoc(objetivo: string, proyectoElegido: string) {
    if (!comercial) {
      throw new Error('No se ha podido identificar tu sesión. Recarga la página.');
    }
    const visitaId = uuid();
    await encolar(visitaId, 'visita', {
      clienteId,
      proyectoId: proyectoElegido || proyectoId,
      comercialResponsableId: comercial.id,
      tipoVisita: null,
      objetivo,
    });
    iniciarVisita({ id: visitaId, clienteNombre: clienteNombre ?? '' });
    navigate(`/visita/${visitaId}`);
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={pedirIniciarVisitaAdHoc}
        >
          Iniciar visita
          <Icono nombre="chevron" size={18} />
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={() => navigate(`/planificar?clienteId=${clienteId}&proyectoId=${proyectoId}`)}
        >
          Planificar otro día
        </button>
      </div>

      {enCursoModalAbierto && visitaEnCurso && (
        <VisitaEnCursoModal
          clienteNombre={visitaEnCurso.clienteNombre}
          objetivo={visitaEnCurso.objetivo}
          onContinuar={() => navigate(`/visita/${visitaEnCurso.id}`)}
          onEmpezarOtra={() => {
            setEnCursoModalAbierto(false);
            setObjetivoAdHocAbierto(true);
          }}
          onCerrar={() => setEnCursoModalAbierto(false)}
        />
      )}

      {objetivoAdHocAbierto && (
        <ObjetivoVisitaModal
          clienteNombre={clienteNombre}
          proyectos={proyectos}
          proyectoInicial={proyectoId}
          onConfirmar={iniciarVisitaAdHoc}
          onCerrar={() => setObjetivoAdHocAbierto(false)}
        />
      )}
    </>
  );
}

import { supabase } from '@/lib/supabase-client';

// Consolidación de la visita es un UPDATE, no un INSERT — el resto de la
// cola offline (db.ts/sync-engine.ts) solo modela creación de registros
// nuevos (ver 09_arquitectura_tecnica.md §4 y la decisión ya cerrada de no
// tocar más infraestructura). Este único caso se resuelve con un intento
// directo + reintento ligero en localStorage si no hay red en el momento
// del cierre — es una corrección puntual, no una ampliación del motor de
// sincronización.
//
// BUG real (auditoría 20 sept): la versión anterior solo registraba un
// listener 'online' vivo mientras la pestaña de cierre seguía montada. Si
// el comercial cerraba la app justo después de cerrar la visita sin
// conexión (el gesto más natural tras terminar), el listener desaparecía
// con la pestaña y la clave quedaba huérfana en localStorage para siempre
// — la visita seguía 'en_curso' en el servidor sin que nada lo detectara.
// `reanudarConsolidacionesPendientes()` retoma cualquier clave que quede al
// arrancar la app, sobreviviendo a ese cierre.

const PREFIJO = 'consolidar-pendiente-';

interface ParcheCierre {
  estado_captura: 'consolidada';
  resumen_texto?: string;
  resumen_origen?: 'reglas';
}

async function intentarUnaVez(visitaId: string): Promise<void> {
  const clave = PREFIJO + visitaId;
  const pendiente = localStorage.getItem(clave);
  if (!pendiente) return;
  // Sin comprobar `count`, un UPDATE bloqueado por RLS "tendría éxito" con 0
  // filas: se borraría el pendiente de localStorage sin haber consolidado
  // de verdad. Mejor seguir reintentando (no se pierde el dato) que darlo
  // por hecho en falso.
  const { error, count } = await supabase
    .from('visita')
    .update(JSON.parse(pendiente) as ParcheCierre, { count: 'exact' })
    .eq('id', visitaId);
  if (!error && count) localStorage.removeItem(clave);
}

function programarReintento(visitaId: string): void {
  const reintentar = () => {
    void intentarUnaVez(visitaId).then(() => {
      if (!localStorage.getItem(PREFIJO + visitaId)) {
        window.removeEventListener('online', reintentar);
      }
    });
  };
  window.addEventListener('online', reintentar);
}

/** Guarda un cierre de visita pendiente de confirmar con el servidor
 *  (llamado justo al cerrarla sin conexión) y programa su reintento. */
export function guardarConsolidacionPendiente(visitaId: string, parche: ParcheCierre): void {
  localStorage.setItem(PREFIJO + visitaId, JSON.stringify(parche));
  programarReintento(visitaId);
}

/** Llamar una vez al arrancar la app: retoma cualquier cierre que quedó a
 *  medias en una sesión anterior (pestaña cerrada antes de reconectar). */
export function reanudarConsolidacionesPendientes(): void {
  const visitaIds: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    if (clave?.startsWith(PREFIJO)) visitaIds.push(clave.slice(PREFIJO.length));
  }
  for (const visitaId of visitaIds) {
    if (navigator.onLine) void intentarUnaVez(visitaId);
    programarReintento(visitaId);
  }
}

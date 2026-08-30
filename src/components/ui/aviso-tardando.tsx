// Aviso de "sigue en marcha" para acciones que se alargan por mala
// conexión — se muestra cuando useAccionAsync marca `tardando` (a los 8 s).
// Es solo información: la acción no se ha cancelado. Texto, no color: varios
// usuarios no distinguen bien el color, así que el mensaje se explica solo.
export function AvisoTardando({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
      La conexión va lenta. Sigue en marcha, no hace falta que vuelvas a pulsar.
    </div>
  );
}

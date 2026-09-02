import { Icono, type NombreIcono } from './iconos';

// Semáforo del cliente (vw_semaforo_cliente.semaforo). Se pintaba como un
// `chip chip--verde/amarillo/rojo` con la palabra "verde"/"rojo" dentro —
// solo color, y el usuario es daltónico: verde y rojo se le ven casi
// iguales. Ahora cada estado lleva una FORMA distinta y una palabra que
// dice algo; el color solo refuerza.
//
// Las palabras dicen QUÉ dispara el semáforo en la vista, para que un
// comercial lo entienda sin pensar (antes ponía "En riesgo" — ¿riesgo de
// qué?):
//   verde   = hay una oportunidad abierta con el cliente
//   amarillo = sin oportunidad, pero visitado en los últimos 3 meses
//   rojo    = sin oportunidad y sin visita en +3 meses (o nunca)
// Si la lógica de vw_semaforo_cliente cambia, se retoca aquí.

type Semaforo = 'verde' | 'amarillo' | 'rojo';

// Palabras cortas — el chip va al lado del nombre del cliente en una lista
// estrecha, no puede partirse en dos líneas.
const MAPA: Record<Semaforo, { icono: NombreIcono; palabra: string; clase: string }> = {
  verde: { icono: 'check-circulo', palabra: 'Con oportunidad', clase: 'chip--verde' },
  amarillo: { icono: 'guion', palabra: 'En seguimiento', clase: 'chip--amarillo' },
  rojo: { icono: 'atencion', palabra: 'Sin visitar', clase: 'chip--rojo' },
};

export function EtiquetaSemaforo({ valor }: { valor: string | null | undefined }) {
  const conf = valor ? MAPA[valor as Semaforo] : undefined;
  if (!conf) return null;
  return (
    <span className={`chip ${conf.clase}`}>
      <Icono nombre={conf.icono} size={14} />
      {conf.palabra}
    </span>
  );
}

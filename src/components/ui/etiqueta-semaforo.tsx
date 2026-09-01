import { Icono, type NombreIcono } from './iconos';

// Semáforo del cliente (vw_semaforo_cliente.semaforo). Se pintaba como un
// `chip chip--verde/amarillo/rojo` con la palabra "verde"/"rojo" dentro —
// solo color, y el usuario es daltónico: verde y rojo se le ven casi
// iguales. Ahora cada estado lleva una FORMA distinta y una palabra que
// dice algo; el color solo refuerza.
//
// Nota: las palabras son una lectura de lo que dispara el semáforo en la
// vista (verde = tiene oportunidad activa; amarillo = visita reciente;
// rojo = ninguna de las dos). Si no encajan, se cambian aquí.

type Semaforo = 'verde' | 'amarillo' | 'rojo';

const MAPA: Record<Semaforo, { icono: NombreIcono; palabra: string; clase: string }> = {
  verde: { icono: 'check-circulo', palabra: 'Al día', clase: 'chip--verde' },
  amarillo: { icono: 'guion', palabra: 'Seguimiento', clase: 'chip--amarillo' },
  rojo: { icono: 'atencion', palabra: 'En riesgo', clase: 'chip--rojo' },
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

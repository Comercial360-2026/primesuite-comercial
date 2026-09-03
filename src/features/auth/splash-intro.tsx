import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { LogoPrimion, LogoPrimeNotes } from '@/components/marca/marca';
import { Icono, type NombreIcono } from '@/components/ui/iconos';

// Intro breve antes del login (ver storyboard en la memoria del proyecto).
// 7 beats en ~3,4 s, movimiento vectorial plano, azul de marca + un acento
// cálido. Se ve UNA vez por sesión, se salta con un toque, y con
// "reducir movimiento" activado no se reproduce.
//
//   1 Primion aparece
//   2 de Primion emerge PrimeNotes
//   3 actividad comercial (nota · cliente · visita · tarea · agenda)
//   4 esa actividad converge hacia la marca
//   5 la cámara entra en la app
//   6 aterriza en el login (este componente se desmonta, el login ya está debajo)
//
// El login se renderiza siempre debajo; esto es solo una capa por encima.

const CLAVE_SESION = 'primenotes:intro-vista';

// Glifos que orbitan en el beat 3. Ángulo en grados (0 = derecha, sentido
// horario) y radio en % de la escena.
const ACTIVIDAD: { icono: NombreIcono; ang: number; rad: number }[] = [
  { icono: 'nota', ang: -125, rad: 58 },
  { icono: 'clientes', ang: -55, rad: 70 },
  { icono: 'hoy', ang: 55, rad: 70 },
  { icono: 'tareas', ang: 125, rad: 58 },
  { icono: 'recorrido', ang: 180, rad: 64 },
];

// Beat → ms en el que empieza.
const BEATS = [0, 180, 900, 1650, 2850, 3450];
const FIN_MS = 4100;

export function debeVerseIntro(): boolean {
  // `?intro=1` la fuerza (para previsualizarla); `?intro=0` la salta.
  if (typeof window !== 'undefined') {
    const p = new URLSearchParams(window.location.search).get('intro');
    if (p === '1') return true;
    if (p === '0') return false;
  }
  try {
    if (sessionStorage.getItem(CLAVE_SESION)) return false;
  } catch {
    /* modo incógnito estricto: se muestra igual */
  }
  const menos =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !menos;
}

function marcarVista() {
  try {
    sessionStorage.setItem(CLAVE_SESION, '1');
  } catch {
    /* no pasa nada: como mucho se vuelve a ver en la siguiente carga */
  }
}

export function SplashIntro({ onDone }: { onDone: () => void }) {
  const [beat, setBeat] = useState(0);
  const [saliendo, setSaliendo] = useState(false);
  const hecho = useRef(false);

  function terminar() {
    if (hecho.current) return;
    hecho.current = true;
    marcarVista();
    setSaliendo(true);
    // Deja acabar el desvanecido antes de desmontar.
    window.setTimeout(onDone, 380);
  }

  useEffect(() => {
    const timers = BEATS.map((ms, i) => window.setTimeout(() => setBeat(i + 1), ms));
    timers.push(window.setTimeout(terminar, FIN_MS));
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`splash${saliendo ? ' splash--fuera' : ''}`}
      data-beat={beat}
      onClick={terminar}
      role="button"
      tabIndex={0}
      aria-label="Saltar la introducción"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') terminar();
      }}
    >
      <div className="splash__escena">
        <div className="splash__primion">
          <LogoPrimion alto={44} />
        </div>

        <div className="splash__marca">
          <LogoPrimeNotes alto={52} />
        </div>

        <div className="splash__actividad" aria-hidden="true">
          {ACTIVIDAD.map((a, i) => {
            const rad = (a.ang * Math.PI) / 180;
            // Offsets en px sobre la escena (una translate en % iría contra
            // el tamaño del propio glifo, no el de la escena).
            return (
              <span
                key={a.icono}
                className="splash__glifo"
                style={
                  {
                    '--x': `${Math.round(Math.cos(rad) * a.rad * 1.7)}px`,
                    '--y': `${Math.round(Math.sin(rad) * a.rad * 1.35)}px`,
                    '--i': i,
                  } as CSSProperties
                }
              >
                <Icono nombre={a.icono} size={22} />
              </span>
            );
          })}
        </div>
      </div>

      <span className="splash__saltar">Saltar</span>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icono } from './iconos';

// Cabecera plegable "Título (N)" para la pantalla Hoy: un toque despliega la
// lista, otro la contrae. Con 0 elementos se muestra en gris y no se puede
// abrir — la estructura (En curso / Mañana / Tarde / Sin hora / Próximas) es
// fija cada día aunque alguna sección esté vacía.
//
// `defaultAbierta` puede llegar en `false` y pasar a `true` cuando las
// consultas terminan de cargar (p. ej. "En curso" no sabe cuántas hay hasta
// que resuelve el filtro "solo mías"). Mientras el usuario no toque la
// sección a mano, ésta sigue a `defaultAbierta`; en cuanto la toca, deja de
// seguirlo. Al desmontar (salir de Hoy y volver) se reinicia.

interface Props {
  titulo: ReactNode;
  cantidad: number;
  defaultAbierta?: boolean;
  /** `aviso` = urgente (p. ej. "Atrasadas"): borde y título en ámbar, sin
   *  depender de un emoji suelto en el propio texto del título. */
  tono?: 'aviso';
  /** Por defecto, con 0 elementos la sección se ve en gris y no abre (uso
   *  original en Hoy: la estructura del día es fija). Con `siempreAbrible`
   *  la sección abre aunque esté a 0 —hace falta cuando dentro hay un
   *  botón "+ añadir" para crear el primer elemento (Detalle de
   *  oportunidad: "Términos y soluciones"). */
  siempreAbrible?: boolean;
  /** Clave para recordar abierta/cerrada en esta pestaña (sessionStorage): al ir a una ficha y volver, la
   *  sección sigue como la dejaste (la pantalla se desmonta al navegar y, si no, vuelve plegada). */
  recordarComo?: string;
  /** Texto breve a la derecha del título en lugar de «(N)» (un resumen de lo que hay dentro). */
  detalle?: ReactNode;
  children?: ReactNode;
}

const leerRecordada = (clave?: string): boolean | null => {
  if (!clave) return null;
  try {
    const v = sessionStorage.getItem(`colapsable:${clave}`);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
};

export function SeccionColapsable({ titulo, cantidad, defaultAbierta = false, tono, siempreAbrible, recordarComo, detalle, children }: Props) {
  const [recordada] = useState(() => leerRecordada(recordarComo));
  const [abierta, setAbierta] = useState(recordada ?? defaultAbierta);
  const tocadoPorUsuario = useRef(recordada !== null);
  const vacia = cantidad === 0 && !siempreAbrible;

  useEffect(() => {
    if (!tocadoPorUsuario.current) setAbierta(defaultAbierta);
  }, [defaultAbierta]);

  const alternar = () => {
    tocadoPorUsuario.current = true;
    if (recordarComo) {
      try {
        sessionStorage.setItem(`colapsable:${recordarComo}`, abierta ? '0' : '1');
      } catch {
        /* sin sessionStorage: solo no se recuerda */
      }
    }
    setAbierta(!abierta);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        className={`card${tono === 'aviso' ? ' card--aviso' : ''}${abierta && !vacia ? ' card--colapsable-abierta' : ''}`}
        role="button"
        tabIndex={vacia ? -1 : 0}
        aria-expanded={abierta}
        onClick={vacia ? undefined : alternar}
        onKeyDown={
          vacia
            ? undefined
            : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  alternar();
                }
              }
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: vacia ? 'default' : 'pointer',
          opacity: vacia ? 0.5 : 1,
        }}
      >
        <span style={{ fontSize: 'var(--text-md)', fontWeight: abierta && !vacia ? 600 : 500, color: tono === 'aviso' ? 'var(--warning-600)' : abierta && !vacia ? 'var(--brand-600)' : undefined }}>
          {titulo}{' '}
          <span style={{ color: 'var(--ink-400)', fontWeight: 400 }}>{detalle !== undefined ? detalle : `(${cantidad})`}</span>
        </span>
        {!vacia && (
          <span
            style={{
              color: 'var(--ink-400)',
              display: 'flex',
              transform: abierta ? 'rotate(90deg)' : 'none',
              transition: 'transform 120ms ease',
              flexShrink: 0,
            }}
          >
            <Icono nombre="chevron" size={18} />
          </span>
        )}
      </div>
      {abierta && !vacia && (
        <div className="colapsable-contenido">{children}</div>
      )}
    </div>
  );
}

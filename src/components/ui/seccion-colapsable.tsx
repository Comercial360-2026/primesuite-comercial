import { useEffect, useRef, useState, type ReactNode } from 'react';

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
  titulo: string;
  cantidad: number;
  defaultAbierta?: boolean;
  children?: ReactNode;
}

export function SeccionColapsable({ titulo, cantidad, defaultAbierta = false, children }: Props) {
  const [abierta, setAbierta] = useState(defaultAbierta);
  const tocadoPorUsuario = useRef(false);
  const vacia = cantidad === 0;

  useEffect(() => {
    if (!tocadoPorUsuario.current) setAbierta(defaultAbierta);
  }, [defaultAbierta]);

  const alternar = () => {
    tocadoPorUsuario.current = true;
    setAbierta((v) => !v);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        className="card"
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
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}>
          {titulo} <span style={{ color: 'var(--ink-400)', fontWeight: 400 }}>({cantidad})</span>
        </span>
        {!vacia && (
          <span
            style={{
              fontSize: 20,
              color: 'var(--ink-400)',
              transform: abierta ? 'rotate(90deg)' : 'none',
              transition: 'transform 120ms ease',
              flexShrink: 0,
            }}
          >
            ›
          </span>
        )}
      </div>
      {abierta && !vacia && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8 }}>{children}</div>
      )}
    </div>
  );
}

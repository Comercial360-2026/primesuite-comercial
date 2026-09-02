import { useMemo, useState } from 'react';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { PANTALLAS, CONCEPTOS } from '@/lib/ayuda';

// Pantalla /ayuda — "Cómo funciona PrimeNotes". No se escribe a mano: recorre
// los mapas de `ayuda.ts`, así que cada entrada nueva aparece aquí sola.
// Filtra por rol (un comercial no ve las pantallas de Dirección) y deja
// buscar por texto. Fila de entrada en "Yo".

function normaliza(s: string) {
  // Minúsculas y sin acentos, para que "camion" encuentre "camión".
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function Entrada({ titulo, cuerpo }: { titulo: string; cuerpo: { lb?: string; texto: string }[] }) {
  return (
    <article className="ayuda-entrada">
      <h3 className="ayuda-entrada__titulo">{titulo}</h3>
      {cuerpo.map((l, i) => (
        <p key={i} className={l.lb ? 'ayuda-entrada__meta' : undefined}>
          {l.lb && <strong>{l.lb}: </strong>}
          {l.texto}
        </p>
      ))}
    </article>
  );
}

export function AyudaManual() {
  const { comercial } = useSesionActual();
  const esDireccion = comercial?.rol === 'direccion_comercial';
  const [busqueda, setBusqueda] = useState('');
  const q = normaliza(busqueda.trim());

  const visible = (e: { soloDireccion?: boolean }) => esDireccion || !e.soloDireccion;

  const pantallas = useMemo(
    () =>
      Object.values(PANTALLAS)
        .filter(visible)
        .filter((e) => !q || normaliza(`${e.titulo} ${e.queEs} ${e.cuando} ${e.ojo ?? ''}`).includes(q)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esDireccion, q]
  );
  const conceptos = useMemo(
    () =>
      Object.values(CONCEPTOS)
        .filter(visible)
        .filter(
          (e) => !q || normaliza(`${e.titulo} ${e.queEs} ${e.cuando ?? ''} ${e.ejemplo ?? ''}`).includes(q)
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esDireccion, q]
  );

  const nada = pantallas.length === 0 && conceptos.length === 0;

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Cómo funciona PrimeNotes" />

      <input
        className="field"
        type="search"
        placeholder="Buscar…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {nada && (
        <p className="ayuda-manual__vacio">Nada coincide con «{busqueda}».</p>
      )}

      {pantallas.length > 0 && (
        <section>
          <h2 className="lbl-seccion">Pantallas</h2>
          <div className="ayuda-manual__grupo">
            {pantallas.map((e) => (
              <Entrada
                key={e.titulo}
                titulo={e.titulo}
                cuerpo={[
                  { texto: e.queEs },
                  { lb: 'Cuándo', texto: e.cuando },
                  ...(e.ojo ? [{ lb: 'Ojo', texto: e.ojo }] : []),
                ]}
              />
            ))}
          </div>
        </section>
      )}

      {conceptos.length > 0 && (
        <section>
          <h2 className="lbl-seccion">Conceptos</h2>
          <div className="ayuda-manual__grupo">
            {conceptos.map((e) => (
              <Entrada
                key={e.titulo}
                titulo={e.titulo}
                cuerpo={[
                  { texto: e.queEs },
                  ...(e.cuando ? [{ lb: 'Cuándo', texto: e.cuando }] : []),
                  ...(e.ejemplo ? [{ lb: 'Ejemplo', texto: e.ejemplo }] : []),
                ]}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { PANTALLAS, CONCEPTOS } from '@/lib/ayuda';

// Pantalla /ayuda — "Cómo funciona PrimeNotes". No se escribe a mano:
// recorre los mapas de `ayuda.ts`, así que cada entrada nueva aparece aquí
// sola. Filtra por rol (un comercial no ve las pantallas de Dirección) y
// deja buscar. Es un ÍNDICE plegable: de un vistazo se ven todos los
// títulos; se toca uno y se despliega su explicación. Cabecera y buscador
// fijos, el índice scrollea aparte y siempre arranca arriba.

function normaliza(s: string) {
  // Minúsculas y sin acentos, para que "camion" encuentre "camión".
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function ItemAyuda({
  titulo,
  cuerpo,
  abierto,
  onToggle,
}: {
  titulo: string;
  cuerpo: { lb?: string; texto: string }[];
  abierto: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="ayuda-item">
      <button type="button" className="ayuda-item__tit" aria-expanded={abierto} onClick={onToggle}>
        <span>{titulo}</span>
        <span className="ayuda-item__chevron" aria-hidden="true">{abierto ? '⌄' : '›'}</span>
      </button>
      {abierto && (
        <div className="ayuda-item__cuerpo">
          {cuerpo.map((l, i) => (
            <p key={i} className={l.lb ? 'ayuda-item__meta' : undefined}>
              {l.lb && <strong>{l.lb}: </strong>}
              {l.texto}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function AyudaManual() {
  const { comercial } = useSesionActual();
  const esDireccion = comercial?.rol === 'direccion_comercial';
  const [busqueda, setBusqueda] = useState('');
  // Título de la entrada abierta (uno a la vez). Al buscar se ignora: los
  // resultados salen desplegados para ver por qué casan.
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const q = normaliza(busqueda.trim());
  const buscando = q.length > 0;

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
  const estaAbierto = (titulo: string) => buscando || abiertoId === titulo;
  const alternar = (titulo: string) =>
    setAbiertoId((prev) => (prev === titulo ? null : titulo));

  return (
    <div className="screen screen--split">
      <CabeceraDetalle titulo="Cómo funciona PrimeNotes" />

      <input
        className="field"
        type="search"
        placeholder="Buscar…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <div className="screen__scroll">
        {nada && <p className="ayuda-manual__vacio">Nada coincide con «{busqueda}».</p>}

        {pantallas.length > 0 && (
          <section>
            <h2 className="lbl-seccion">Pantallas</h2>
            <div className="ayuda-manual__grupo">
              {pantallas.map((e) => (
                <ItemAyuda
                  key={e.titulo}
                  titulo={e.titulo}
                  abierto={estaAbierto(e.titulo)}
                  onToggle={() => alternar(e.titulo)}
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
                <ItemAyuda
                  key={e.titulo}
                  titulo={e.titulo}
                  abierto={estaAbierto(e.titulo)}
                  onToggle={() => alternar(e.titulo)}
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
    </div>
  );
}

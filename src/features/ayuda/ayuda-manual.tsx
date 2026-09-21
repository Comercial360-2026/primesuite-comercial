import { useMemo, useState } from 'react';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { useBuscador, BotonBuscar, CampoBuscar } from '@/components/ui/buscador';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { Icono, type NombreIcono } from '@/components/ui/iconos';
import { Aviso } from '@/components/ui/aviso';
import {
  PANTALLAS,
  CONCEPTOS,
  GRUPOS_PANTALLA,
  GRUPOS_CONCEPTO,
  type GrupoPantalla,
  type GrupoConcepto,
} from '@/lib/ayuda';

// Un icono por grupo — ayuda a escanear el índice sin leer cada etiqueta.
// Reutiliza los mismos iconos que ya representan ese flujo en el resto de
// la app (bottom nav, cabeceras), no unos nuevos solo para /ayuda.
const ICONO_GRUPO_PANTALLA: Record<GrupoPantalla, NombreIcono> = {
  dia: 'hoy',
  tu: 'yo',
  cliente: 'clientes',
  visita: 'ubicacion',
  registro: 'nota',
  direccion: 'equipo',
};
const ICONO_GRUPO_CONCEPTO: Record<GrupoConcepto, NombreIcono> = {
  visita: 'reproducir',
  oportunidad: 'oportunidad',
  planificar: 'paso',
  app: 'info',
};

// Pantalla /ayuda — "Cómo funciona PrimeNotes". No se escribe a mano:
// recorre los mapas de `ayuda.ts`, así que cada entrada nueva aparece aquí
// sola. Filtra por rol (un comercial no ve las pantallas de Dirección) y
// deja buscar. Es un ÍNDICE plegable: de un vistazo se ven todos los
// títulos; se toca uno y se despliega su explicación. Cabecera y buscador
// fijos, el índice scrollea aparte y siempre arranca arriba.
//
// El índice va agrupado por flujo de uso (GRUPOS_PANTALLA / GRUPOS_CONCEPTO
// de `ayuda.ts`), no alfabético: primero el día a día, luego un cliente,
// luego una visita de principio a fin, y al final lo de Dirección. Al
// buscar, los grupos vacíos no salen.

function normaliza(s: string) {
  // Minúsculas y sin acentos, para que "camion" encuentre "camión".
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function ItemAyuda({
  titulo,
  respuesta,
  bloques,
  ojo,
  abierto,
  onToggle,
}: {
  titulo: string;
  /** La respuesta directa (`queEs`) — lo primero que se lee, sin etiqueta. */
  respuesta: string;
  /** Detalles secundarios ("Cuándo", "Ejemplo…"), cada uno en su propio
   *  bloque con su etiqueta encima — nunca pegados en el mismo párrafo. */
  bloques: { lb: string; texto: string }[];
  /** El aviso de la entrada, si tiene — mismo componente que cualquier
   *  aviso de la app, no un color de texto suelto. */
  ojo?: string;
  abierto: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`ayuda-item${abierto ? ' ayuda-item--abierto' : ''}`}>
      <button type="button" className="ayuda-item__tit" aria-expanded={abierto} onClick={onToggle}>
        <span>{titulo}</span>
        <span className="ayuda-item__chevron" aria-hidden="true">›</span>
      </button>
      {abierto && (
        <div className="ayuda-item__cuerpo">
          <p className="ayuda-respuesta">{respuesta}</p>
          {bloques.map((b) => (
            <div className="ayuda-bloque" key={b.lb}>
              <span className="ayuda-bloque__lb">{b.lb}</span>
              <p className="ayuda-bloque__texto">{b.texto}</p>
            </div>
          ))}
          {ojo && (
            <Aviso tipo="atencion" titulo="Ojo">
              {ojo}
            </Aviso>
          )}
        </div>
      )}
    </div>
  );
}

export function AyudaManual() {
  const { comercial } = useSesionActual();
  const esDireccion = comercial?.rol === 'direccion_comercial';
  const [busqueda, setBusqueda] = useState('');
  const buscador = useBuscador(!!busqueda);
  // Título de la entrada abierta (uno a la vez). Al buscar se ignora: los
  // resultados salen desplegados para ver por qué casan.
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const q = normaliza(busqueda.trim());
  const buscando = q.length > 0;

  const visible = (e: { soloDireccion?: boolean }) => esDireccion || !e.soloDireccion;

  // `clave` es la clave real del Record (p. ej. "ficha-cliente"), no el
  // título — antes se indexaba "abierto"/la key de React por título, frágil
  // si dos entradas de Pantallas/Conceptos llegaran a compartir texto.
  const pantallas = useMemo(
    () =>
      Object.entries(PANTALLAS)
        .map(([clave, e]) => ({ clave, ...e }))
        .filter(visible)
        .filter((e) => !q || normaliza(`${e.titulo} ${e.queEs} ${e.cuando} ${e.ojo ?? ''}`).includes(q)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esDireccion, q]
  );
  const conceptos = useMemo(
    () =>
      Object.entries(CONCEPTOS)
        .map(([clave, e]) => ({ clave, ...e }))
        .filter(visible)
        .filter(
          (e) => !q || normaliza(`${e.titulo} ${e.queEs} ${e.cuando ?? ''} ${e.ejemplo ?? ''}`).includes(q)
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esDireccion, q]
  );

  const nada = pantallas.length === 0 && conceptos.length === 0;
  const estaAbierto = (clave: string) => buscando || abiertoId === clave;
  const alternar = (clave: string) =>
    setAbiertoId((prev) => (prev === clave ? null : clave));

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo="Cómo funciona PrimeNotes"
        volverA="/yo"
        derecha={!buscador.abierto && <BotonBuscar etiqueta="Buscar…" onClick={buscador.abrir} />}
      />

      {buscador.abierto && (
        <CampoBuscar
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar…"
          onCerrar={() => {
            setBusqueda('');
            buscador.cerrar();
          }}
        />
      )}

      <div className="screen__scroll">
        {nada && <p className="ayuda-manual__vacio">Nada coincide con «{busqueda}».</p>}

        {pantallas.length > 0 && (
          <section>
            <h2 className="lbl-seccion">Pantallas</h2>
            {GRUPOS_PANTALLA.map((g) => {
              const items = pantallas.filter((e) => e.grupo === g.id);
              if (items.length === 0) return null;
              return (
                <div key={g.id} className="ayuda-manual__bloque">
                  <h3 className="ayuda-manual__subgrupo">
                    <Icono nombre={ICONO_GRUPO_PANTALLA[g.id]} size={13} />
                    {g.titulo}
                  </h3>
                  <div className="ayuda-manual__grupo seccion-lista__grupo">
                    {items.map((e) => (
                      <ItemAyuda
                        key={e.clave}
                        titulo={e.titulo}
                        abierto={estaAbierto(e.clave)}
                        onToggle={() => alternar(e.clave)}
                        respuesta={e.queEs}
                        bloques={[{ lb: 'Cuándo', texto: e.cuando }]}
                        ojo={e.ojo}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {conceptos.length > 0 && (
          <section>
            <h2 className="lbl-seccion">Conceptos</h2>
            {GRUPOS_CONCEPTO.map((g) => {
              const items = conceptos.filter((e) => e.grupo === g.id);
              if (items.length === 0) return null;
              return (
                <div key={g.id} className="ayuda-manual__bloque">
                  <h3 className="ayuda-manual__subgrupo">
                    <Icono nombre={ICONO_GRUPO_CONCEPTO[g.id]} size={13} />
                    {g.titulo}
                  </h3>
                  <div className="ayuda-manual__grupo seccion-lista__grupo">
                    {items.map((e) => (
                      <ItemAyuda
                        key={e.clave}
                        titulo={e.titulo}
                        abierto={estaAbierto(e.clave)}
                        onToggle={() => alternar(e.clave)}
                        respuesta={e.queEs}
                        bloques={[
                          ...(e.cuando ? [{ lb: 'Cuándo', texto: e.cuando }] : []),
                          ...(e.ejemplo ? [{ lb: 'Ejemplo', texto: e.ejemplo }] : []),
                        ]}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { claveDuplicado } from '@/lib/nombres-cliente';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';

// Pantalla de Dirección Comercial para juntar fichas de cliente duplicadas.
// El motor de fusión ya vive en la base de datos: al poner
// cliente.estado_fusion = 'fusionado' con fusionado_en_id apuntando al
// maestro, el trigger fn_fusionar_cliente mueve visitas, oportunidades,
// hallazgos, ubicaciones, interlocutores y capturas al maestro, y la vista
// vw_semaforo_cliente agrupa por maestro (el duplicado desaparece solo de
// la lista de Clientes). Aquí solo falta el disparador desde la app.
//
// Alcance v1: agrupa por nombre normalizado, ignorando la coletilla
// jurídica final (S.L., S.A.…). Nada de coincidencia difusa — juntar dos
// negocios distintos por error es peor que dejar un duplicado. No hay
// deshacer desde la app (el trigger mueve los hijos sin registrar de dónde
// venían), por eso: (1) cada candidata muestra sector, dirección, nº de
// contactos y antigüedad para elegir la superviviente con conocimiento;
// (2) las fichas sin ningún dato se pueden "quitar" sin tocar la fusión de
// verdad; (3) el paso de confirmación con el recuento de lo que se mueve.

interface ClienteDup {
  id: string;
  nombre: string;
  creado_por: string | null;
  creado_en: string;
  sector: string | null;
  ubicacion: string | null;
  visitas: number;
  oportunidades: number;
  interlocutores: number;
  ubicaciones: number;
}

const esVacia = (c: ClienteDup) =>
  c.visitas === 0 && c.oportunidades === 0 && c.interlocutores === 0 && c.ubicaciones === 0;

type Grupo = { clave: string; clientes: ClienteDup[] };

export function Deduplicacion() {
  const queryClient = useQueryClient();
  const [maestroPorGrupo, setMaestroPorGrupo] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: clientes } = useQuery({
    queryKey: ['dedup-clientes'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('cliente')
        .select('id, nombre, creado_por, creado_en, estado_fusion, sector, ubicacion_general');
      if (err) throw err;
      return (data ?? []).filter((c) => c.estado_fusion === 'activo');
    },
  });

  // Conteos: se traen todas las filas de una columna y se cuentan en el
  // cliente. Es una tabla pequeña y una sola columna — más simple que una
  // consulta agregada por cada ficha.
  const { data: conteoVisitas } = useQuery({
    queryKey: ['dedup-conteo-visitas'],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('visita').select('cliente_id');
      if (err) throw err;
      const m: Record<string, number> = {};
      for (const v of data ?? []) m[v.cliente_id] = (m[v.cliente_id] ?? 0) + 1;
      return m;
    },
  });

  const { data: conteoOportunidades } = useQuery({
    queryKey: ['dedup-conteo-oportunidades'],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('oportunidad').select('cliente_id');
      if (err) throw err;
      const m: Record<string, number> = {};
      for (const o of data ?? []) m[o.cliente_id] = (m[o.cliente_id] ?? 0) + 1;
      return m;
    },
  });

  const { data: conteoInterlocutores } = useQuery({
    queryKey: ['dedup-conteo-interlocutores'],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('interlocutor').select('cliente_id');
      if (err) throw err;
      const m: Record<string, number> = {};
      for (const i of data ?? []) m[i.cliente_id] = (m[i.cliente_id] ?? 0) + 1;
      return m;
    },
  });

  const { data: conteoUbicaciones } = useQuery({
    queryKey: ['dedup-conteo-ubicaciones'],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('ubicacion').select('cliente_id');
      if (err) throw err;
      const m: Record<string, number> = {};
      for (const u of data ?? []) m[u.cliente_id] = (m[u.cliente_id] ?? 0) + 1;
      return m;
    },
  });

  const grupos = useMemo<Grupo[]>(() => {
    if (!clientes) return [];
    const porClave: Record<string, ClienteDup[]> = {};
    for (const c of clientes) {
      const cd: ClienteDup = {
        id: c.id,
        nombre: c.nombre,
        creado_por: c.creado_por,
        creado_en: c.creado_en,
        sector: c.sector,
        ubicacion: c.ubicacion_general,
        visitas: conteoVisitas?.[c.id] ?? 0,
        oportunidades: conteoOportunidades?.[c.id] ?? 0,
        interlocutores: conteoInterlocutores?.[c.id] ?? 0,
        ubicaciones: conteoUbicaciones?.[c.id] ?? 0,
      };
      (porClave[claveDuplicado(c.nombre)] ??= []).push(cd);
    }
    return Object.entries(porClave)
      .filter(([, cs]) => cs.length >= 2)
      .map(([clave, cs]) => ({
        clave,
        // Por defecto se propone como maestra la de más visitas; desempate,
        // la más antigua.
        clientes: [...cs].sort(
          (a, b) => b.visitas - a.visitas || a.creado_en.localeCompare(b.creado_en)
        ),
      }))
      .sort((a, b) => b.clientes.length - a.clientes.length || a.clave.localeCompare(b.clave));
  }, [clientes, conteoVisitas, conteoOportunidades, conteoInterlocutores, conteoUbicaciones]);

  const maestroDe = (g: Grupo) => maestroPorGrupo[g.clave] ?? g.clientes[0].id;

  async function fusionar(g: Grupo, opciones?: { soloVacias?: boolean }) {
    const maestroId = maestroDe(g);
    let duplicados = g.clientes.filter((c) => c.id !== maestroId);
    if (opciones?.soloVacias) duplicados = duplicados.filter(esVacia);
    if (duplicados.length === 0) return;
    setProcesando(g.clave);
    setError(null);
    // Uno a uno, no en una sola transacción: es una acción de administración
    // de bajo volumen. Si uno falla, los ya fusionados quedan bien y el
    // grupo se puede reintentar con lo que queda.
    for (const dup of duplicados) {
      const { error: err } = await supabase
        .from('cliente')
        .update({ estado_fusion: 'fusionado', fusionado_en_id: maestroId })
        .eq('id', dup.id);
      if (err) {
        setProcesando(null);
        setError(`No se pudo fusionar «${dup.nombre}»: ${err.message}`);
        return;
      }
    }
    setProcesando(null);
    setConfirmando(null);
    for (const key of [
      ['dedup-clientes'],
      ['dedup-conteo-visitas'],
      ['dedup-conteo-oportunidades'],
      ['dedup-conteo-interlocutores'],
      ['dedup-conteo-ubicaciones'],
      ['listado-clientes'],
      ['nombres-cliente-alta-rapida'],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const cargando =
    !clientes ||
    !conteoVisitas ||
    !conteoOportunidades ||
    !conteoInterlocutores ||
    !conteoUbicaciones;

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Clientes duplicados" ayuda="deduplicacion" />

      {cargando ? (
        <EstadoLista estado="cargando" />
      ) : grupos.length === 0 ? (
        <EstadoLista
          estado="vacio"
          mensaje="No hay clientes duplicados. Se agrupan las fichas con el mismo nombre (ignorando mayúsculas, acentos y la coletilla S.L./S.A.)."
        />
      ) : (
       <div className="lista-agrupada">
        {grupos.map((g) => {
        const maestroId = maestroDe(g);
        const duplicados = g.clientes.filter((c) => c.id !== maestroId);
        const visitasQueMueven = duplicados.reduce((n, c) => n + c.visitas, 0);
        const oportunidadesQueMueven = duplicados.reduce((n, c) => n + c.oportunidades, 0);
        const nombreMaestro = g.clientes.find((c) => c.id === maestroId)?.nombre ?? '';
        const vaciasQuitables = duplicados.filter(esVacia);
        const enConfirmacion = confirmando === g.clave;
        const bloqueado = procesando === g.clave;

        return (
          <div key={g.clave} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SeccionLista titulo={`${g.clientes.length} fichas parecidas · toca la que se queda`}>
              {g.clientes.map((c) => {
                const esMaestro = c.id === maestroId;
                // Jerarquía: lo que pesa para elegir superviviente —cuánta
                // visita lleva cada ficha— va como valor a la derecha; el
                // subtítulo se queda con lo justo para distinguirlas (sector
                // · ubicación · antigüedad). Contactos y "creada por X" se
                // ven en la ficha si hacen falta, aquí eran ruido.
                const meta = [
                  c.sector || 'sector sin definir',
                  c.ubicacion || null,
                  c.oportunidades ? `${c.oportunidades} oportunidad${c.oportunidades === 1 ? '' : 'es'}` : null,
                  `creada ${fechaCorta(c.creado_en)}`,
                ]
                  .filter(Boolean)
                  .join(' · ');
                const valor = esMaestro
                  ? 'se queda'
                  : esVacia(c)
                    ? 'sin datos'
                    : `${c.visitas} visita${c.visitas === 1 ? '' : 's'}`;
                return (
                  <FilaNavegable
                    key={c.id}
                    titulo={c.nombre}
                    subtitulo={meta}
                    valor={valor}
                    valorTenue={!esMaestro && !esVacia(c)}
                    tono={esMaestro ? 'ok' : 'neutral'}
                    chevron={false}
                    disabled={bloqueado || enConfirmacion}
                    onClick={() => setMaestroPorGrupo((m) => ({ ...m, [g.clave]: c.id }))}
                  />
                );
              })}
            </SeccionLista>

            {enConfirmacion ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                  Se juntarán {duplicados.length} ficha{duplicados.length === 1 ? '' : 's'} en «{nombreMaestro}». Se
                  moverán {visitasQueMueven} visita{visitasQueMueven === 1 ? '' : 's'} y {oportunidadesQueMueven}{' '}
                  oportunidad{oportunidadesQueMueven === 1 ? '' : 'es'} (más hallazgos, ubicaciones y contactos). No se
                  puede deshacer desde la app.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={bloqueado}
                    onClick={() => setConfirmando(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ background: 'var(--risk-600)' }}
                    disabled={bloqueado}
                    onClick={() => fusionar(g)}
                  >
                    {bloqueado ? 'Fusionando…' : 'Confirmar fusión'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {vaciasQuitables.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '0 16px' }}
                    disabled={bloqueado}
                    onClick={() => {
                      setError(null);
                      void fusionar(g, { soloVacias: true });
                    }}
                  >
                    {bloqueado
                      ? 'Quitando…'
                      : `Quitar ${vaciasQuitables.length} sin datos`}
                  </button>
                )}
                {/* Una pantalla con N grupos de duplicados no tiene UNA
                    acción principal: fusionar es una decisión por grupo, así
                    que va en secundario (no un muro de botones azules). */}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '0 16px' }}
                  disabled={bloqueado}
                  onClick={() => {
                    setError(null);
                    setConfirmando(g.clave);
                  }}
                >
                  Fusionar en la marcada
                </button>
              </div>
            )}

            {error && confirmando === g.clave && (
              <div className="field-error-text" style={{ marginTop: 8 }}>
                {error}
              </div>
            )}
          </div>
        );
        })}
       </div>
      )}
    </div>
  );
}

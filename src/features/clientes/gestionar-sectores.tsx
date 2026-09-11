import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaAccion } from '@/components/ui/fila-accion';
import { BarraSeleccion } from '@/components/ui/barra-seleccion';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Icono } from '@/components/ui/iconos';

interface Sector {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
}

// Gestión del catálogo de sectores (Dirección). El sector de un cliente se
// guarda como texto en `cliente.sector`; esta lista solo alimenta el
// desplegable de "Editar datos" — renombrar aquí NO reescribe los clientes
// que ya usaban el nombre anterior.
//
// Renombrar / ocultar / restaurar van por modo "Seleccionar" + BarraSeleccion,
// igual que el catálogo de vocabulario (la pantalla hermana) y que
// Interlocutores. Nada de acciones-enlace sueltas por fila.
export function GestionarSectores() {
  const queryClient = useQueryClient();
  const [nuevo, setNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const alta = useAccionAsync();
  const cambio = useAccionAsync();

  const { data: sectores, isLoading, isError, refetch } = useQuery({
    queryKey: ['sectores-todos'],
    queryFn: async (): Promise<Sector[]> => {
      const { data, error } = await supabase
        .from('sector')
        .select('id, nombre, activo, orden')
        .order('orden');
      if (error) throw error;
      return data ?? [];
    },
  });

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['sectores-todos'] });
    queryClient.invalidateQueries({ queryKey: ['sectores-activos'] });
  }

  function salirSeleccion() {
    setSeleccionando(false);
    setMarcados(new Set());
    cambio.limpiarError();
  }

  function alternarMarcado(id: string) {
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function cerrarRenombrado() {
    setRenombrando(null);
    setBorrador('');
    cambio.limpiarError();
  }

  async function anadir() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const ordenMax = Math.max(0, ...(sectores ?? []).map((s) => s.orden));
    await alta.ejecutar(
      async () => {
        const { error } = await supabase.from('sector').insert({ nombre, orden: ordenMax + 10 });
        if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Ya existe ese sector.' : error.message);
      },
      { onExito: () => { setNuevo(''); setCreando(false); refrescar(); } }
    );
  }

  function cerrarCrear() {
    setCreando(false);
    setNuevo('');
    alta.limpiarError();
  }

  async function renombrar(id: string) {
    const nombre = borrador.trim();
    if (!nombre) return;
    await cambio.ejecutar(
      async () => {
        const { error, count } = await supabase
          .from('sector')
          .update({ nombre }, { count: 'exact' })
          .eq('id', id);
        if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Ya existe ese sector.' : error.message);
        if (!count) throw new Error('No se ha podido renombrar (0 filas afectadas).');
      },
      { onExito: () => { cerrarRenombrado(); refrescar(); } }
    );
  }

  async function fijarActivoLote(ids: string[], activar: boolean) {
    if (!ids.length) return;
    await cambio.ejecutar(
      async () => {
        // Se conoce de antemano cuántas filas debería tocar (una por id
        // marcado) — comparar `count` contra `ids.length` detecta tanto el
        // fallo total (RLS) como uno parcial (alguno ya no existe o no es
        // tuyo).
        const { error, count } = await supabase
          .from('sector')
          .update({ activo: activar }, { count: 'exact' })
          .in('id', ids);
        if (error) throw new Error(error.message);
        if (count !== ids.length) {
          throw new Error(`Solo se ha podido cambiar ${count ?? 0} de ${ids.length}. Puede que no tengas permiso sobre alguno.`);
        }
      },
      { onExito: () => { salirSeleccion(); refrescar(); } }
    );
  }

  const marcadosArr = (sectores ?? []).filter((s) => marcados.has(s.id));
  const todosActivos = marcadosArr.length > 0 && marcadosArr.every((s) => s.activo);
  const todosOcultos = marcadosArr.length > 0 && marcadosArr.every((s) => !s.activo);
  const etiquetaVis =
    marcados.size === 0
      ? 'Ocultar'
      : todosOcultos
        ? `Restaurar (${marcados.size})`
        : `Ocultar (${marcados.size})`;

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo="Sectores"
        volverA="/yo"
        ayuda="gestionar-sectores"
        derecha={
          !creando && !seleccionando ? (
            <button
              type="button"
              className="boton-icono"
              aria-label="Añadir sector"
              title="Añadir sector"
              onClick={() => { setCreando(true); alta.limpiarError(); }}
            >
              <Icono nombre="mas" size={18} />
            </button>
          ) : undefined
        }
      />

      <div className="lista-agrupada">
        {creando && (
          <div className="card">
            <div className="label" style={{ marginTop: 0 }}>Nuevo sector</div>
            <input
              className="field"
              autoFocus
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') anadir();
                if (e.key === 'Escape') cerrarCrear();
              }}
              placeholder="p. ej. Automoción"
            />
            {alta.error && <div className="field-error-text" style={{ marginTop: 8 }}>{alta.error}</div>}
            <div className="fila-btns" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={alta.cargando}
                onClick={cerrarCrear}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={alta.cargando || !nuevo.trim()}
                onClick={anadir}
              >
                {alta.cargando ? 'Añadiendo…' : 'Añadir'}
              </button>
            </div>
          </div>
        )}

        {isLoading && <EstadoLista estado="cargando" />}
        {isError && <EstadoLista estado="error" mensaje="No se pudo cargar el catálogo." onReintentar={refetch} />}
        {!isLoading && !isError && !creando && !sectores?.length && (
          <EstadoLista estado="vacio" mensaje="Aún no hay sectores. Añade el primero con «+»." />
        )}

        {!!sectores?.length && (
          <div>
            {seleccionando ? (
              <BarraSeleccion
                n={marcados.size}
                onCancelar={salirSeleccion}
                acciones={[
                  {
                    etiqueta: 'Renombrar',
                    icono: 'editar',
                    disabled: marcados.size !== 1 || cambio.cargando,
                    onClick: () => {
                      const s = marcadosArr[0];
                      if (!s) return;
                      setRenombrando(s.id);
                      setBorrador(s.nombre);
                      cambio.limpiarError();
                      setSeleccionando(false);
                      setMarcados(new Set());
                    },
                  },
                  {
                    etiqueta: etiquetaVis,
                    icono: todosOcultos ? 'restaurar' : 'oculto',
                    disabled:
                      cambio.cargando || marcados.size === 0 || (!todosActivos && !todosOcultos),
                    onClick: () => fijarActivoLote(marcadosArr.map((s) => s.id), todosOcultos),
                  },
                ]}
              />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button type="button" className="chip" onClick={() => setSeleccionando(true)}>
                  Seleccionar
                </button>
              </div>
            )}

            <SeccionLista titulo="Catálogo">
              {sectores.map((s) =>
                renombrando === s.id ? (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: 'var(--space-3) var(--fila-pad-x)',
                    }}
                  >
                    <input
                      className="field"
                      autoFocus
                      value={borrador}
                      onChange={(e) => setBorrador(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renombrar(s.id);
                        if (e.key === 'Escape') cerrarRenombrado();
                      }}
                    />
                    {cambio.error && <div className="field-error-text">{cambio.error}</div>}
                    <div className="fila-btns">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={cambio.cargando}
                        onClick={cerrarRenombrado}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={cambio.cargando || !borrador.trim()}
                        onClick={() => renombrar(s.id)}
                      >
                        {cambio.cargando ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <FilaAccion
                    key={s.id}
                    titulo={s.nombre}
                    subtitulo={!s.activo ? 'oculto — no sale en el desplegable' : undefined}
                    seleccion={
                      seleccionando
                        ? {
                            activa: true,
                            marcada: marcados.has(s.id),
                            onToggle: () => alternarMarcado(s.id),
                          }
                        : undefined
                    }
                  />
                )
              )}
            </SeccionLista>

            {cambio.error && !renombrando && (
              <div className="field-error-text" style={{ paddingInline: 'var(--fila-pad-x)' }}>
                {cambio.error}
              </div>
            )}

            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--ink-400)',
                paddingInline: 'var(--fila-pad-x)',
                marginTop: 6,
              }}
            >
              «Ocultar» solo lo saca del desplegable; no cambia los clientes que ya lo tienen.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

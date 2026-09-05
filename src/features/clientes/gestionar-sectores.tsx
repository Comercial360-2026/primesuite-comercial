import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { EstadoLista } from '@/components/ui/estado-lista';

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
export function GestionarSectores() {
  const queryClient = useQueryClient();
  const [nuevo, setNuevo] = useState('');
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
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

  async function anadir() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const ordenMax = Math.max(0, ...(sectores ?? []).map((s) => s.orden));
    await alta.ejecutar(
      async () => {
        const { error } = await supabase.from('sector').insert({ nombre, orden: ordenMax + 10 });
        if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Ya existe ese sector.' : error.message);
      },
      { onExito: () => { setNuevo(''); refrescar(); } }
    );
  }

  async function renombrar(id: string) {
    const nombre = borrador.trim();
    if (!nombre) return;
    await cambio.ejecutar(
      async () => {
        const { error } = await supabase.from('sector').update({ nombre }).eq('id', id);
        if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Ya existe ese sector.' : error.message);
      },
      { onExito: () => { setRenombrando(null); setBorrador(''); refrescar(); } }
    );
  }

  async function alternarActivo(s: Sector) {
    await cambio.ejecutar(
      async () => {
        const { error } = await supabase.from('sector').update({ activo: !s.activo }).eq('id', s.id);
        if (error) throw new Error(error.message);
      },
      { onExito: refrescar }
    );
  }

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Sectores" volverA="/yo" ayuda="gestionar-sectores" />

      <div className="lista-agrupada">
        <div className="card">
          <div className="label" style={{ marginTop: 0 }}>Añadir sector</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="field"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') anadir(); }}
              placeholder="p. ej. Automoción"
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: 'auto', padding: '0 16px', flexShrink: 0 }}
              disabled={alta.cargando || !nuevo.trim()}
              onClick={anadir}
            >
              Añadir
            </button>
          </div>
          {alta.error && <div className="field-error-text" style={{ marginTop: 8 }}>{alta.error}</div>}
        </div>

        {isLoading && <EstadoLista estado="cargando" />}
        {isError && <EstadoLista estado="error" mensaje="No se pudo cargar el catálogo." onReintentar={refetch} />}

        {!!sectores?.length && (
          <SeccionLista titulo="Catálogo">
            {sectores.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 'var(--fila-pad-y) var(--fila-pad-x)',
                  borderBottom: 'var(--fila-separador)',
                  opacity: s.activo ? 1 : 0.5,
                }}
              >
                {renombrando === s.id ? (
                  <>
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      autoFocus
                      value={borrador}
                      onChange={(e) => setBorrador(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') renombrar(s.id); }}
                    />
                    <button type="button" className="btn-enlace" onClick={() => renombrar(s.id)}>guardar</button>
                    <button type="button" className="btn-enlace" onClick={() => { setRenombrando(null); setBorrador(''); }}>cancelar</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {s.nombre}
                      {!s.activo && <span style={{ color: 'var(--ink-400)', fontSize: 'var(--text-xs)' }}> · oculto</span>}
                    </span>
                    <button
                      type="button"
                      className="btn-enlace"
                      onClick={() => { setRenombrando(s.id); setBorrador(s.nombre); cambio.limpiarError(); }}
                    >
                      renombrar
                    </button>
                    <button type="button" className="btn-enlace" onClick={() => alternarActivo(s)}>
                      {s.activo ? 'quitar' : 'restaurar'}
                    </button>
                  </>
                )}
              </div>
            ))}
          </SeccionLista>
        )}
        {cambio.error && (
          <div className="field-error-text" style={{ paddingInline: 'var(--fila-pad-x)' }}>{cambio.error}</div>
        )}

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
          "Quitar" solo lo saca del desplegable; no cambia los clientes que ya lo tienen.
        </div>
      </div>
    </div>
  );
}

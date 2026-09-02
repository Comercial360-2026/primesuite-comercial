import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import {
  editarComercial,
  desactivarComercial,
  reactivarComercial,
  type RolComercial,
} from '@/lib/gestionar-comercial';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Aviso } from '@/components/ui/aviso';

const ROLES: { valor: RolComercial; etiqueta: string }[] = [
  { valor: 'comercial', etiqueta: 'Comercial' },
  { valor: 'direccion_comercial', etiqueta: 'Dirección comercial' },
];

export function DetalleComercial() {
  const { comercialId } = useParams<{ comercialId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { comercial: yo } = useSesionActual();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['comercial', comercialId],
    enabled: !!comercialId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comercial')
        .select('id, nombre, rol, zona_cartera, activo, fecha_baja')
        .eq('id', comercialId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<RolComercial>('comercial');
  const [zona, setZona] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  useEffect(() => {
    if (!data) return;
    setNombre(data.nombre);
    setRol((data.rol as RolComercial) ?? 'comercial');
    setZona(data.zona_cartera ?? '');
  }, [data]);

  if (isLoading || (!data && !isError)) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Comercial" volverA="/comerciales" />
        <EstadoLista estado="cargando" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Comercial" volverA="/comerciales" />
        <EstadoLista estado="error" mensaje="No se pudo cargar este comercial." onReintentar={() => refetch()} />
      </div>
    );
  }

  const c = data;
  const esYo = c.id === yo?.id;
  const hayCambios =
    nombre.trim() !== c.nombre || rol !== c.rol || (zona.trim() || '') !== (c.zona_cartera ?? '');

  async function guardar() {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await editarComercial({ id: c.id, nombre: nombre.trim(), rol, zona_cartera: zona.trim() || null });
      queryClient.invalidateQueries({ queryKey: ['comercial', comercialId] });
      queryClient.invalidateQueries({ queryKey: ['comerciales-equipo'] });
      queryClient.invalidateQueries({ queryKey: ['nombres-comerciales'] });
      navigate('/comerciales');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(activar: boolean) {
    setCambiandoEstado(true);
    setError(null);
    try {
      await (activar ? reactivarComercial(c.id) : desactivarComercial(c.id));
      queryClient.invalidateQueries({ queryKey: ['comercial', comercialId] });
      queryClient.invalidateQueries({ queryKey: ['comerciales-equipo'] });
      setConfirmandoBaja(false);
      navigate('/comerciales');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
    } finally {
      setCambiandoEstado(false);
    }
  }

  return (
    <div className="screen">
      <CabeceraDetalle
        titulo={data.nombre}
        subtitulo={data.activo ? undefined : `De baja${data.fecha_baja ? ` desde el ${fechaCorta(data.fecha_baja)}` : ''}`}
        onVolver={() => navigate('/comerciales')}
      />

      {!data.activo && (
        <Aviso tipo="atencion" titulo="Comercial de baja">
          No puede iniciar sesión. Sus visitas y lo que registró se conservan. Puedes reactivarlo abajo.
        </Aviso>
      )}

      <div className="label" style={{ marginTop: data.activo ? 0 : undefined }}>nombre</div>
      <input className="field" value={nombre} onChange={(e) => setNombre(e.target.value)} />

      <div className="label">rol</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {ROLES.map((r) => (
          <button
            key={r.valor}
            type="button"
            className={`chip${rol === r.valor ? ' chip--on' : ''}`}
            onClick={() => setRol(r.valor)}
          >
            {r.etiqueta}
          </button>
        ))}
      </div>

      <div className="label">zona / cartera (opcional)</div>
      <input className="field" value={zona} onChange={(e) => setZona(e.target.value)} />

      {error && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: 'auto' }}
        disabled={!nombre.trim() || !hayCambios || guardando}
        onClick={guardar}
      >
        {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>

      {/* Baja / reactivación — al fondo, tono riesgo, con confirmación. */}
      {data.activo ? (
        confirmandoBaja ? (
          <div className="card" style={{ borderColor: 'var(--risk-600)' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
              {data.nombre} dejará de poder entrar en la app. Sus visitas y todo lo que registró se conservan. Se
              puede reactivar más tarde.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={cambiandoEstado}
                onClick={() => setConfirmandoBaja(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, background: 'var(--risk-600)' }}
                disabled={cambiandoEstado}
                onClick={() => cambiarEstado(false)}
              >
                {cambiandoEstado ? 'Dando de baja…' : 'Sí, dar de baja'}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-secondary"
            style={{ color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
            disabled={esYo}
            title={esYo ? 'No puedes darte de baja a ti mismo' : undefined}
            onClick={() => setConfirmandoBaja(true)}
          >
            Dar de baja
          </button>
        )
      ) : (
        <button className="btn btn-secondary" disabled={cambiandoEstado} onClick={() => cambiarEstado(true)}>
          {cambiandoEstado ? 'Reactivando…' : 'Reactivar comercial'}
        </button>
      )}
    </div>
  );
}

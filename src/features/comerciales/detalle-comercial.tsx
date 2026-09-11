import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { fechaCorta } from '@/lib/fechas';
import { plural } from '@/lib/texto';
import { desde } from '@/lib/volver-a';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import {
  editarComercial,
  desactivarComercial,
  reactivarComercial,
  enlaceAcceso,
  traspasarCartera,
  type RolComercial,
} from '@/lib/gestionar-comercial';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { EstadoLista } from '@/components/ui/estado-lista';
import { Aviso } from '@/components/ui/aviso';
import { Icono } from '@/components/ui/iconos';

const ROLES: { valor: RolComercial; etiqueta: string }[] = [
  { valor: 'comercial', etiqueta: 'Comercial' },
  { valor: 'direccion_comercial', etiqueta: 'Dirección comercial' },
];

export function DetalleComercial() {
  const { comercialId } = useParams<{ comercialId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
  // `modo`: qué tarjeta de acción grande está abierta abajo.
  const [modo, setModo] = useState<null | 'baja' | 'traspaso'>(null);
  const [traspasoA, setTraspasoA] = useState('');
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [traspasoHecho, setTraspasoHecho] = useState<string | null>(null);

  const activo = !!data?.activo;

  // Cartera del comercial — clientes de los que es responsable, visitas
  // planificadas futuras que lleva, y próximos pasos pendientes. Hace falta
  // para el resumen antes de la baja y para "Traspasar cartera".
  const { data: cartera } = useQuery({
    queryKey: ['cartera-comercial', comercialId],
    enabled: !!comercialId && activo,
    queryFn: async () => {
      const inicioHoy = new Date(new Date().toDateString()).toISOString();
      const [cli, pas, vp] = await Promise.all([
        supabase
          .from('cliente')
          .select('id', { count: 'exact', head: true })
          .eq('responsable_id', comercialId!)
          .eq('estado_fusion', 'activo'),
        supabase
          .from('proximo_paso')
          .select('id', { count: 'exact', head: true })
          .eq('comercial_responsable_id', comercialId!)
          .eq('estado', 'pendiente'),
        supabase
          .from('visita_participante')
          .select('visita:visita_id!inner(estado_captura, fecha)')
          .eq('comercial_id', comercialId!)
          .eq('rol', 'responsable')
          .eq('visita.estado_captura', 'agendada')
          .gte('visita.fecha', inicioHoy),
      ]);
      return {
        clientes: cli.count ?? 0,
        pasos: pas.count ?? 0,
        visitas: vp.data?.length ?? 0,
      };
    },
  });
  const totalCartera = (cartera?.clientes ?? 0) + (cartera?.visitas ?? 0) + (cartera?.pasos ?? 0);

  const { data: comercialesActivos } = useQuery({
    queryKey: ['comerciales-activos'],
    enabled: activo,
    queryFn: async () => {
      const { data: d, error: err } = await supabase
        .from('comercial')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (err) throw err;
      return d ?? [];
    },
  });
  const destinos = (comercialesActivos ?? []).filter((x) => x.id !== comercialId);
  // Reenviar enlace de acceso (contraseña perdida / enlace caducado).
  const [reenviando, setReenviando] = useState(false);
  const [enlaceReenviado, setEnlaceReenviado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Petición de acceso pendiente de este comercial (la deja el propio
  // comercial desde el login cuando no puede entrar).
  const { data: peticionAcceso } = useQuery({
    queryKey: ['solicitud-acceso', comercialId],
    enabled: !!comercialId,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('solicitud_acceso')
        .select('creado_en')
        .eq('comercial_id', comercialId!)
        .eq('estado', 'pendiente')
        .maybeSingle();
      if (err) throw err;
      return data;
    },
  });

  async function reenviarEnlace() {
    if (reenviando) return;
    setReenviando(true);
    setError(null);
    try {
      const { action_link } = await enlaceAcceso(comercialId!);
      setEnlaceReenviado(action_link);
      queryClient.invalidateQueries({ queryKey: ['solicitud-acceso', comercialId] });
      queryClient.invalidateQueries({ queryKey: ['num-solicitudes-acceso'] });
      queryClient.invalidateQueries({ queryKey: ['solicitudes-acceso-pendientes'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el enlace.');
    } finally {
      setReenviando(false);
    }
  }

  async function copiarEnlace() {
    if (!enlaceReenviado) return;
    try {
      await navigator.clipboard.writeText(enlaceReenviado);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* se ve igual en pantalla */
    }
  }

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
      if (activar) {
        await reactivarComercial(c.id);
      } else {
        await desactivarComercial(c.id, totalCartera > 0 ? traspasoA : undefined);
      }
      queryClient.invalidateQueries({ queryKey: ['comercial', comercialId] });
      queryClient.invalidateQueries({ queryKey: ['comerciales-equipo'] });
      queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
      setModo(null);
      navigate('/comerciales');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function traspasarSuelto() {
    if (!traspasoA || cambiandoEstado) return;
    setCambiandoEstado(true);
    setError(null);
    try {
      const r = await traspasarCartera(c.id, traspasoA);
      const nombreDestino = destinos.find((d) => d.id === traspasoA)?.nombre ?? 'el comercial elegido';
      setTraspasoHecho(
        `${plural(r.clientes, 'cliente', 'clientes')}, ${plural(r.visitas, 'visita planificada', 'visitas planificadas')} y ${plural(r.pasos, 'próximo paso', 'próximos pasos')} pasan a ${nombreDestino}.`
      );
      setModo(null);
      setTraspasoA('');
      queryClient.invalidateQueries({ queryKey: ['cartera-comercial', comercialId] });
      queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo traspasar la cartera.');
    } finally {
      setCambiandoEstado(false);
    }
  }

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={data.nombre}
        ayuda="detalle-comercial"
        subtitulo={data.activo ? undefined : `De baja${data.fecha_baja ? ` desde el ${fechaCorta(data.fecha_baja)}` : ''}`}
        avatar={data.nombre}
        onVolver={() => navigate('/comerciales')}
      />

      <div className="screen__scroll">
       <div className="lista-agrupada">
        {!data.activo && (
          <Aviso tipo="atencion" titulo="Comercial de baja">
            No puede iniciar sesión. Sus visitas y lo que registró se conservan. Puedes reactivarlo abajo.
          </Aviso>
        )}

        {data.activo && peticionAcceso && !enlaceReenviado && (
          <Aviso tipo="atencion" titulo="Ha pedido acceso">
            El {fechaCorta(peticionAcceso.creado_en)}. Reenvíale el enlace y se marcará como resuelto.
          </Aviso>
        )}

        {/* Contexto siempre visible arriba (regla 6) — antes la cartera solo
            se veía al abrir traspaso o baja. */}
        {activo && (
          <div className="ficha-vitals">
            <span>
              {totalCartera === 0
                ? 'Sin clientes asignados todavía'
                : [
                    cartera?.clientes ? `${cartera.clientes} cliente${cartera.clientes === 1 ? '' : 's'}` : null,
                    cartera?.visitas
                      ? `${cartera.visitas} visita${cartera.visitas === 1 ? '' : 's'} planificada${cartera.visitas === 1 ? '' : 's'}`
                      : null,
                    cartera?.pasos
                      ? `${cartera.pasos} próximo${cartera.pasos === 1 ? '' : 's'} paso${cartera.pasos === 1 ? '' : 's'}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </span>
          </div>
        )}

        {/* Acciones esporádicas como chip, no botón ancho (regla 3). */}
        {data.activo && !enlaceReenviado && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="chip" disabled={reenviando} onClick={reenviarEnlace}>
              {reenviando ? 'Generando enlace…' : 'Reenviar enlace de acceso'}
            </button>
            {totalCartera > 0 && modo !== 'baja' && modo !== 'traspaso' && (
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setTraspasoHecho(null);
                  setModo('traspaso');
                }}
              >
                Traspasar cartera
              </button>
            )}
          </div>
        )}

        {enlaceReenviado && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Aviso tipo="exito" titulo="Enlace nuevo listo">
              Pásaselo a {data.nombre}. La petición queda resuelta.
            </Aviso>
            <div className="enlace-copia">{enlaceReenviado}</div>
            <div className="fila-btns" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '0 16px' }} onClick={copiarEnlace}>
                {copiado ? <><Icono nombre="check" size={16} /> Copiado</> : 'Copiar enlace'}
              </button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '0 16px' }}
                  onClick={() =>
                    navigator
                      .share({ title: 'Acceso a PrimeNotes', url: enlaceReenviado })
                      .catch(() => {})
                  }
                >
                  Compartir
                </button>
              )}
            </div>
          </div>
        )}

        {traspasoHecho && (
          <Aviso tipo="exito" titulo="Cartera traspasada">
            {traspasoHecho} {data.nombre} sigue activo.
          </Aviso>
        )}

        {modo === 'traspaso' && (
          <div className="card">
            <ResumenCartera cartera={cartera} nombre={data.nombre} />
            <div className="label">Traspasar todo a</div>
            <select className="field" value={traspasoA} onChange={(e) => setTraspasoA(e.target.value)}>
              <option value="">— elige un comercial —</option>
              {destinos.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
            <div className="fila-btns" style={{ marginTop: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} disabled={cambiandoEstado} onClick={() => { setModo(null); setTraspasoA(''); }}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={cambiandoEstado || !traspasoA} onClick={traspasarSuelto}>
                {cambiandoEstado ? 'Traspasando…' : 'Traspasar'}
              </button>
            </div>
          </div>
        )}

        {/* La ficha muestra la CARGA de cartera (arriba); su ACTIVIDAD
            (visitas hechas, hallazgos, oportunidades) vive en otra pantalla
            — antes no había forma de llegar desde aquí. */}
        <SeccionLista titulo="Actividad">
          <FilaNavegable
            icono="equipo"
            titulo="Ver actividad"
            subtitulo="Visitas, hallazgos y oportunidades, por proyecto"
            to={`/actividad-comerciales/${c.id}`}
            state={desde(location)}
          />
        </SeccionLista>

        <SeccionLista titulo="Datos">
          <div style={{ padding: '12px var(--fila-pad-x)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <div className="label" style={{ marginTop: 0 }}>Nombre</div>
              <input className="field" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <div className="label">Rol</div>
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
            </div>
            <div>
              <div className="label">Zona (opcional)</div>
              <input
                className="field"
                placeholder="p. ej. Cataluña, Grandes cuentas…"
                value={zona}
                onChange={(e) => setZona(e.target.value)}
              />
            </div>
          </div>
        </SeccionLista>

        {/* De baja: guardar cambios en los datos sigue siendo posible, pero
            deja de ser la acción principal de la pantalla (eso es
            Reactivar, fijo abajo) — se ofrece aquí como acción secundaria. */}
        {!activo && (
          <button
            className="btn btn-secondary"
            disabled={!nombre.trim() || !hayCambios || guardando}
            onClick={guardar}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        )}

        {error && <Aviso tipo="error">{error}</Aviso>}

        {activo && modo === 'baja' && (
          <div className="card card--riesgo">
            {totalCartera > 0 && <ResumenCartera cartera={cartera} nombre={data.nombre} />}
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
              {data.nombre} dejará de poder entrar en la app. Sus visitas y todo lo que registró se conservan. Se
              puede reactivar más tarde.
            </div>
            {totalCartera > 0 && (
              <>
                <div className="label">Traspasar todo a</div>
                <select className="field" value={traspasoA} onChange={(e) => setTraspasoA(e.target.value)}>
                  <option value="">— elige un comercial —</option>
                  {destinos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </>
            )}
            <div className="fila-btns" style={{ marginTop: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={cambiandoEstado}
                onClick={() => { setModo(null); setTraspasoA(''); }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-peligro"
                style={{ flex: 1 }}
                disabled={cambiandoEstado || (totalCartera > 0 && !traspasoA)}
                onClick={() => cambiarEstado(false)}
              >
                {cambiandoEstado
                  ? 'Dando de baja…'
                  : totalCartera > 0
                    ? 'Traspasar y dar de baja'
                    : 'Sí, dar de baja'}
              </button>
            </div>
          </div>
        )}

        {activo && modo !== 'baja' && (
          <SeccionLista>
            <div title={esYo ? 'No puedes darte de baja a ti mismo' : undefined}>
              <FilaNavegable
                icono="borrar"
                titulo="Dar de baja"
                tono="riesgo"
                chevron={false}
                disabled={esYo}
                onClick={() => { setTraspasoHecho(null); setModo('baja'); }}
              />
            </div>
          </SeccionLista>
        )}
       </div>
      </div>

      {/* CTA fijo abajo: Guardar cambios si está activo (secundario cuando
          hay un panel de baja/traspaso abierto, para no competir con él),
          Reactivar si está de baja — un solo primario visible a la vez. */}
      {activo ? (
        <button
          className={`btn ${modo ? 'btn-secondary' : 'btn-primary'}`}
          disabled={!nombre.trim() || !hayCambios || guardando}
          onClick={guardar}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      ) : (
        <button className="btn btn-primary" disabled={cambiandoEstado} onClick={() => cambiarEstado(true)}>
          {cambiandoEstado ? 'Reactivando…' : 'Reactivar comercial'}
        </button>
      )}
    </div>
  );
}

function ResumenCartera({
  cartera,
  nombre,
}: {
  cartera?: { clientes: number; visitas: number; pasos: number };
  nombre: string;
}) {
  if (!cartera) return null;
  return (
    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-900)', marginBottom: 4 }}>
      {nombre} lleva{' '}
      <b>{cartera.clientes} cliente{cartera.clientes === 1 ? '' : 's'}</b>,{' '}
      <b>{cartera.visitas} visita{cartera.visitas === 1 ? '' : 's'} planificada{cartera.visitas === 1 ? '' : 's'}</b>{' '}
      y <b>{cartera.pasos} próximo{cartera.pasos === 1 ? '' : 's'} paso{cartera.pasos === 1 ? '' : 's'} pendiente{cartera.pasos === 1 ? '' : 's'}</b>.
    </div>
  );
}

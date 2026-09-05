import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { haceRelativo } from '@/lib/fechas';
import { uuid } from '@/lib/uuid';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { reasignarCliente } from '@/lib/gestionar-comercial';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaDato } from '@/components/ui/fila-dato';
import { EtiquetaSemaforo } from '@/components/ui/etiqueta-semaforo';
import { EcoTag } from '@/components/ui/eco-tag';
import { DirectorioInterlocutores } from './directorio-interlocutores';
import { ActividadProyecto } from '@/features/proyectos/actividad-proyecto';
import { AccionesProyecto } from '@/features/proyectos/acciones-proyecto';
import { useProyectosCliente } from '@/hooks/use-proyectos-cliente';

interface EcosistemaItem {
  termino_id: string;
  naturaleza: string;
}

interface PrevisualizacionBorrado {
  num_fotos: number;
  num_audios: number;
  num_notas: number;
  num_hallazgos: number;
  num_oportunidades: number;
  num_proximos_pasos: number;
  rutas_storage: string[] | null;
}

interface PrevisualizacionBorradoCliente extends PrevisualizacionBorrado {
  num_visitas: number;
  num_ubicaciones: number;
}

const ESTADO_PROYECTO_LABEL: Record<string, string> = {
  activo: 'activo',
  pausado: 'pausado',
  terminado: 'terminado',
};

export function FichaCliente() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const { encolar } = useSyncQueue(undefined);
  const queryClient = useQueryClient();

  const [ecoTodos, setEcoTodos] = useState(false);
  const ECO_VISIBLE = 10;
  const [confirmandoBorrarCliente, setConfirmandoBorrarCliente] = useState(false);
  const [previsualizacionCliente, setPrevisualizacionCliente] = useState<PrevisualizacionBorradoCliente | null>(null);
  const previsualizandoCliente = useAccionAsync();
  const borrandoCliente = useAccionAsync();

  const esDireccionComercial = comercial?.rol === 'direccion_comercial';

  // Cambiar responsable del cliente — solo Dirección Comercial.
  const [cambiandoResp, setCambiandoResp] = useState(false);
  const [respNuevo, setRespNuevo] = useState('');
  const cambioResp = useAccionAsync();

  // Nuevo proyecto (línea de negocio) — cualquier comercial activo.
  const [creandoProyecto, setCreandoProyecto] = useState(false);
  const [nombreProyecto, setNombreProyecto] = useState('');
  const creacionProyecto = useAccionAsync();

  // Editar datos del cliente (nombre, sector, tamaño, ubicación general) —
  // el comercial responsable o Dirección. Sin cola offline: es un UPDATE
  // directo, requiere conexión.
  const TAMANOS = ['Pequeña', 'Mediana', 'Grande'] as const;
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [formNombre, setFormNombre] = useState('');
  const [formSector, setFormSector] = useState('');
  const [formTamano, setFormTamano] = useState('');
  const [formUbicacion, setFormUbicacion] = useState('');
  const guardadoDatos = useAccionAsync();

  const { data: sectores } = useQuery({
    queryKey: ['sectores-activos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sector')
        .select('id, nombre')
        .eq('activo', true)
        .order('orden');
      if (error) throw error;
      return data ?? [];
    },
  });

  function abrirEditarDatos() {
    setFormNombre(cliente?.nombre ?? '');
    setFormSector(cliente?.sector ?? '');
    setFormTamano(cliente?.tamano_aprox ?? '');
    setFormUbicacion(cliente?.ubicacion_general ?? '');
    guardadoDatos.limpiarError();
    setEditandoDatos(true);
  }

  async function guardarDatos() {
    if (!clienteId || !formNombre.trim()) return;
    if (!navigator.onLine) {
      guardadoDatos.establecerError('Necesitas conexión para editar los datos del cliente.');
      return;
    }
    await guardadoDatos.ejecutar(
      async () => {
        const { error } = await supabase
          .from('cliente')
          .update({
            nombre: formNombre.trim(),
            sector: formSector || null,
            tamano_aprox: formTamano || null,
            ubicacion_general: formUbicacion.trim() || null,
          })
          .eq('id', clienteId);
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          setEditandoDatos(false);
          queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
        },
      }
    );
  }

  const { data: comercialesActivos } = useQuery({
    queryKey: ['comerciales-activos'],
    enabled: esDireccionComercial && cambiandoResp,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comercial')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });

  async function cambiarResponsable() {
    if (!respNuevo) return;
    await cambioResp.ejecutar(() => reasignarCliente(clienteId!, respNuevo), {
      onExito: () => {
        setCambiandoResp(false);
        setRespNuevo('');
        queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
        queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
      },
      mensajeError: (e) => (e instanceof Error ? e.message : 'No se pudo cambiar el responsable.'),
    });
  }

  const { data: cliente } = useQuery({
    queryKey: ['cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre, estado_relacion, sector, ubicacion_general, tamano_aprox, responsable_id, creado_por')
        .eq('id', clienteId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Nombres de responsable y creador de la ficha — para la línea de
  // contexto de la cabecera y "ficha creada por X". Una sola consulta.
  const { data: nombresComerciales } = useQuery({
    queryKey: ['nombres-comerciales'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('comercial').select('id, nombre');
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((c) => [c.id, c.nombre]));
    },
  });

  const { data: semaforo } = useQuery({
    queryKey: ['semaforo-cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_semaforo_cliente')
        .select('semaforo, ultima_visita')
        .eq('cliente_id', clienteId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: proyectos } = useProyectosCliente(clienteId);

  const { data: ecosistema } = useQuery({
    queryKey: ['ecosistema-completo', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<Array<EcosistemaItem & { nombre: string }>> => {
      const { data: items, error } = await supabase
        .from('vw_ecosistema_actual_cliente')
        .select('termino_id, naturaleza')
        .eq('cliente_id', clienteId!);
      if (error) throw error;

      const itemsValidos = (items ?? []).filter(
        (i): i is { termino_id: string; naturaleza: string } =>
          i.termino_id !== null && i.naturaleza !== null
      );
      if (!itemsValidos.length) return [];

      const { data: terminos, error: errorTerminos } = await supabase
        .from('termino')
        .select('id, nombre, parent:parent_id(nombre)')
        .in('id', itemsValidos.map((i) => i.termino_id));
      if (errorTerminos) throw errorTerminos;

      // Si el término es un modelo, se muestra con su ruta "MIFARE › DESFire
      // EV2" (mismo criterio que SelectorTermino y Detalle de Oportunidad).
      const nombreById = new Map(
        ((terminos ?? []) as unknown as { id: string; nombre: string; parent: { nombre: string } | null }[]).map(
          (t) => [t.id, t.parent ? `${t.parent.nombre} › ${t.nombre}` : t.nombre] as const
        )
      );
      return itemsValidos.map((i) => ({ ...i, nombre: nombreById.get(i.termino_id) ?? i.termino_id }));
    },
  });

  // Con red: INSERT directo (instantáneo, la ficha ya es navegable) — mismo
  // criterio que crearCliente() en alta-rapida-cliente.tsx. Sin red: se
  // encola (P14) y se sincroniza luego; entrar en su ficha antes de que
  // sincronice no encontraría la fila todavía, así que solo se navega si se
  // pudo confirmar al momento.
  async function crearProyecto() {
    if (!nombreProyecto.trim() || !comercial || !clienteId) return;
    await creacionProyecto.ejecutar(
      async () => {
        const proyectoId = uuid();
        const nombreLimpio = nombreProyecto.trim();

        if (navigator.onLine) {
          const { data, error } = await supabase
            .from('proyecto')
            .insert({ id: proyectoId, cliente_id: clienteId, nombre: nombreLimpio })
            .select('id')
            .single();
          if (!error && data) return { id: data.id, enCola: false };
          const esFalloDeRed =
            !navigator.onLine || /fetch|network|load failed/i.test(error?.message ?? '');
          if (!esFalloDeRed) throw new Error(error?.message ?? 'No se pudo crear el proyecto.');
        }

        await encolar(proyectoId, 'proyecto', { clienteId, nombre: nombreLimpio });
        return { id: proyectoId, enCola: true };
      },
      {
        onExito: ({ id, enCola }) => {
          setCreandoProyecto(false);
          setNombreProyecto('');
          queryClient.invalidateQueries({ queryKey: ['proyectos-cliente', clienteId] });
          if (enCola) return;
          navigate(`/clientes/${clienteId}/proyectos/${id}`);
        },
      }
    );
  }

  // Línea de contexto de la cabecera ("lo de un vistazo"). Todo sale de
  // datos ya guardados — no se pide rellenar nada.
  const responsableNombre = cliente?.responsable_id
    ? nombresComerciales?.[cliente.responsable_id] ?? null
    : null;
  const creadorNombre = cliente?.creado_por
    ? nombresComerciales?.[cliente.creado_por] ?? null
    : null;
  const ultimaVisitaRel = semaforo?.ultima_visita ? haceRelativo(semaforo.ultima_visita) : null;
  const hayBasicos =
    !!cliente?.sector || !!cliente?.ubicacion_general || !!cliente?.tamano_aprox;

  // 1.5 del recorrido de revisión: si el cliente solo tiene su Proyecto
  // General, la ficha de proyecto no aporta nada sobre esta — se muestra su
  // actividad (oportunidades, próximos pasos, hallazgos, historial) aquí
  // mismo, y la barra de "Iniciar visita / Planificar" abajo. En cuanto haya
  // un 2º proyecto, vuelve la lista "Proyectos" y cada uno tiene su ficha.
  const proyectoGeneral =
    proyectos && proyectos.length === 1 && proyectos[0].es_general ? proyectos[0] : null;

  async function pedirBorradoCliente() {
    setConfirmandoBorrarCliente(true);
    setPrevisualizacionCliente(null);
    await previsualizandoCliente.ejecutar(async () => {
      const { data, error } = await supabase
        .rpc('previsualizar_borrado_cliente', { p_cliente_id: clienteId! })
        .single();
      if (error) throw new Error(error.message);
      return data as PrevisualizacionBorradoCliente;
    }, {
      onExito: (data) => setPrevisualizacionCliente(data),
    });
  }

  function cancelarBorradoCliente() {
    setConfirmandoBorrarCliente(false);
    setPrevisualizacionCliente(null);
    previsualizandoCliente.limpiarError();
    borrandoCliente.limpiarError();
  }

  async function confirmarBorradoCliente() {
    const rutas = previsualizacionCliente?.rutas_storage ?? [];

    await borrandoCliente.ejecutar(
      async () => {
        // Mismo orden obligatorio que en el borrado de una visita suelta:
        // primero los binarios de Storage, mientras las filas de
        // visita_participante todavía existen (la política de Storage lo
        // exige) — eliminar_cliente_completo() las borra como parte de la
        // cascada, así que si se hiciera al revés, fallaría sin permiso.
        if (rutas.length) {
          await Promise.all([
            supabase.storage.from('fotos-visita').remove(rutas),
            supabase.storage.from('audios-visita').remove(rutas),
          ]);
        }
        const { error } = await supabase.rpc('eliminar_cliente_completo', { p_cliente_id: clienteId! });
        if (error) throw new Error(error.message);
      },
      {
        onExito: () => {
          // Sin esto, "Clientes" seguía mostrando el cliente ya borrado
          // hasta que la caché de 60s caducaba sola o el usuario refrescaba
          // a mano — mismo patrón que ya se cubría al borrar una visita
          // suelta, pero que faltaba aquí.
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
          navigate('/clientes');
        },
      }
    );
  }

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={cliente?.nombre ?? '…'}
        ayuda="ficha-cliente"
        subtitulo={cliente?.sector || undefined}
        volverA="/clientes"
      />

      <div className="screen__scroll">
       {(ultimaVisitaRel || semaforo) && (
         <div className="ficha-vitals" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
           {ultimaVisitaRel && <span>Última visita <b>{ultimaVisitaRel}</b></span>}
           {semaforo && <EtiquetaSemaforo valor={semaforo.semaforo} />}
         </div>
       )}
       {/* Acción: lo esporádico como chip, no como fila de lista ni botón
           ancho — regla 3 del modelo de 10 reglas. */}
       <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 4px' }}>
         <button type="button" className="chip" onClick={() => setCreandoProyecto(true)}>
           + Nuevo proyecto
         </button>
         {(esDireccionComercial || cliente?.responsable_id === comercial?.id) && (
           <button type="button" className="chip" onClick={abrirEditarDatos}>
             Editar datos
           </button>
         )}
         {esDireccionComercial && (
           <button
             type="button"
             className="chip"
             onClick={() => {
               setRespNuevo(cliente?.responsable_id ?? '');
               setCambiandoResp(true);
             }}
           >
             Responsable: {responsableNombre ?? 'sin asignar'}
           </button>
         )}
       </div>

       {creandoProyecto && (
         <div className="card">
           <div className="label" style={{ marginTop: 0 }}>Nuevo proyecto</div>
           <input
             className={`field${creacionProyecto.error ? ' field--error' : ''}`}
             autoFocus
             value={nombreProyecto}
             onChange={(e) => setNombreProyecto(e.target.value)}
             placeholder="mantenimiento, obra nueva, postventa…"
           />
           {creacionProyecto.error && <div className="field-error-text">{creacionProyecto.error}</div>}
           <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
             <button
               className="btn btn-secondary"
               disabled={creacionProyecto.cargando}
               onClick={() => {
                 setCreandoProyecto(false);
                 setNombreProyecto('');
                 creacionProyecto.limpiarError();
               }}
             >
               Cancelar
             </button>
             <button
               className="btn btn-primary"
               disabled={creacionProyecto.cargando || !nombreProyecto.trim()}
               onClick={crearProyecto}
             >
               {creacionProyecto.cargando ? 'Creando…' : 'Crear proyecto'}
             </button>
           </div>
         </div>
       )}

       {cambiandoResp && (
         <div className="card">
           <div className="label" style={{ marginTop: 0 }}>Responsable del cliente</div>
           <select
             className="field"
             value={respNuevo}
             onChange={(e) => setRespNuevo(e.target.value)}
           >
             <option value="">— elige un comercial —</option>
             {comercialesActivos?.map((c) => (
               <option key={c.id} value={c.id}>
                 {c.nombre}
               </option>
             ))}
           </select>
           <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
             Sus visitas planificadas y próximos pasos pendientes de este cliente pasan también. El historial
             no cambia.
           </div>
           {cambioResp.error && (
             <div className="field-error-text" style={{ marginTop: 8 }}>{cambioResp.error}</div>
           )}
           <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
             <button
               className="btn btn-secondary"
               disabled={cambioResp.cargando}
               onClick={() => {
                 setCambiandoResp(false);
                 cambioResp.limpiarError();
               }}
             >
               Cancelar
             </button>
             <button
               className="btn btn-primary"
               disabled={cambioResp.cargando || !respNuevo || respNuevo === cliente?.responsable_id}
               onClick={cambiarResponsable}
             >
               {cambioResp.cargando ? 'Cambiando…' : 'Cambiar responsable'}
             </button>
           </div>
         </div>
       )}

       {editandoDatos && (
         <div className="card">
           <div className="label" style={{ marginTop: 0 }}>Datos del cliente</div>
           <input
             className="field"
             autoFocus
             value={formNombre}
             onChange={(e) => setFormNombre(e.target.value)}
             placeholder="razón social"
           />
           <div className="label">Sector</div>
           <select className="field" value={formSector} onChange={(e) => setFormSector(e.target.value)}>
             <option value="">— sin especificar —</option>
             {sectores?.map((s) => (
               <option key={s.id} value={s.nombre}>{s.nombre}</option>
             ))}
             {/* Si el cliente ya tiene un sector que ya no está en el catálogo,
                 no se pierde al abrir el formulario. */}
             {formSector && !sectores?.some((s) => s.nombre === formSector) && (
               <option value={formSector}>{formSector}</option>
             )}
           </select>
           <div className="label">Tamaño</div>
           <select className="field" value={formTamano} onChange={(e) => setFormTamano(e.target.value)}>
             <option value="">— sin especificar —</option>
             {TAMANOS.map((t) => (
               <option key={t} value={t}>{t}</option>
             ))}
           </select>
           <div className="label">Ubicación general</div>
           <input
             className="field"
             value={formUbicacion}
             onChange={(e) => setFormUbicacion(e.target.value)}
             placeholder="p. ej. Polígono Norte, Sevilla"
           />
           {guardadoDatos.error && (
             <div className="field-error-text" style={{ marginTop: 8 }}>{guardadoDatos.error}</div>
           )}
           <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
             <button
               className="btn btn-secondary"
               disabled={guardadoDatos.cargando}
               onClick={() => {
                 setEditandoDatos(false);
                 guardadoDatos.limpiarError();
               }}
             >
               Cancelar
             </button>
             <button
               className="btn btn-primary"
               disabled={guardadoDatos.cargando || !formNombre.trim()}
               onClick={guardarDatos}
             >
               {guardadoDatos.cargando ? 'Guardando…' : 'Guardar'}
             </button>
           </div>
         </div>
       )}

       <div className="lista-agrupada">
        {(hayBasicos || (responsableNombre && !esDireccionComercial)) && (
          <SeccionLista titulo="Datos" prominencia="tenue">
            {cliente?.sector && <FilaDato etiqueta="Sector" valor={cliente.sector} />}
            {cliente?.ubicacion_general && (
              <FilaDato etiqueta="Ubicación" valor={cliente.ubicacion_general} />
            )}
            {cliente?.tamano_aprox && <FilaDato etiqueta="Tamaño" valor={cliente.tamano_aprox} />}
            {responsableNombre && !esDireccionComercial && (
              <FilaDato etiqueta="Responsable" valor={responsableNombre} />
            )}
          </SeccionLista>
        )}

        {proyectos && proyectoGeneral ? (
          <ActividadProyecto
            proyectoId={proyectoGeneral.id}
            mensajeVacio="Aún no hay oportunidades, hallazgos ni visitas. Empieza una visita para llenarlo."
          />
        ) : proyectos && proyectos.length > 0 ? (
          <SeccionLista titulo="Proyectos" prominencia="principal">
            {proyectos.map((p) => (
              <FilaNavegable
                key={p.id}
                titulo={p.es_general ? `${p.nombre} (todo lo que no encaja en otro)` : p.nombre}
                subtitulo={p.estado !== 'activo' ? ESTADO_PROYECTO_LABEL[p.estado] ?? p.estado : undefined}
                to={`/clientes/${clienteId}/proyectos/${p.id}`}
              />
            ))}
          </SeccionLista>
        ) : null}

        {clienteId && (
          <SeccionLista titulo="Interlocutores">
            <div style={{ padding: '8px var(--fila-pad-x) 4px' }}>
              <DirectorioInterlocutores clienteId={clienteId} />
            </div>
          </SeccionLista>
        )}

        {!!ecosistema?.length && (
          <SeccionLista titulo="Ecosistema">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px var(--fila-pad-x)' }}>
              {/* Riesgos y oportunidades primero — es lo que mira el
                  comercial de un vistazo. Se recorta a ECO_VISIBLE. */}
              {[...ecosistema]
                .sort(
                  (a, b) =>
                    (a.naturaleza === 'riesgo' ? 0 : a.naturaleza === 'oportunidad' ? 1 : 2) -
                    (b.naturaleza === 'riesgo' ? 0 : b.naturaleza === 'oportunidad' ? 1 : 2)
                )
                .slice(0, ecoTodos ? undefined : ECO_VISIBLE)
                .map((item) => (
                  <EcoTag key={item.termino_id} nombre={item.nombre} naturaleza={item.naturaleza} />
                ))}
              {ecosistema.length > ECO_VISIBLE && (
                <button type="button" className="btn-enlace" onClick={() => setEcoTodos((v) => !v)}>
                  {ecoTodos ? 'ver menos' : `+${ecosistema.length - ECO_VISIBLE} más`}
                </button>
              )}
            </div>
          </SeccionLista>
        )}

        {creadorNombre && (
          <div className="ficha-creada">Ficha creada por {creadorNombre}</div>
        )}

        {/* Borrar cliente — al fondo y en tono riesgo, como en el resto de
            la app (detalle de visita, "Cerrar sesión" en Yo). Solo se
            OFRECE a quien realmente puede: mismo criterio que el backend
            (eliminar_cliente_completo: creado_por = auth.uid() OR
            dirección) — antes se mostraba a cualquier comercial aunque el
            servidor fuera a rechazarlo (hallazgo de la auditoría 2026-09-05:
            Borja veía "Borrar cliente" en una ficha ajena). */}
        {(esDireccionComercial || cliente?.creado_por === comercial?.id) && (
        confirmandoBorrarCliente ? (
          <div className="card card--riesgo">
            {previsualizandoCliente.cargando || !previsualizacionCliente ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Calculando qué se va a borrar…</div>
            ) : (
              <div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
                  Este cliente arrastra: {previsualizacionCliente.num_visitas} visita(s) completas,{' '}
                  {previsualizacionCliente.num_fotos} foto(s), {previsualizacionCliente.num_audios} audio(s),{' '}
                  {previsualizacionCliente.num_notas} nota(s), {previsualizacionCliente.num_hallazgos} hallazgo(s),{' '}
                  {previsualizacionCliente.num_oportunidades} oportunidad(es), {' '}
                  {previsualizacionCliente.num_proximos_pasos} próximo(s) paso(s) y{' '}
                  {previsualizacionCliente.num_ubicaciones} ubicación(es), en todos sus proyectos. Todo eso se
                  borrará también, para siempre. No se puede deshacer.
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 6 }}>
                  Esto no genera copias de seguridad automáticamente — si quieres conservar alguna visita, descárgala
                  antes desde "mi espacio".
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={cancelarBorradoCliente} disabled={borrandoCliente.cargando}>
                    Cancelar
                  </button>
                  <button
                    className="btn btn-peligro"
                    onClick={confirmarBorradoCliente}
                    disabled={borrandoCliente.cargando}
                  >
                    {borrandoCliente.cargando ? 'Borrando…' : 'Sí, borrar el cliente entero'}
                  </button>
                </div>
                {borrandoCliente.error && <div className="field-error-text" style={{ marginTop: 8 }}>{borrandoCliente.error}</div>}
              </div>
            )}
          </div>
        ) : (
          <SeccionLista>
            <FilaNavegable
              icono="borrar"
              titulo="Borrar cliente"
              tono="riesgo"
              chevron={false}
              onClick={pedirBorradoCliente}
            />
          </SeccionLista>
        )
        )}
       </div>
      </div>

      {proyectoGeneral && clienteId && (
        <AccionesProyecto
          clienteId={clienteId}
          proyectoId={proyectoGeneral.id}
          clienteNombre={cliente?.nombre}
        />
      )}
    </div>
  );
}

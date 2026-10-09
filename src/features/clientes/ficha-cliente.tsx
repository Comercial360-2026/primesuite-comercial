import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { desde, useVolverA } from '@/lib/volver-a';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { useOnline } from '@/hooks/use-online';
import { esSinRed } from '@/lib/red';
import { haceRelativo, fechaCorta } from '@/lib/fechas';
import { uuid } from '@/lib/uuid';
import { plural } from '@/lib/texto';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { reasignarCliente } from '@/lib/gestionar-comercial';
import { useBorrarSolicitado, useSwipeBorrar, useSwipeTerminar, useVerAlAbrir } from '@/lib/borrar-solicitado';
import { BotonPapelera } from '@/components/ui/boton-papelera';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { EstadoLista } from '@/components/ui/estado-lista';
import { ResultadosCuentaCrm, textoCuentaCrm, useSugerenciasCuenta, type CuentaCrm } from '@/features/clientes/cuenta-crm';
import { usarNombreDelCrm, vincularClienteACuenta, volverAlNombreAnterior } from '@/lib/vincular-cuenta-crm';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { FilaDato } from '@/components/ui/fila-dato';
import { EtiquetaSemaforo } from '@/components/ui/etiqueta-semaforo';
import { EcoTag } from '@/components/ui/eco-tag';
import { Icono } from '@/components/ui/iconos';
import { Aviso } from '@/components/ui/aviso';
import { SeccionColapsable } from '@/components/ui/seccion-colapsable';
import { ConfirmacionBorrado } from '@/components/ui/confirmacion-borrado';
import { AvisoNombreDuplicado } from '@/components/ui/aviso-nombre-duplicado';
import { useConfirmacionDuplicado } from '@/hooks/use-confirmacion-duplicado';
import { cargarEcosistemaCliente } from '@/lib/ecosistema';
import { CLIENTE_ARCHIVADO, hayNombreDuplicado, normalizarNombre } from '@/lib/nombres-cliente';
import { InterlocutoresClienteHoja } from './interlocutores-cliente-hoja';
import { PreguntaIAHoja, usePuedePreguntarIA } from './pregunta-ia-hoja';
import { BriefingHoja, useVisitaBriefing } from '@/features/visita/briefing-hoja';
import { AvisoVisitasSinCerrar } from '@/features/visita/aviso-visitas-sin-cerrar';
import { AccionesProyecto } from '@/features/proyectos/acciones-proyecto';
import { useProyectosCliente, ESTADO_PROYECTO_LABEL } from '@/hooks/use-proyectos-cliente';
import { quitarAdjuntosDeStorage } from '@/lib/buckets-visita';

interface PrevisualizacionBorrado {
  num_fotos: number;
  num_audios: number;
  num_archivos_sharepoint?: number;
  num_documentos: number;
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

export function FichaCliente() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // ← vuelve a donde se vino (listado, buscador, una visita…) o al listado.
  const volver = useVolverA('/clientes');
  const { comercial } = useSesionActual();
  const { encolar } = useSyncQueue(undefined);
  const queryClient = useQueryClient();

  const [ecoTodos, setEcoTodos] = useState(false);
  const [preguntaIAAbierta, setPreguntaIAAbierta] = useState(false);
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

  // "Ver terminados" — los proyectos terminados van plegados en la lista.
  const [verTerminados, setVerTerminados] = useState(false);

  // Interlocutores del cliente: se gestionan en una hoja superior que se abre
  // con un icono en la cabecera (igual que en la visita en curso).
  const [interlocutoresHojaAbierta, setInterlocutoresHojaAbierta] = useState(false);

  // Editar datos del cliente (nombre, sector, tamaño, ubicación general) —
  // el comercial responsable o Dirección. Sin cola offline: es un UPDATE
  // directo, requiere conexión.
  const TAMANOS = ['Pequeña', 'Mediana', 'Grande'] as const;
  const [editandoDatos, setEditandoDatos] = useState(false);
  // Qué se edita: tocar una fila abre solo ese dato (Nombre, Sector, Ubicación o Tamaño).
  const [campoEditar, setCampoEditar] = useState<'nombre' | 'sector' | 'ubicacion' | 'tamano'>('nombre');
  const [formNombre, setFormNombre] = useState('');
  const [formSector, setFormSector] = useState('');
  const [formTamano, setFormTamano] = useState('');
  const [formUbicacion, setFormUbicacion] = useState('');
  // Cuenta del CRM (migración 121): se vincula en su propia hoja, no en «Editar datos».
  const [crmAbierto, setCrmAbierto] = useState(false);
  const [buscaCrm, setBuscaCrm] = useState('');
  const guardadoCrm = useAccionAsync();
  // Al vincular, el cliente pasa a llamarse como la cuenta del CRM (el nombre anterior queda como alias de búsqueda).
  const [adoptarNombre, setAdoptarNombre] = useState(true);
  const guardadoDatos = useAccionAsync();
  const cambioArchivado = useAccionAsync();

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

  function abrirEditarDatos(campo: 'nombre' | 'sector' | 'ubicacion' | 'tamano') {
    setCampoEditar(campo);
    setFormNombre(cliente?.nombre ?? '');
    setFormSector(cliente?.sector ?? '');
    setFormTamano(cliente?.tamano_aprox ?? '');
    setFormUbicacion(cliente?.ubicacion_general ?? '');
    guardadoDatos.limpiarError();
    setEditandoDatos(true);
  }

  // Sin cuenta vinculada se busca ya por el nombre del cliente (como hace el alta): lo normal es que salga.
  function abrirCrm() {
    setBuscaCrm(cliente?.crm_accountid ? '' : (cliente?.nombre ?? ''));
    guardadoCrm.limpiarError();
    setCrmAbierto(true);
  }

  // Elegir una cuenta (o quitarla con `null`) guarda al instante y cierra la hoja; si falla, la hoja
  // se queda abierta con el error para reintentar.
  async function vincularCrm(cuenta: CuentaCrm | null) {
    if (!clienteId) return;
    if (!navigator.onLine) {
      guardadoCrm.establecerError('Necesitas conexión para vincular la cuenta del CRM.');
      return;
    }
    if (!cliente) return;
    await guardadoCrm.ejecutar(
      async () => {
        await vincularClienteACuenta(
          { id: cliente.id, nombre: cliente.nombre, nombre_alias: cliente.nombre_alias, ubicacion_general: cliente.ubicacion_general },
          cuenta,
          adoptarNombre,
          cuentaCrm
        );
      },
      {
        onExito: () => {
          setCrmAbierto(false);
          setBuscaCrm('');
          queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
          queryClient.invalidateQueries({ queryKey: ['clientes-por-cuenta-crm'] });
        },
      }
    );
  }

  // Nombre del cliente respecto a su cuenta ya vinculada: usar el del CRM, o volver al anterior (y no volver a ofrecerlo).
  async function cambiarNombreCrm(accion: 'usar' | 'volver') {
    if (!cliente || !cuentaCrm) return;
    if (!navigator.onLine) {
      guardadoCrm.establecerError('Necesitas conexión para cambiar el nombre.');
      return;
    }
    const base = { id: cliente.id, nombre: cliente.nombre, nombre_alias: cliente.nombre_alias, ubicacion_general: cliente.ubicacion_general };
    await guardadoCrm.ejecutar(
      async () => {
        if (accion === 'usar') await usarNombreDelCrm(base, cuentaCrm);
        else await volverAlNombreAnterior(base);
      },
      {
        onExito: () => {
          setCrmAbierto(false);
          queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
          queryClient.invalidateQueries({ queryKey: ['clientes-con-nombre-distinto'] });
        },
      }
    );
  }

  function cerrarEditarDatos() {
    setEditandoDatos(false);
    guardadoDatos.limpiarError();
  }

  // «Guardar» solo se activa si algo ha cambiado respecto a la ficha.
  function hayCambiosDatos() {
    return (
      formNombre.trim() !== (cliente?.nombre ?? '') ||
      formSector !== (cliente?.sector ?? '') ||
      formTamano !== (cliente?.tamano_aprox ?? '') ||
      formUbicacion.trim() !== (cliente?.ubicacion_general ?? '')
    );
  }

  async function guardarDatos() {
    if (!clienteId || !formNombre.trim()) return;
    if (!navigator.onLine) {
      guardadoDatos.establecerError('Necesitas conexión para editar los datos del cliente.');
      return;
    }
    await guardadoDatos.ejecutar(
      async () => {
        await conReintentoDeSesion(
          () =>
            supabase
              .from('cliente')
              .update(
                {
                  nombre: formNombre.trim(),
                  sector: formSector || null,
                  tamano_aprox: formTamano || null,
                  ubicacion_general: formUbicacion.trim() || null,
                },
                { count: 'exact' }
              )
              .eq('id', clienteId),
          'No se ha podido guardar (0 filas afectadas). Puede que no tengas permiso.'
        );
      },
      {
        onExito: () => {
          setEditandoDatos(false);
          queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
          queryClient.invalidateQueries({ queryKey: ['clientes-por-cuenta-crm'] });
        },
      }
    );
  }

  // Cliente inactivo = «ya no trabajamos con él» (prompt maestro 13): sale de
  // Clientes y de los buscadores de Nueva visita, conserva todo. Reversible,
  // así que sin confirmación. Mismo permiso y misma vía que Editar datos.
  async function cambiarArchivado(archivar: boolean) {
    if (!clienteId) return;
    if (!navigator.onLine) {
      cambioArchivado.establecerError('Necesitas conexión para cambiar el estado del cliente.');
      return;
    }
    await cambioArchivado.ejecutar(
      async () => {
        await conReintentoDeSesion(
          () =>
            supabase
              .from('cliente')
              .update({ estado_relacion: archivar ? CLIENTE_ARCHIVADO : 'activo' }, { count: 'exact' })
              .eq('id', clienteId),
          'No se ha podido guardar (0 filas afectadas). Puede que no tengas permiso.'
        );
      },
      {
        onExito: () => {
          queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
          queryClient.invalidateQueries({ queryKey: ['cliente-nombre', clienteId] });
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
          queryClient.invalidateQueries({ queryKey: ['planificar-buscar-cliente'] });
          queryClient.invalidateQueries({ queryKey: ['empezar-visita-buscar'] });
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

  const {
    data: cliente,
    isLoading: cargandoCliente,
    isError: errorCliente,
    isPaused: pausadoCliente,
    refetch: refetchCliente,
  } = useQuery({
    queryKey: ['cliente', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre, nombre_alias, estado_relacion, sector, ubicacion_general, tamano_aprox, responsable_id, creado_por, crm_accountid, crm_no_autovincular, crm_nombre_propio')
        .eq('id', clienteId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const sinConexionCliente = pausadoCliente && cliente === undefined;

  const { data: cuentaCrm } = useQuery({
    queryKey: ['crm-cuenta', cliente?.crm_accountid],
    enabled: !!cliente?.crm_accountid,
    queryFn: async (): Promise<CuentaCrm | null> => {
      const { data, error } = await supabase
        .from('crm_cuenta')
        .select('accountid, nombre, ciudad')
        .eq('accountid', cliente!.crm_accountid!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  function reintentarCliente() {
    queryClient.resetQueries({ queryKey: ['cliente', clienteId] });
    refetchCliente();
  }

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
  const proyectoDuplicado = hayNombreDuplicado(nombreProyecto, proyectos ?? []);
  const [dupProyectoConfirmado, confirmarDupProyecto] = useConfirmacionDuplicado(
    nombreProyecto.trim().toLowerCase()
  );

  // Solo el recuento, para el badge del icono de Interlocutores en la
  // cabecera. Clave propia (no la del directorio, que trae más columnas) para
  // no cruzar cachés — ver [[primesuite-query-key-colision]].
  const { data: nInterlocutores = 0 } = useQuery({
    queryKey: ['interlocutores-cliente-count', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('interlocutor')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId!)
        .eq('activo', true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: ecosistema } = useQuery({
    queryKey: ['ecosistema-completo', clienteId],
    enabled: !!clienteId,
    queryFn: () => cargarEcosistemaCliente(clienteId!),
  });

  // Con red: INSERT directo (instantáneo, la ficha ya es navegable) — mismo
  // criterio que crearCliente() en alta-rapida-cliente.tsx. Sin red: se
  // encola (P14) y se sincroniza luego; entrar en su ficha antes de que
  // sincronice no encontraría la fila todavía, así que solo se navega si se
  // pudo confirmar al momento.
  async function crearProyecto() {
    if (!nombreProyecto.trim() || !comercial || !clienteId || (proyectoDuplicado && !dupProyectoConfirmado)) return;
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
          if (!esSinRed(error?.message)) throw new Error(error?.message ?? 'No se pudo crear el proyecto.');
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
          navigate(`/clientes/${clienteId}/proyectos/${id}`, { state: desde(location) });
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

  // Todo cliente tiene ≥1 proyecto y todos son fila navegable, con nombre.
  // Terminados: se pliegan tras "Ver terminados (N)" — no ensucian la lista
  // del día a día. Activos y pausados se listan siempre.
  const proyectosVigentes = (proyectos ?? []).filter((p) => p.estado !== 'terminado');
  const proyectosTerminados = (proyectos ?? []).filter((p) => p.estado === 'terminado');
  // Proyecto de partida para la barra "Iniciar visita / Planificar": el
  // primero vigente (con 2+ proyectos, la ventana "¿A qué vas?" pregunta a
  // cuál va la visita).
  const proyectoBase = proyectosVigentes[0] ?? proyectos?.[0] ?? null;

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
          await quitarAdjuntosDeStorage(rutas);
        }
        // A partir de aquí los adjuntos ya no existen en Storage: un fallo
        // de red justo en esta llamada dejaría el cliente vivo pero sin sus
        // fotos/audios — un borrado parcial irreversible. Se reintenta un
        // par de veces antes de rendirse, y si aun así falla el mensaje
        // deja claro que los adjuntos ya se han ido, para no repetir el
        // borrado pensando que no hizo nada.
        let ultimoError: string | null = null;
        for (let intento = 1; intento <= 3; intento++) {
          const { error } = await supabase.rpc('eliminar_cliente_completo', { p_cliente_id: clienteId! });
          if (!error) return;
          ultimoError = error.message;
          if (intento < 3) await new Promise((r) => setTimeout(r, 500));
        }
        throw new Error(
          rutas.length
            ? `Las fotos y audios ya se han borrado, pero el cliente no se pudo eliminar del todo (${ultimoError}). Vuelve a intentarlo.`
            : ultimoError!
        );
      },
      {
        onExito: () => {
          // Sin esto, "Clientes" seguía mostrando el cliente ya borrado
          // hasta que la caché de 60s caducaba sola o el usuario refrescaba
          // a mano — mismo patrón que ya se cubría al borrar una visita
          // suelta, pero que faltaba aquí.
          queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
          navigate(volver, { replace: true });
        },
      }
    );
  }

  const puedeEditar = esDireccionComercial || cliente?.responsable_id === comercial?.id;
  const archivado = cliente?.estado_relacion === CLIENTE_ARCHIVADO;
  const puedePreguntarIA = usePuedePreguntarIA(clienteId);

  // Cliente creado a mano que ya aparece en el CRM: se sugiere (o, si la coincidencia es exacta y única, se vincula solo).
  const sinCuentaEditable = !!cliente && !cliente.crm_accountid && !archivado && puedeEditar;
  const clienteParaSugerir = useMemo(
    () => (sinCuentaEditable && cliente ? [{ id: cliente.id, nombre: cliente.nombre }] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cambia con el id/nombre
    [sinCuentaEditable, cliente?.id, cliente?.nombre]
  );
  const sugerencias = useSugerenciasCuenta(clienteParaSugerir);
  const sugerencia = cliente ? sugerencias.get(cliente.id) : undefined;
  // ¿Se llama igual que su cuenta del CRM? (si no, y no decidió conservar el suyo, se le ofrece usar el del CRM)
  const nombreCoincideConCrm =
    !cuentaCrm || !cliente || cliente.crm_nombre_propio || normalizarNombre(cuentaCrm.nombre) === normalizarNombre(cliente.nombre);
  const [vinculadoAuto, setVinculadoAuto] = useState<null | { cuenta: string; antes: string }>(null);
  const autoIntentadoPara = useRef<string | null>(null);
  useEffect(() => {
    const exacta = sugerencia?.exacta;
    if (!exacta || !cliente || cliente.crm_no_autovincular || autoIntentadoPara.current === cliente.id || !navigator.onLine) return;
    autoIntentadoPara.current = cliente.id;
    void vincularClienteACuenta(
      { id: cliente.id, nombre: cliente.nombre, nombre_alias: cliente.nombre_alias, ubicacion_general: cliente.ubicacion_general },
      exacta,
      true
    )
      .then(() => {
        setVinculadoAuto({ cuenta: exacta.nombre, antes: cliente.nombre });
        queryClient.invalidateQueries({ queryKey: ['cliente', cliente.id] });
        queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
        queryClient.invalidateQueries({ queryKey: ['clientes-por-cuenta-crm'] });
      })
      .catch(() => {
        /* sin permiso o sin red: queda la sugerencia manual */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez por cliente
  }, [sugerencia?.exacta?.accountid, cliente?.id]);

  // Briefing: vive por visita; el hook elige a cuál colgarlo.
  const visitaIdBriefing = useVisitaBriefing(clienteId);
  const swipeBorrar = useSwipeBorrar();
  const swipeTerminar = useSwipeTerminar();
  const online = useOnline();

  // Reabrir un proyecto terminado desde la lista: reversible, sin confirmación (como «Inactivo»).
  async function reabrirProyecto(proyectoId: string) {
    if (!navigator.onLine) return;
    try {
      await conReintentoDeSesion(
        () => supabase.from('proyecto').update({ estado: 'activo' }, { count: 'exact' }).eq('id', proyectoId),
        'No se ha podido reabrir (0 filas afectadas). Puede que no tengas permiso.'
      );
      queryClient.invalidateQueries({ queryKey: ['proyectos-cliente', clienteId] });
    } catch {
      /* sin permiso o sin red: la fila sigue como estaba; en la ficha del proyecto sale el motivo */
    }
  }
  const confirmacionBorradoRef = useVerAlAbrir(confirmandoBorrarCliente);
  useBorrarSolicitado(() => void pedirBorradoCliente(), esDireccionComercial && !!cliente);
  const [briefingAbierto, setBriefingAbierto] = useState(false);

  return (
    <div className="screen screen--split">
      <CabeceraDetalle
        titulo={cliente?.nombre ?? '…'}
        ayuda="ficha-cliente"
        subtitulo={cliente?.sector || undefined}
        avatar={cliente?.nombre}
        volverA={volver}
        derecha={
          <>
            {clienteId && (
              <button
                type="button"
                className="boton-icono"
                aria-label={`Interlocutores${nInterlocutores ? ` (${nInterlocutores})` : ''}`}
                title={`Interlocutores${nInterlocutores ? ` (${nInterlocutores})` : ''}`}
                onClick={() => setInterlocutoresHojaAbierta(true)}
              >
                <Icono nombre="interlocutor" size={18} />
                {nInterlocutores > 0 && (
                  <span className="boton-icono__badge">{nInterlocutores}</span>
                )}
              </button>
            )}
            {puedePreguntarIA && (
              <button
                type="button"
                className="boton-icono"
                aria-label="Pregunta a la IA"
                title="Pregunta a la IA sobre este cliente"
                onClick={() => setPreguntaIAAbierta(true)}
              >
                <Icono nombre="ia" size={18} />
              </button>
            )}
            {!!visitaIdBriefing && (
              <button
                type="button"
                className="boton-icono"
                aria-label="Briefing"
                title="Briefing de la próxima visita"
                onClick={() => setBriefingAbierto(true)}
              >
                <Icono nombre="briefing" size={18} />
              </button>
            )}
            {esDireccionComercial && <BotonPapelera etiqueta="Borrar cliente" onClick={() => void pedirBorradoCliente()} />}
          </>
        }
      />

      <div className="screen__scroll">
        {esDireccionComercial && confirmandoBorrarCliente && (
          <div ref={confirmacionBorradoRef}>
          {previsualizandoCliente.cargando || !previsualizacionCliente ? (
            <div className="card card--riesgo">
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>Calculando qué se va a borrar…</div>
            </div>
          ) : (
            // Mismo panel de riesgo que el resto de la app (p. ej. "Borrar
            // proyecto" en ficha-proyecto.tsx) — antes estaba reescrito a
            // mano aquí, dos copias del mismo panel que mantener sincronizadas.
            <ConfirmacionBorrado
              onCancelar={cancelarBorradoCliente}
              onConfirmar={confirmarBorradoCliente}
              cargando={borrandoCliente.cargando}
              error={borrandoCliente.error}
              confirmar="Sí, borrar el cliente entero"
            >
              Este cliente arrastra: {plural(previsualizacionCliente.num_visitas, 'visita completa', 'visitas completas')},{' '}
              {plural(previsualizacionCliente.num_fotos, 'foto', 'fotos')},{' '}
              {plural(previsualizacionCliente.num_audios, 'audio', 'audios')},{' '}
              {plural(previsualizacionCliente.num_documentos, 'documento', 'documentos')},{' '}
              {plural(previsualizacionCliente.num_notas, 'nota', 'notas')},{' '}
              {plural(previsualizacionCliente.num_hallazgos, 'hallazgo', 'hallazgos')},{' '}
              {plural(previsualizacionCliente.num_oportunidades, 'oportunidad', 'oportunidades')},{' '}
              {plural(previsualizacionCliente.num_proximos_pasos, 'próximo paso', 'próximos pasos')} y{' '}
              {plural(previsualizacionCliente.num_ubicaciones, 'ubicación', 'ubicaciones')}, en todos sus proyectos. Todo eso se
              borrará también, para siempre.
              {!!previsualizacionCliente.num_archivos_sharepoint && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', fontWeight: 400, marginTop: 6 }}>
                  {plural(previsualizacionCliente.num_archivos_sharepoint, 'archivo copiado', 'archivos copiados')} en
                  SharePoint {previsualizacionCliente.num_archivos_sharepoint === 1 ? 'se conserva' : 'se conservan'} allí: la app no
                  {previsualizacionCliente.num_archivos_sharepoint === 1 ? ' lo borra' : ' los borra'}.
                </div>
              )}
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', fontWeight: 400, marginTop: 6 }}>
                Esto no genera copias de seguridad automáticamente — si quieres conservar alguna visita, descárgala
                antes desde "mi espacio".
              </div>
            </ConfirmacionBorrado>
          )}
          </div>
        )}
       {cargandoCliente && <EstadoLista estado="cargando" />}
       {sinConexionCliente && <EstadoLista estado="sin-conexion" onReintentar={reintentarCliente} />}
       {errorCliente && (
         <EstadoLista
           estado="error"
           mensaje="No se ha podido cargar este cliente."
           onReintentar={reintentarCliente}
         />
       )}
       {(ultimaVisitaRel || semaforo) && (
         <div className="ficha-vitals" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
           {ultimaVisitaRel && <span>Última visita <b>{ultimaVisitaRel}</b></span>}
           {semaforo && <EtiquetaSemaforo valor={semaforo.semaforo} />}
         </div>
       )}
       {archivado && (
         <Aviso titulo="Cliente inactivo">
           No sale en Clientes ni al elegir cliente para una visita. Para volver a visitarlo, reactívalo aquí debajo.
         </Aviso>
       )}
       {archivado && puedeEditar && (
         <SeccionLista>
           <FilaNavegable
             icono="restaurar"
             titulo="Reactivar cliente"
             subtitulo={cambioArchivado.cargando ? 'Guardando…' : 'Vuelve a Clientes y se puede visitar otra vez'}
             chevron={false}
             disabled={cambioArchivado.cargando}
             onClick={() => cambiarArchivado(false)}
           />
         </SeccionLista>
       )}
       {vinculadoAuto && cliente?.crm_accountid && (
         <Aviso tipo="info" titulo="Vinculado con el CRM">
           Este cliente ya estaba en el CRM como «{vinculadoAuto.cuenta}»: se ha vinculado y ahora se llama así (antes «{vinculadoAuto.antes}», que
           sigue encontrándose al buscar). Si no es la cuenta correcta, deshazlo o cámbiala en «Cuenta CRM».
           <div style={{ marginTop: 8 }}>
             <button
               type="button"
               className="btn btn-secondary"
               disabled={guardadoCrm.cargando}
               onClick={() => {
                 setVinculadoAuto(null);
                 void vincularCrm(null);
               }}
             >
               Deshacer
             </button>
           </div>
         </Aviso>
       )}
       {!vinculadoAuto && sinCuentaEditable && !!sugerencia?.candidatas.length && (
         <SeccionLista>
           <FilaNavegable
             icono="buscar"
             titulo={
               sugerencia.candidatas.length === 1
                 ? `Parece estar en el CRM: «${sugerencia.candidatas[0].nombre}»`
                 : `Parece estar en el CRM (${sugerencia.candidatas.length} cuentas parecidas)`
             }
             subtitulo={
               sugerencia.candidatas.length === 1
                 ? `${sugerencia.candidatas[0].ciudad ?? 'Sin ciudad'} · toca para vincularla`
                 : 'Toca para elegir la suya'
             }
             tono="aviso"
             onClick={abrirCrm}
           />
         </SeccionLista>
       )}
       {clienteId && <AvisoVisitasSinCerrar clienteId={clienteId} />}
       {/* Acción: lo esporádico como chip, no como fila de lista ni botón
           ancho — regla 3 del modelo de 10 reglas. */}
       {/* Regla #13: un chip que abre su panel debajo se ve activo mientras
           está abierto (chip--on, como "Marcar zonas" en la visita) — si no,
           "toco y no pasa nada". */}
       {/* "Editar datos" = lápiz de la cabecera. "Nuevo proyecto" = el "+" de
           la sección Proyectos. Aquí solo queda "Responsable" (dirección). */}
       {esDireccionComercial && (
         <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 4px' }}>
           <button
             type="button"
             className={`chip${cambiandoResp ? ' chip--on' : ''}`}
             aria-expanded={cambiandoResp}
             onClick={() => {
               if (cambiandoResp) {
                 setCambiandoResp(false);
                 return;
               }
               setRespNuevo(cliente?.responsable_id ?? '');
               setCambiandoResp(true);
             }}
           >
             Responsable: {responsableNombre ?? 'sin asignar'}
           </button>
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
             <div style={{ marginTop: 8 }}>
               <Aviso tipo="error">{cambioResp.error}</Aviso>
             </div>
           )}
           <div className="fila-btns" style={{ marginTop: 10 }}>
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
         <HojaSuperior
           titulo={{ nombre: 'Nombre', sector: 'Sector', ubicacion: 'Ubicación', tamano: 'Tamaño' }[campoEditar]}
           onCerrar={cerrarEditarDatos}
         >
           {campoEditar !== 'nombre' && (
             <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '0 0 var(--space-2)' }}>
               Sale en la cabecera de los informes.
             </p>
           )}
           {campoEditar === 'nombre' && (
             <>
             <div className="label" style={{ marginTop: 0 }}>Nombre</div>
             <input
               className="field"
               autoFocus
               // Ver alta-rapida-cliente.tsx: "off" no evita "Autorrellenar
               // contacto" en un campo de nombre de EMPRESA, "nope" sí.
               autoComplete="nope"
               value={formNombre}
               onChange={(e) => setFormNombre(e.target.value)}
               placeholder="razón social"
             />
             <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', margin: '4px 0 0' }}>
               Cambiarlo aquí no cambia la cuenta del CRM.
             </p>
             </>
           )}
           {campoEditar === 'sector' && (
             <>
             <div className="label">Sector</div>
             <select className="field" autoFocus={campoEditar === 'sector'} value={formSector} onChange={(e) => setFormSector(e.target.value)}>
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
             </>
           )}
           {campoEditar === 'tamano' && (
             <>
             <div className="label">Tamaño</div>
             <select className="field" autoFocus={campoEditar === 'tamano'} value={formTamano} onChange={(e) => setFormTamano(e.target.value)}>
               <option value="">— sin especificar —</option>
               {TAMANOS.map((t) => (
                 <option key={t} value={t}>{t}</option>
               ))}
             </select>
             </>
           )}
           {campoEditar === 'ubicacion' && (
             <>
             <div className="label">Ubicación general</div>
             <input
               className="field"
               autoFocus={campoEditar === 'ubicacion'}
               autoComplete="off"
               value={formUbicacion}
               onChange={(e) => setFormUbicacion(e.target.value)}
               placeholder="p. ej. Polígono Norte, Sevilla"
             />
             </>
           )}
           {guardadoDatos.error && (
             <div style={{ marginTop: 8 }}>
               <Aviso tipo="error">{guardadoDatos.error}</Aviso>
             </div>
           )}
           <div className="fila-btns" style={{ marginTop: 10 }}>
             <button
               className="btn btn-secondary"
               disabled={guardadoDatos.cargando}
               onClick={cerrarEditarDatos}
             >
               Cancelar
             </button>
             <button
               className="btn btn-primary"
               disabled={guardadoDatos.cargando || !formNombre.trim() || !hayCambiosDatos()}
               onClick={guardarDatos}
             >
               {guardadoDatos.cargando ? 'Guardando…' : 'Guardar'}
             </button>
           </div>
         </HojaSuperior>
       )}

       <div className="lista-agrupada">
        {cliente && (
          <>
            {/* Lo importante, siempre a la vista: la cuenta del CRM (sin ella el briefing no encuentra al cliente) y
                quién lo lleva. Sector, ubicación y tamaño solo salen en la cabecera de los informes: van plegados. */}
            <SeccionLista>
              {responsableNombre && !esDireccionComercial && <FilaDato etiqueta="Responsable" valor={responsableNombre} />}
              {puedeEditar ? (
                <FilaNavegable
                  titulo="Cuenta CRM"
                  subtitulo={
                    cliente.crm_accountid
                      ? cuentaCrm && !nombreCoincideConCrm
                        ? `El CRM la llama «${cuentaCrm.nombre}» · toca para usar ese nombre`
                        : cliente.nombre_alias
                          ? `Nombre anterior: «${cliente.nombre_alias}»`
                          : undefined
                      : 'Sin ella, el briefing no encuentra a este cliente. Toca para vincularla.'
                  }
                  valor={cliente.crm_accountid ? (cuentaCrm ? textoCuentaCrm(cuentaCrm) : '…') : 'sin vincular'}
                  tono={cliente.crm_accountid ? (cuentaCrm && !nombreCoincideConCrm ? 'aviso' : 'neutral') : 'aviso'}
                  onClick={abrirCrm}
                />
              ) : (
                <FilaDato
                  etiqueta="Cuenta CRM"
                  valor={cliente.crm_accountid ? (cuentaCrm ? textoCuentaCrm(cuentaCrm) : '…') : 'sin vincular'}
                />
              )}
            </SeccionLista>
            {(puedeEditar || !!(cliente.sector || cliente.ubicacion_general || cliente.tamano_aprox)) && (
              <SeccionColapsable
                titulo="Datos del cliente"
                cantidad={4}
                siempreAbrible
                recordarComo={`cliente-${cliente.id}-datos`}
                detalle={[cliente.sector, cliente.ubicacion_general, cliente.tamano_aprox].filter(Boolean).join(' · ') || 'sin completar'}
              >
                {/* Quien puede editar ve siempre Nombre, Sector, Ubicación y Tamaño (vacíos como «sin indicar») y
                    al tocar uno abre solo ese dato; el resto solo ve los rellenos. */}
                <SeccionLista>
                  {puedeEditar && (
                    <FilaNavegable titulo="Nombre" valor={cliente.nombre} onClick={() => abrirEditarDatos('nombre')} />
                  )}
                  {([
                    ['Sector', cliente.sector, 'sector'],
                    ['Ubicación', cliente.ubicacion_general, 'ubicacion'],
                    ['Tamaño', cliente.tamano_aprox, 'tamano'],
                  ] as const).map(([etiqueta, valor, campo]) =>
                    puedeEditar ? (
                      <FilaNavegable
                        key={etiqueta}
                        titulo={etiqueta}
                        valor={valor || 'sin indicar'}
                        valorTenue={!valor}
                        onClick={() => abrirEditarDatos(campo)}
                      />
                    ) : (
                      valor && <FilaDato key={etiqueta} etiqueta={etiqueta} valor={valor} />
                    )
                  )}
                </SeccionLista>
              </SeccionColapsable>
            )}
          </>
        )}

        {/* Lo que sabemos que tiene, sacado de los hallazgos de todas sus
            visitas: es del cliente entero, no de un proyecto — por eso va
            con sus datos y no bajo los proyectos (prompt maestro 13). */}
        {!!ecosistema?.length && (
          <SeccionLista titulo="Qué tiene instalado">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px var(--fila-pad-x)' }}>
              {/* Ya viene ordenado (términos antes que categorías sueltas).
                  Se recorta a ECO_VISIBLE. */}
              {ecosistema
                .slice(0, ecoTodos ? undefined : ECO_VISIBLE)
                .map((item) => (
                  <EcoTag key={item.clave} nombre={item.nombre} tipo={item.tipo} />
                ))}
              {ecosistema.length > ECO_VISIBLE && (
                <button type="button" className="eco-tag-mas" onClick={() => setEcoTodos((v) => !v)}>
                  {ecoTodos ? 'ver menos' : `+${ecosistema.length - ECO_VISIBLE} más`}
                </button>
              )}
            </div>
          </SeccionLista>
        )}

        {/* Proyectos — una sección con su título y un "+" al lado para dar de
            alta uno. Todos los proyectos del cliente son fila navegable a su
            ficha; los terminados se pliegan tras "Ver terminados (N)". */}
        {proyectos && (
          <SeccionLista
            titulo="Proyectos"
            prominencia="principal"
            accion={
              <button
                type="button"
                className="boton-icono"
                aria-label="Nuevo proyecto"
                title="Nuevo proyecto"
                aria-expanded={creandoProyecto}
                onClick={() => setCreandoProyecto((v) => !v)}
              >
                <Icono nombre="mas" size={18} />
              </button>
            }
          >
            {proyectosVigentes.map((p) => {
              // Remate de una línea con la actividad de ESTE proyecto — para
              // no tener que entrar a cada uno a saber si tiene algo abierto.
              // El historial completo (por visita) vive dentro del propio
              // proyecto, no en la ficha del cliente (ni con un solo proyecto).
              const estadoTxt =
                p.estado !== 'activo' ? ESTADO_PROYECTO_LABEL[p.estado] ?? p.estado : null;
              const actividadTxt = p.visitaEnCurso
                ? 'Visita en curso'
                : p.ultimaVisitaFecha
                  ? `${p.numVisitas} ${p.numVisitas === 1 ? 'visita' : 'visitas'} · última ${fechaCorta(p.ultimaVisitaFecha)}`
                  : 'Sin visitas todavía';
              return (
                <FilaNavegable
                  key={p.id}
                  avatar={p.nombre}
                  avatarForma="proyecto"
                  titulo={p.nombre}
                  subtitulo={[estadoTxt, actividadTxt].filter(Boolean).join(' · ')}
                  tono={p.visitaEnCurso ? 'aviso' : 'neutral'}
                  to={`/clientes/${clienteId}/proyectos/${p.id}`}
                  state={desde(location)}
                  swipe={[
                    swipeTerminar(`/clientes/${clienteId}/proyectos/${p.id}`),
                    ...(proyectosVigentes.length > 1 ? [swipeBorrar(`/clientes/${clienteId}/proyectos/${p.id}`)] : []),
                  ]}
                />
              );
            })}
            {proyectosTerminados.length > 0 && (
              <FilaNavegable
                titulo={
                  verTerminados
                    ? 'Ocultar terminados'
                    : `Ver terminados (${proyectosTerminados.length})`
                }
                chevron={false}
                valorTenue
                onClick={() => setVerTerminados((v) => !v)}
              />
            )}
            {verTerminados &&
              proyectosTerminados.map((p) => (
                <FilaNavegable
                  key={p.id}
                  icono="check-circulo"
                  titulo={p.nombre}
                  valor="terminado"
                  valorTenue
                  densidad="compacta"
                  to={`/clientes/${clienteId}/proyectos/${p.id}`}
                  state={desde(location)}
                  swipe={[
                    {
                      etiqueta: 'Reabrir',
                      icono: 'restaurar',
                      desactivada: !online,
                      motivo: 'Necesitas conexión para reabrir el proyecto',
                      onAccion: () => void reabrirProyecto(p.id),
                    },
                    ...(proyectosVigentes.length > 0 ? [swipeBorrar(`/clientes/${clienteId}/proyectos/${p.id}`)] : []),
                  ]}
                />
              ))}
          </SeccionLista>
        )}

        {creandoProyecto && (
          // HojaSuperior, no tarjeta suelta en el scroll — antes competía por
          // espacio con la barra fija "Iniciar visita"/"Planificar otro día":
          // con el teclado abierto casi no quedaba sitio (Cesar, 14 sept). La
          // hoja tapa esa barra mientras se escribe, como el resto de la app.
          <HojaSuperior
            titulo="Nuevo proyecto"
            onCerrar={() => {
              setCreandoProyecto(false);
              setNombreProyecto('');
              creacionProyecto.limpiarError();
            }}
          >
            <input
              className={`field${creacionProyecto.error ? ' field--error' : ''}`}
              autoFocus
              autoComplete="off"
              value={nombreProyecto}
              onChange={(e) => setNombreProyecto(e.target.value)}
              placeholder="mantenimiento, obra nueva, postventa…"
            />
            {creacionProyecto.error && <div className="field-error-text">{creacionProyecto.error}</div>}
            {proyectoDuplicado && !dupProyectoConfirmado && (
              <AvisoNombreDuplicado
                titulo="Ya hay un proyecto con este nombre."
                subtitulo="Si es una línea de negocio distinta, puedes crearlo igual."
                onConfirmar={confirmarDupProyecto}
              />
            )}
            <button
              className="btn btn-primary"
              style={{ marginTop: 12, width: '100%' }}
              disabled={creacionProyecto.cargando || !nombreProyecto.trim() || (proyectoDuplicado && !dupProyectoConfirmado)}
              onClick={crearProyecto}
            >
              {creacionProyecto.cargando ? 'Creando…' : 'Crear proyecto'}
            </button>
          </HojaSuperior>
        )}

        {crmAbierto && (
          <HojaSuperior titulo="Cuenta del CRM" onCerrar={() => setCrmAbierto(false)}>
            {cliente?.crm_accountid && (
              <SeccionLista titulo="Vinculada ahora">
                <FilaNavegable
                  titulo={cuentaCrm ? textoCuentaCrm(cuentaCrm) : '…'}
                  subtitulo={cliente.nombre_alias ? `Al quitarla vuelve a llamarse «${cliente.nombre_alias}»` : undefined}
                  valor="quitar"
                  valorTenue
                  chevron={false}
                  disabled={guardadoCrm.cargando}
                  onClick={() => void vincularCrm(null)}
                />
                {cuentaCrm && !nombreCoincideConCrm && (
                  <FilaNavegable
                    titulo="Usar el nombre del CRM"
                    subtitulo={`Pasa a llamarse «${cuentaCrm.nombre}» (antes «${cliente.nombre}», que se sigue encontrando al buscar)`}
                    chevron={false}
                    disabled={guardadoCrm.cargando}
                    onClick={() => void cambiarNombreCrm('usar')}
                  />
                )}
                {cliente.nombre_alias && (
                  <FilaNavegable
                    titulo={`Volver a «${cliente.nombre_alias}»`}
                    subtitulo="Mantiene la cuenta vinculada y su nombre propio"
                    chevron={false}
                    disabled={guardadoCrm.cargando}
                    onClick={() => void cambiarNombreCrm('volver')}
                  />
                )}
              </SeccionLista>
            )}
            <input
              className="field"
              autoFocus
              autoComplete="off"
              value={buscaCrm}
              onChange={(e) => setBuscaCrm(e.target.value)}
              placeholder="busca otra cuenta por nombre (mín. 3 letras)"
            />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '10px 4px', fontSize: 'var(--text-sm)' }}>
              <input type="checkbox" checked={adoptarNombre} onChange={(e) => setAdoptarNombre(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                Usar el nombre de la cuenta del CRM
                <span style={{ display: 'block', color: 'var(--ink-400)', fontSize: 'var(--text-xs)' }}>
                  «{cliente?.nombre_alias ?? cliente?.nombre}» se guarda como nombre anterior y se sigue encontrando al buscar.
                </span>
              </span>
            </label>
            <ResultadosCuentaCrm
              texto={buscaCrm}
              excluirClienteId={clienteId}
              titulo={cliente?.crm_accountid ? 'Cambiar por' : `Cuentas parecidas a «${cliente?.nombre ?? ''}»`}
              disabled={guardadoCrm.cargando}
              onElegir={(c, otro) =>
                otro
                  ? guardadoCrm.establecerError(
                      `Esa cuenta ya es del cliente «${otro.nombre}» (o de la misma empresa). Si son el mismo cliente, pide a Dirección que los fusione en Deduplicación.`
                    )
                  : void vincularCrm(c)
              }
            />
            {guardadoCrm.error && (
              <div style={{ marginTop: 8 }}>
                <Aviso tipo="error">{guardadoCrm.error}</Aviso>
              </div>
            )}
          </HojaSuperior>
        )}

        {creadorNombre && (
          <div className="ficha-creada">Ficha creada por {creadorNombre}</div>
        )}

        {puedeEditar && !archivado && (
          <SeccionLista>
            <FilaNavegable
              icono="oculto"
              titulo="Marcar como inactivo"
              subtitulo={
                cambioArchivado.cargando
                  ? 'Guardando…'
                  : 'Ya no trabajáis con él: sale de las listas; no borra nada, ni archivos ni SharePoint'
              }
              chevron={false}
              disabled={cambioArchivado.cargando}
              onClick={() => cambiarArchivado(true)}
            />
          </SeccionLista>
        )}
        {cambioArchivado.error && <Aviso tipo="error">{cambioArchivado.error}</Aviso>}

        {/* Borrar cliente — solo Dirección (prompt maestro 13): con los
            clientes del CRM, borrar es para errores (duplicado, prueba); lo
            normal es Cliente inactivo. Al fondo y en tono riesgo, como en el resto
            de la app. El backend (eliminar_cliente_completo) sigue
            admitiendo también al creador; la UI ya no se lo ofrece. */}
       </div>
      </div>

      {proyectoBase && clienteId && !archivado && (
        <AccionesProyecto
          clienteId={clienteId}
          proyectoId={proyectoBase.id}
          clienteNombre={cliente?.nombre}
          proyectos={proyectos}
        />
      )}

      {interlocutoresHojaAbierta && clienteId && (
        <InterlocutoresClienteHoja
          clienteId={clienteId}
          onCerrar={() => setInterlocutoresHojaAbierta(false)}
        />
      )}

      {preguntaIAAbierta && clienteId && cliente?.nombre && (
        <PreguntaIAHoja
          clienteId={clienteId}
          clienteNombre={cliente.nombre}
          onCerrar={() => setPreguntaIAAbierta(false)}
        />
      )}

      {briefingAbierto && clienteId && cliente?.nombre && visitaIdBriefing && (
        <BriefingHoja
          visitaId={visitaIdBriefing}
          clienteId={clienteId}
          clienteNombre={cliente.nombre}
          onCerrar={() => setBriefingAbierto(false)}
        />
      )}
    </div>
  );
}

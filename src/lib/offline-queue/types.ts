// Cola de operaciones offline — ver 09_arquitectura_tecnica.md §4.
// Cada entrada representa una operación pendiente de sincronizar con Supabase.
// El id se genera en cliente (uuid) y se reutiliza como PK real al sincronizar,
// para que la UI pueda referenciar el registro antes de que exista en el servidor.

export type EntidadSincronizable =
  | 'cliente'
  | 'proyecto'
  | 'visita'
  | 'hallazgo'
  | 'captura_libre'
  | 'oportunidad'
  | 'proximo_paso'
  | 'ubicacion';

export type EstadoOperacion = 'pendiente' | 'subiendo' | 'completado' | 'error';

// ----------------------------------------------------------------------------
// Contratos de operación — un payload tipado por entidad sincronizable.
// Son el "de qué depende qué" y "qué campos necesita cada tabla al crear",
// alineados 1:1 con las columnas obligatorias de 01_schema.sql (sin los
// campos generados por la base de datos: id ya lo pone el cliente, creado_en
// y actualizado_en los pone el trigger/default).
// ----------------------------------------------------------------------------

// El alta de cliente pasa por la cola SOLO como reserva para cuando no hay
// red (ver alta-rapida-cliente.tsx): con conexión sigue siendo un INSERT
// directo. Es un INSERT simple, sin doble escritura atómica como `visita`.
export interface ClientePayload {
  nombre: string;
  creadoPor: string;
  // Responsable de cartera = quien lo crea. Dirección lo reasigna luego con
  // "Cambiar responsable" (RPC de traspaso de cartera, migración 77).
  responsableId: string;
  estadoRelacion?: string; // por defecto 'borrador' en la BD
}

// Igual que ClientePayload: reserva para cuando no hay red. Con conexión,
// la creación de un proyecto sigue siendo un INSERT directo. `dependeDe`
// encadena con el ClientePayload cuando ambos se crean en el mismo tramo
// offline (cliente nuevo → primer proyecto nuevo → visita).
export interface ProyectoPayload {
  clienteId: string;
  nombre: string;
  estado?: string; // por defecto 'activo' en la BD
}

export interface VisitaPayload {
  clienteId: string;
  // Proyecto (línea de negocio) al que pertenece la visita. Tras el fin de
  // `es_general` (migración 103/104) el servidor ya NO lo deriva del
  // cliente: `crear_visita_con_responsable` lo exige. Toda vía que encola
  // una visita manda un `proyectoId` real — en el alta rápida offline se
  // encola primero el proyecto y su id se encadena a la visita.
  proyectoId?: string;
  comercialResponsableId: string;
  tipoVisita: 'comercial' | 'demo' | 'tecnica' | 'seguimiento' | 'relacion' | null;
  // Objetivo de la visita, en palabras del comercial. Obligatorio en la UI
  // al arrancar (ventana "¿A qué vas?" o formulario de planificar), pero
  // opcional en el tipo porque la RPC no lo conoce: se aplica con un UPDATE
  // posterior en sincronizarVisita, mismo patrón que `franja`.
  objetivo?: string;
  // Solo para visitas planificadas a fecha futura (ver migración 69). Sin
  // estos, la visita nace 'en_curso' con fecha = now(), como siempre.
  fecha?: string; // ISO
  agendada?: boolean;
}

export interface HallazgoPayload {
  visitaId: string; // referencia al id de OperacionPendiente<'visita'>, no al id real todavía si aún no sincronizó
  comercialAutorId: string;
  terminoId: string;
  naturaleza:
    | 'contexto'
    | 'oportunidad'
    | 'riesgo'
    | 'competencia'
    | 'fortaleza'
    | 'proyecto_activo';
  nota?: string;
  ubicacionId?: string;
  // Etiqueta de zona del Modo Recorrido: texto libre, de usar y tirar, que
  // el comercial escribe sobre la marcha. Sustituye a `ubicacionId` para
  // las capturas nuevas; las visitas ya cerradas conservan `ubicacionId`.
  zonaTexto?: string;
  fechaRelevante?: string; // ISO date
  tipoFechaRelevante?: string;
}

export interface CapturaLibrePayload {
  visitaId: string;
  comercialAutorId: string;
  tipo: 'foto' | 'audio' | 'nota';
  titulo?: string; // referencia corta para distinguir capturas en la lista; solo aplica a 'nota'
  contenidoTexto?: string; // nota, o transcripción posterior de audio
  hallazgoId?: string;
  oportunidadId?: string;
  ubicacionId?: string;
  zonaTexto?: string; // etiqueta de zona del Recorrido — ver HallazgoPayload
  categoriaFoto?: string;
  latitud?: number;
  longitud?: number;
  // storagePath se rellena SOLO tras subida exitosa del binario, nunca antes
  // (ver 09_arquitectura_tecnica.md §5) — no forma parte del payload inicial.
}

export interface OportunidadPayload {
  clienteId: string;
  comercialAutorId: string;
  visitaOrigenId: string;
  titulo: string;
  prioridad: 'baja' | 'media' | 'alta' | 'estrategica';
  hallazgoOrigenId?: string;
  ubicacionId?: string;
  zonaTexto?: string; // etiqueta de zona del Recorrido — ver HallazgoPayload
  horizonteDecision?: string;
  solucionPrincipalTerminoId?: string;
  // Se rellenan si el comercial completa la oportunidad en su Detalle
  // ANTES de que la creación llegue al servidor (ver detalle-oportunidad.tsx
  // — "Completar ahora" en Oportunidad rápida). Al sincronizar, el INSERT
  // los lleva. Si no, `etapa` nace 'latente' por defecto en la BD.
  etapa?: string;
  descripcion?: string;
  motivoCierre?: string;
  comentarioCierre?: string;
}

export interface ProximoPasoPayload {
  visitaId: string;
  comercialResponsableId: string;
  descripcion: string;
  oportunidadId?: string;
  fechaObjetivo?: string;
  zonaTexto?: string; // etiqueta de zona del Recorrido — ver HallazgoPayload
}

// A diferencia de las demás entidades, una ubicación no pertenece a una
// visita concreta — pertenece al cliente, y se reutiliza en todas las
// visitas futuras a ese mismo cliente. Por eso no lleva visitaId ni
// dependeDe: el cliente ya existe sincronizado en Supabase en el momento
// en que se puede crear una ubicación (el alta de cliente es una acción
// directa, no pasa por esta cola — ver alta-rapida-cliente.tsx).
//
// Tampoco lleva comercialAutorId: la tabla `ubicacion` no tiene columna de
// autor (confirmado contra el esquema real el 28/8/2026 — es un catálogo
// compartido del cliente, no un dato personal de quien lo crea), y su
// política RLS (`pol_ubicacion_write`) autoriza por `fn_comercial_actual_activo()`,
// no por autoría. Incluir ese campo aquí causaba un error real de
// PostgREST ("Could not find the 'comercial_autor_id' column") detectado
// probando en directo, no solo mirando la pantalla.
export interface UbicacionPayload {
  clienteId: string;
  nombre: string;
}

export type PayloadPorEntidad = {
  cliente: ClientePayload;
  proyecto: ProyectoPayload;
  visita: VisitaPayload;
  hallazgo: HallazgoPayload;
  captura_libre: CapturaLibrePayload;
  oportunidad: OportunidadPayload;
  proximo_paso: ProximoPasoPayload;
  ubicacion: UbicacionPayload;
};

// Unión discriminada explícita (no genérica) por entidad: permite que
// TypeScript estreche el tipo real con un simple `switch (operacion.entidad)`
// o `if (operacion.entidad === 'visita')`, algo que una interfaz genérica
// `OperacionPendiente<E>` NO permite estrechar a partir de una comprobación
// en tiempo de ejecución sobre un valor ya almacenado (el parámetro de tipo
// no se re-infiere desde un dato runtime). Este cambio corrige errores de
// compilación reales detectados en sync-engine.ts, no es solo un ajuste
// estético.
type CamposComunes = {
  id: string; // uuid generado en cliente, coincide con el id definitivo del registro
  dependeDe?: string; // id de otra OperacionPendiente que debe sincronizarse antes
  archivoLocal?: Blob; // solo para captura_libre de tipo foto/audio
  estado: EstadoOperacion;
  intentos: number;
  ultimoError?: string;
  creadoEn: string; // ISO timestamp
};

export type OperacionPendiente<E extends EntidadSincronizable = EntidadSincronizable> = {
  [K in E]: CamposComunes & { entidad: K; payload: PayloadPorEntidad[K] };
}[E];


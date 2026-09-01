// supabase/functions/generar-backup-visita/index.ts
//
// Fase B del sistema de espacio/backup (Dirección Comercial, agosto 2026).
// Genera bajo demanda un zip con: informe.pdf (maquetado con pdfmake,
// jerarquía real, tablas, anexo fotográfico) + fotos originales + audios
// sueltos + LEEME.txt, y lo sube al bucket privado "backups-visita".
// Devuelve una URL firmada de corta duración — el propio zip se borra solo
// a las ~2h (ver 56_bucket_backups_visita.sql, job "limpiar-backups-visita"),
// así que un backup nunca ocupa cuota para siempre.
//
// Nunca se genera automáticamente al cerrar una visita — solo cuando el
// comercial lo pide explícitamente desde "mi espacio", antes de decidir si
// borra la visita o no.
//
// --- Motor del PDF ---
// Se probó primero @react-pdf/renderer (mejor control de diseño, mismo
// modelo mental que la app en React) pero su build para Deno vía esm.sh
// rompe en tiempo de ejecución (@react-pdf/layout lee una propiedad de un
// objeto undefined — dependencia interna asumiendo APIs de Node que no
// existen en el runtime de Edge Functions). Verificado con un script
// aislado antes de construir toda la función, no es una suposición.
// pdfmake sí arranca limpio en Deno (tablas, imágenes, header/footer con
// nº de página, acentos y € correctos con la fuente Roboto que trae
// integrada) y es el motor real de este archivo.
// Fuente: se usa la Roboto que pdfmake trae de fábrica (no Inter, la de la
// app) para no depender de una fuente TTF embebida a mano ni de una
// descarga en tiempo de ejecución — menos superficie de fallo en una
// función que el cliente corta a los 45s (ver use-descargar-informe.tsx).
//
// --- Detalle importante sobre las fotos ---
// El cliente sube SIEMPRE la foto como "<id>.jpg" en Storage
// (sync-engine.ts, extensión hardcodeada), sea cual sea el formato real
// del archivo. Por eso aquí el formato se detecta por firma de bytes
// (magic numbers), nunca por la extensión del storage_path — y el zip usa
// la extensión real detectada, no ".jpg" a ciegas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// Los .d.ts que sirve esm.sh para estos tres paquetes declaran "no default
// export" aunque el módulo JS real sí lo tiene (verificado en Deno). Se
// ignora el tipo en la línea de import y se trabaja con `any` acotado.
// @ts-ignore — default export presente en runtime
import JSZip from 'https://esm.sh/jszip@3.10.1';
// @ts-ignore — default export presente en runtime
import pdfMake from 'https://esm.sh/pdfmake@0.2.10/build/pdfmake.js';
// @ts-ignore — default export presente en runtime
import pdfFonts from 'https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js';

// vfs_fonts.js expone el objeto de fuentes en una forma u otra según cómo
// lo resuelva esm.sh — cubrimos las dos.
// deno-lint-ignore no-explicit-any
const _fonts = pdfFonts as any;
// deno-lint-ignore no-explicit-any
(pdfMake as any).vfs = _fonts.pdfMake ? _fonts.pdfMake.vfs : _fonts.vfs;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const URL_FIRMADA_SEGUNDOS = 60 * 60; // 1h de descarga — el zip vive ~2h en Storage antes de autoborrarse.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------
// Diccionario de negocio — etiquetas legibles de los enums de texto libre
// que hoy llegan crudos ("en_propuesta", "[naturaleza]"...) al informe.
// ---------------------------------------------------------------------

const COLOR = {
  ink900: '#161A1E',
  ink700: '#3D4450',
  ink400: '#7C8492',
  ink200: '#D4D8DE',
  ink100: '#E8EAED',
  brand600: '#1A3654',
  brand700: '#13283F',
  signal600: '#EF4136',
  risk600: '#6E2430',
  purple600: '#6E4C9E',
  success600: '#3A7D4F',
  warning600: '#A87A12',
  danger600: '#B23A3A',
};

const NATURALEZA_ORDEN = ['riesgo', 'proyecto_activo', 'competencia', 'oportunidad', 'fortaleza', 'contexto'];
const NATURALEZA_LABEL: Record<string, string> = {
  riesgo: 'Riesgo',
  proyecto_activo: 'Proyecto activo',
  competencia: 'Competencia',
  oportunidad: 'Señal de oportunidad',
  fortaleza: 'Fortaleza',
  contexto: 'Contexto',
};
const NATURALEZA_COLOR: Record<string, string> = {
  riesgo: COLOR.risk600,
  proyecto_activo: COLOR.brand600,
  competencia: COLOR.purple600,
  oportunidad: COLOR.signal600,
  fortaleza: COLOR.success600,
  contexto: COLOR.ink400,
};

const ETAPA_LABEL: Record<string, string> = {
  latente: 'Latente',
  cualificada: 'Cualificada',
  en_propuesta: 'En propuesta',
  ganada: 'Ganada',
  perdida: 'Perdida',
  descartada: 'Descartada',
};

const PRIORIDAD_LABEL: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', estrategica: 'Estratégica' };
const PRIORIDAD_ORDEN: Record<string, number> = { estrategica: 0, alta: 1, media: 2, baja: 3 };

const HORIZONTE_LABEL: Record<string, string> = {
  '0-3 meses': '0–3 meses',
  '3-6 meses': '3–6 meses',
  '6-12 meses': '6–12 meses',
  'mas de 12 meses': 'Más de 12 meses',
  'sin fecha definida': 'Sin fecha definida',
};

const ESTADO_PASO_LABEL: Record<string, string> = { pendiente: 'Pendiente', completado: 'Hecho', cancelado: 'Cancelado' };

const TIPO_VISITA_LABEL: Record<string, string> = {
  comercial: 'Comercial',
  demo: 'Demostración',
  tecnica: 'Técnica',
  seguimiento: 'Seguimiento',
  relacion: 'Relación',
};
// Frase completa para la línea de portada ("Visita de seguimiento",
// no "Visita seguimiento").
const TIPO_VISITA_FRASE: Record<string, string> = {
  comercial: 'Visita comercial',
  demo: 'Visita de demostración',
  tecnica: 'Visita técnica',
  seguimiento: 'Visita de seguimiento',
  relacion: 'Visita de relación',
};

const TIPO_FECHA_LABEL: Record<string, string> = {
  vencimiento_contrato: 'Vencimiento de contrato',
  renovacion: 'Renovación',
  auditoria: 'Auditoría',
  presupuesto: 'Presupuesto',
  implantacion: 'Implantación',
  otro: 'Otro',
};

const FRANJA_LABEL: Record<string, string> = { manana: 'mañana', tarde: 'tarde' };

const SEMAFORO_LABEL: Record<string, string> = { verde: 'Relación sólida', amarillo: 'Requiere atención', rojo: 'En riesgo' };
const SEMAFORO_COLOR: Record<string, string> = { verde: COLOR.success600, amarillo: COLOR.warning600, rojo: COLOR.danger600 };

function capitalizar(texto: string) {
  const limpio = texto.replace(/_/g, ' ');
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

function etiqueta(mapa: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return '—';
  return mapa[valor] ?? capitalizar(valor);
}

function fechaLarga(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function horaDe(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function mesesEntre(desdeISO: string, hastaISO: string): number {
  const a = new Date(desdeISO).getTime();
  const b = new Date(hastaISO).getTime();
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.44)));
}
function textoHaceMeses(meses: number): string {
  if (meses <= 0) return 'este mismo mes';
  if (meses === 1) return 'hace 1 mes';
  return `hace ${meses} meses`;
}

function hoyLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function esVencido(fechaObjetivo: string | null, estado: string): boolean {
  if (!fechaObjetivo || estado !== 'pendiente') return false;
  const f = new Date(fechaObjetivo);
  f.setHours(0, 0, 0, 0);
  return f < hoyLocal();
}

// ---------------------------------------------------------------------
// Detección de formato de imagen por firma de bytes — ver comentario de
// cabecera sobre por qué no nos podemos fiar de la extensión del archivo.
// ---------------------------------------------------------------------

type FormatoImagen = 'jpeg' | 'png' | 'webp' | 'heic' | 'gif' | 'desconocido';

function detectarFormatoImagen(bytes: Uint8Array): FormatoImagen {
  if (bytes.length < 12) return 'desconocido';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp';
  }
  const marca = new TextDecoder().decode(bytes.slice(4, 12));
  if (marca.startsWith('ftyp')) return 'heic';
  return 'desconocido';
}
const EXTENSION_POR_FORMATO: Record<FormatoImagen, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  heic: 'heic',
  gif: 'gif',
  desconocido: 'bin',
};

// Base64 troceado para no reventar la pila con archivos grandes
// (String.fromCharCode(...bytes) con un array de varios MB falla).
function base64Encode(bytes: Uint8Array): string {
  const TROZO = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}

function nombreArchivoLegible(texto: string | null | undefined, reserva: string): string {
  const base = (texto ?? '').trim() || reserva;
  return base.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function filasDeAPares<T>(items: T[]): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < items.length; i += 2) salida.push(items.slice(i, i + 2));
  return salida;
}

// El type-checker de supabase-js no infiere bien la forma de un select con
// varios recursos embebidos (lo colapsa a GenericStringError), así que se
// castea a estas formas explícitas tras cada consulta — mismo enfoque que
// ya usaba el archivo con los objetos anidados.
interface Nombrado {
  nombre: string;
}
interface VisitaRow {
  id: string;
  fecha: string;
  tipo_visita: string | null;
  objetivo: string | null;
  resumen_texto: string | null;
  estado_captura: string;
  franja: string | null;
  hora_definida: boolean;
  cliente: { id: string; nombre: string; sector: string | null; ubicacion_general: string | null; tamano_aprox: string | null } | null;
}
interface CapturaRow {
  id: string;
  tipo: string;
  titulo: string | null;
  contenido_texto: string | null;
  storage_path: string | null;
  creado_en: string;
  ubicacion: Nombrado | null;
}
interface HallazgoRow {
  id: string;
  nota: string | null;
  naturaleza: string;
  creado_en: string;
  fecha_relevante: string | null;
  tipo_fecha_relevante: string | null;
  termino: Nombrado | null;
  ubicacion: Nombrado | null;
}
interface OportunidadRow {
  id: string;
  titulo: string;
  descripcion: string | null;
  etapa: string;
  prioridad: string;
  valor_estimado: number | null;
  horizonte_decision: string | null;
}
interface PasoRow {
  id: string;
  descripcion: string;
  fecha_objetivo: string | null;
  estado: string;
  comercial_responsable: Nombrado | null;
}
interface ParticipanteRow {
  rol: string;
  comercial: Nombrado | null;
}
interface InterlocutorRow {
  interlocutor: { nombre: string; cargo: string | null } | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405);
  }

  let visitaId: string | undefined;
  try {
    const body = await req.json();
    visitaId = body.visitaId;
  } catch {
    return jsonResponse({ error: 'Cuerpo de la petición inválido, se esperaba { visitaId }' }, 400);
  }
  if (!visitaId) {
    return jsonResponse({ error: 'Falta visitaId' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'No autenticado' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Cliente "como el usuario que llama" — solo para validar quién es.
  const clienteUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await clienteUsuario.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Sesión no válida' }, 401);
  }
  const comercialId = userData.user.id;

  // Cliente con service_role — el resto de la función necesita saltarse
  // RLS para leer todas las capturas/hallazgos/oportunidades de la visita
  // y escribir el zip en el bucket de backups.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Autorización manual (misma regla que las políticas RLS de borrado):
  // participante de la visita, o direccion_comercial.
  const [{ data: participante }, { data: comercial }] = await Promise.all([
    admin
      .from('visita_participante')
      .select('id')
      .eq('visita_id', visitaId)
      .eq('comercial_id', comercialId)
      .maybeSingle(),
    admin.from('comercial').select('rol').eq('id', comercialId).single(),
  ]);
  const autorizado = !!participante || comercial?.rol === 'direccion_comercial';
  if (!autorizado) {
    return jsonResponse({ error: 'No tienes permiso para generar el backup de esta visita.' }, 403);
  }

  // --- Recolección de datos de la visita ---
  const { data: visitaData, error: errorVisita } = await admin
    .from('visita')
    .select(
      'id, fecha, tipo_visita, objetivo, resumen_texto, estado_captura, franja, hora_definida, ' +
        'cliente:cliente_id(id, nombre, sector, ubicacion_general, tamano_aprox)'
    )
    .eq('id', visitaId)
    .single();
  if (errorVisita || !visitaData) {
    return jsonResponse({ error: 'La visita no existe.' }, 404);
  }
  const visita = visitaData as unknown as VisitaRow;
  const clienteInfo = visita.cliente;

  const [
    { data: capturasData },
    { data: hallazgosData },
    { data: oportunidadesData },
    { data: proximosPasosData },
    { data: participantesData },
    { data: interlocutoresData },
  ] = await Promise.all([
    admin
      .from('captura_libre')
      .select('id, tipo, titulo, contenido_texto, storage_path, creado_en, ubicacion:ubicacion_id(nombre)')
      .eq('visita_id', visitaId)
      .order('creado_en', { ascending: true }),
    admin
      .from('hallazgo')
      .select(
        'id, nota, naturaleza, creado_en, fecha_relevante, tipo_fecha_relevante, ' +
          'termino:termino_id(nombre), ubicacion:ubicacion_id(nombre)'
      )
      .eq('visita_id', visitaId)
      .order('creado_en', { ascending: true }),
    admin
      .from('oportunidad')
      .select('id, titulo, descripcion, etapa, prioridad, valor_estimado, horizonte_decision')
      .eq('visita_origen_id', visitaId),
    admin
      .from('proximo_paso')
      .select('id, descripcion, fecha_objetivo, estado, comercial_responsable:comercial_responsable_id(nombre)')
      .eq('visita_id', visitaId)
      .order('fecha_objetivo', { ascending: true }),
    admin.from('visita_participante').select('rol, comercial:comercial_id(nombre)').eq('visita_id', visitaId),
    admin.from('visita_interlocutor').select('interlocutor:interlocutor_id(nombre, cargo)').eq('visita_id', visitaId),
  ]);

  const capturas = (capturasData ?? []) as unknown as CapturaRow[];
  const hallazgos = (hallazgosData ?? []) as unknown as HallazgoRow[];
  const oportunidades = (oportunidadesData ?? []) as unknown as OportunidadRow[];
  const proximosPasos = (proximosPasosData ?? []) as unknown as PasoRow[];
  const participantesVisita = (participantesData ?? []) as unknown as ParticipanteRow[];
  const interlocutoresVisita = (interlocutoresData ?? []) as unknown as InterlocutorRow[];

  // Contexto del cliente para la portada — N.ª visita, cuánto hace de la
  // anterior, semáforo. Todo opcional: si el cliente ya no existe (poco
  // probable, pero cliente_id no es NOT NULL con ON DELETE aquí) se omite
  // sin romper el informe.
  let numeroVisita: number | null = null;
  let fechaVisitaAnterior: string | null = null;
  let semaforoValor: string | null = null;
  if (clienteInfo?.id) {
    const [{ count: anteriores }, { data: anterior }, { data: semaforoFila }] = await Promise.all([
      admin.from('visita').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteInfo.id).lt('fecha', visita.fecha),
      admin
        .from('visita')
        .select('fecha')
        .eq('cliente_id', clienteInfo.id)
        .lt('fecha', visita.fecha)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from('vw_semaforo_cliente').select('semaforo').eq('cliente_id', clienteInfo.id).maybeSingle(),
    ]);
    numeroVisita = (anteriores ?? 0) + 1;
    fechaVisitaAnterior = anterior?.fecha ?? null;
    semaforoValor = semaforoFila?.semaforo ?? null;
  }

  const fotos = (capturas ?? []).filter((c) => c.tipo === 'foto');
  const audios = (capturas ?? []).filter((c) => c.tipo === 'audio');
  const notas = (capturas ?? []).filter((c) => c.tipo === 'nota');

  const pasosOrdenados = proximosPasos ?? [];
  const pasosVencidos = pasosOrdenados.filter((p) => esVencido(p.fecha_objetivo, p.estado)).length;

  const oportunidadesOrdenadas = [...(oportunidades ?? [])].sort(
    (a, b) => (PRIORIDAD_ORDEN[a.prioridad] ?? 9) - (PRIORIDAD_ORDEN[b.prioridad] ?? 9)
  );
  const totalOportunidades = oportunidadesOrdenadas.reduce((suma, o) => suma + (o.valor_estimado ?? 0), 0);

  const riesgosCount = (hallazgos ?? []).filter((h) => h.naturaleza === 'riesgo').length;

  const naturalezasConocidas = new Set(NATURALEZA_ORDEN);
  const gruposHallazgos: { naturaleza: string; items: NonNullable<typeof hallazgos> }[] = NATURALEZA_ORDEN
    .map((nat) => ({ naturaleza: nat, items: (hallazgos ?? []).filter((h) => h.naturaleza === nat) }))
    .filter((g) => g.items.length > 0);
  const otrasNaturalezas = (hallazgos ?? []).filter((h) => !naturalezasConocidas.has(h.naturaleza));
  if (otrasNaturalezas.length) {
    gruposHallazgos.push({ naturaleza: otrasNaturalezas[0].naturaleza, items: otrasNaturalezas });
  }

  const visitaEnCurso = visita.estado_captura === 'en_curso';

  const responsable = (participantesVisita ?? []).find((p) => p.rol === 'responsable');
  const acompanantes = (participantesVisita ?? [])
    .filter((p) => p.rol !== 'responsable')
    .map((p) => (p.comercial as unknown as { nombre: string } | null)?.nombre)
    .filter((n): n is string => !!n);
  const interlocutoresTexto = (interlocutoresVisita ?? [])
    .map((v) => {
      const i = v.interlocutor as unknown as { nombre: string; cargo: string | null } | null;
      if (!i) return null;
      return i.cargo ? `${i.nombre} (${i.cargo})` : i.nombre;
    })
    .filter((t): t is string => !!t);

  const tipoLabel = visita.tipo_visita ? etiqueta(TIPO_VISITA_LABEL, visita.tipo_visita) : 'Visita';
  const frasesVisita = (visita.tipo_visita && TIPO_VISITA_FRASE[visita.tipo_visita]) || 'Visita';

  // --- Descarga de binarios: fotos (embebidas + zip) y audios (solo zip) ---
  const zip = new JSZip();
  const carpetaFotos = zip.folder('fotos')!;
  const carpetaAudios = zip.folder('audios')!;

  type FotoLista = {
    titulo: string | null;
    ubicacionNombre: string;
    creadoEn: string;
    dataUri: string;
  };
  const fotosParaPdf: FotoLista[] = [];
  const fotosNoIncluidas: { titulo: string; formato: string }[] = [];

  let indiceFoto = 0;
  for (const f of fotos) {
    indiceFoto += 1;
    const ubicacionNombre = (f.ubicacion as unknown as { nombre: string } | null)?.nombre || 'Sin ubicación asignada';
    if (!f.storage_path) continue;
    const { data, error } = await admin.storage.from('fotos-visita').download(f.storage_path);
    if (error || !data) continue; // fichero huérfano o ya borrado — se omite, no se aborta el backup entero.
    const bytes = new Uint8Array(await data.arrayBuffer());
    const formato = detectarFormatoImagen(bytes);
    const extension = EXTENSION_POR_FORMATO[formato];
    const nombreArchivo = [
      String(indiceFoto).padStart(2, '0'),
      nombreArchivoLegible(ubicacionNombre, ''),
      nombreArchivoLegible(f.titulo, 'foto'),
    ]
      .filter(Boolean)
      .join(' - ');
    carpetaFotos.file(`${nombreArchivo}.${extension}`, bytes);

    if (formato === 'jpeg' || formato === 'png') {
      fotosParaPdf.push({
        titulo: f.titulo,
        ubicacionNombre,
        creadoEn: f.creado_en,
        dataUri: `data:image/${formato};base64,${base64Encode(bytes)}`,
      });
    } else {
      fotosNoIncluidas.push({
        titulo: f.titulo || `Foto ${indiceFoto}`,
        formato: formato === 'desconocido' ? 'formato no reconocido' : formato.toUpperCase(),
      });
    }
  }

  let indiceAudio = 0;
  for (const a of audios) {
    indiceAudio += 1;
    if (!a.storage_path) continue;
    const { data, error } = await admin.storage.from('audios-visita').download(a.storage_path);
    if (error || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const extension = a.storage_path.split('.').pop() || 'm4a';
    const nombreArchivo = [String(indiceAudio).padStart(2, '0'), nombreArchivoLegible(a.titulo, 'audio')].join(' - ');
    carpetaAudios.file(`${nombreArchivo}.${extension}`, bytes);
  }

  const fotosPorUbicacion = new Map<string, FotoLista[]>();
  for (const f of fotosParaPdf) {
    const lista = fotosPorUbicacion.get(f.ubicacionNombre) ?? [];
    lista.push(f);
    fotosPorUbicacion.set(f.ubicacionNombre, lista);
  }

  // ---------------------------------------------------------------------
  // Construcción del PDF con pdfmake
  // ---------------------------------------------------------------------

  // deno-lint-ignore no-explicit-any
  const layoutTabla: any = {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 ? 0 : i === 1 ? 1 : i === node.table.body.length ? 0 : 0.5),
    vLineWidth: () => 0,
    hLineColor: (i: number) => (i === 1 ? COLOR.ink200 : COLOR.ink100),
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 5,
    paddingBottom: () => 5,
  };

  let contadorSeccion = 0;
  // deno-lint-ignore no-explicit-any
  function tituloSeccion(texto: string, extra?: string): any {
    contadorSeccion += 1;
    const numero = String(contadorSeccion).padStart(2, '0');
    return {
      unbreakable: true,
      margin: [0, contadorSeccion === 1 ? 0 : 20, 0, 10],
      stack: [
        {
          columns: [
            // margen superior en el número para bajarlo a la línea base del
            // título (fontSize 10 vs 13.5).
            { width: 22, text: numero, color: COLOR.brand600, bold: true, fontSize: 10, margin: [0, 3, 0, 0] },
            {
              width: '*',
              text: [
                { text: texto, bold: true, fontSize: 13.5, color: COLOR.ink900 },
                extra ? { text: `  ${extra}`, fontSize: 10, color: COLOR.ink400 } : null,
              ].filter(Boolean),
            },
          ],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 499, y2: 4, lineWidth: 1, lineColor: COLOR.ink200 }] },
      ],
    };
  }

  // deno-lint-ignore no-explicit-any
  function chip(texto: string, color: string): any {
    return { table: { body: [[{ text: texto, color: '#FFFFFF', fillColor: color, bold: true, fontSize: 7.5, margin: [5, 2, 5, 2] }]] }, layout: 'noBorders' };
  }

  // deno-lint-ignore no-explicit-any
  function estadoVacio(texto: string): any {
    return { text: texto, italics: true, color: COLOR.ink400, fontSize: 9.5, margin: [0, 2, 0, 4] };
  }

  // --- Portada ---
  const semaforoLabel = semaforoValor ? SEMAFORO_LABEL[semaforoValor] ?? capitalizar(semaforoValor) : null;
  const semaforoColor = semaforoValor ? SEMAFORO_COLOR[semaforoValor] ?? COLOR.ink400 : COLOR.ink200;

  const metaCliente = [clienteInfo?.sector, clienteInfo?.ubicacion_general, clienteInfo?.tamano_aprox].filter(Boolean).join('   ·   ');

  let lineaHora = '';
  if (visita.hora_definida) {
    lineaHora = ` · ${horaDe(visita.fecha)}`;
  } else if (visita.franja) {
    lineaHora = ` · ${FRANJA_LABEL[visita.franja] ?? visita.franja}`;
  }

  const lineaHistorico = numeroVisita
    ? numeroVisita === 1
      ? 'Primera visita registrada a este cliente'
      : `${numeroVisita}.ª visita registrada${
          fechaVisitaAnterior ? ` · última ${textoHaceMeses(mesesEntre(fechaVisitaAnterior, visita.fecha))}` : ''
        }`
    : null;

  // deno-lint-ignore no-explicit-any
  const filasQuienes: any[] = [];
  if (responsable) {
    filasQuienes.push([
      { text: 'Responsable', color: COLOR.ink400, fontSize: 9.5 },
      { text: (responsable.comercial as unknown as { nombre: string } | null)?.nombre ?? '—', bold: true, fontSize: 9.5 },
    ]);
  }
  if (acompanantes.length) {
    filasQuienes.push([
      { text: acompanantes.length === 1 ? 'Acompañante' : 'Acompañantes', color: COLOR.ink400, fontSize: 9.5 },
      { text: acompanantes.join(' · '), fontSize: 9.5 },
    ]);
  }
  if (interlocutoresTexto.length) {
    filasQuienes.push([
      { text: 'Interlocutores', color: COLOR.ink400, fontSize: 9.5 },
      { text: interlocutoresTexto.join(' · '), fontSize: 9.5 },
    ]);
  }

  const ahora = new Date().toISOString();

  // deno-lint-ignore no-explicit-any
  const portada: any[] = [
    { text: 'PRIMESUITE · COMERCIAL', bold: true, fontSize: 9, color: COLOR.brand600, characterSpacing: 1.2 },
    {
      margin: [0, 46, 0, 0],
      stack: [
        { text: 'INFORME DE VISITA', fontSize: 10, bold: true, color: COLOR.ink400, characterSpacing: 1 },
        { text: clienteInfo?.nombre ?? 'Cliente', fontSize: 27, bold: true, color: COLOR.brand700, margin: [0, 4, 0, 8] },
        metaCliente ? { text: metaCliente, fontSize: 10.5, color: COLOR.ink700 } : null,
        { text: `${frasesVisita} · ${fechaLarga(visita.fecha)}${lineaHora}`, fontSize: 12, bold: true, margin: [0, 18, 0, 0] },
        lineaHistorico ? { text: lineaHistorico, fontSize: 10, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
        semaforoLabel
          ? {
              margin: [0, 12, 0, 0],
              columns: [
                { width: 12, canvas: [{ type: 'ellipse', x: 5, y: 6, r1: 5, r2: 5, color: semaforoColor }] },
                { width: '*', text: `Semáforo del cliente: ${semaforoLabel}`, fontSize: 10, color: COLOR.ink700 },
              ],
            }
          : null,
        filasQuienes.length
          ? { margin: [0, 24, 0, 0], table: { widths: [90, '*'], body: filasQuienes }, layout: 'noBorders' }
          : null,
        visitaEnCurso
          ? {
              margin: [0, 20, 0, 0],
              table: {
                widths: ['*'],
                body: [[{
                  text: 'Esta visita figura como en curso: puede haber información registrada después de generar este informe que aquí no aparece.',
                  fontSize: 9,
                  color: '#6B4E0E',
                  fillColor: '#F7EEE0',
                  margin: [10, 8, 10, 8],
                }]],
              },
              layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => COLOR.warning600, vLineColor: () => COLOR.warning600 },
            }
          : null,
      ].filter(Boolean),
    },
    {
      pageBreak: 'after',
      margin: [0, 40, 0, 0],
      fontSize: 8,
      color: COLOR.ink400,
      text:
        `Generado el ${fechaLarga(ahora)}, ${horaDe(ahora)} por PrimeSuite Comercial · uso interno. ` +
        'Refleja el estado de la visita en el momento de generarlo; los cambios posteriores no se recogen aquí.',
    },
  ];

  // --- KPIs del resumen ejecutivo ---
  // deno-lint-ignore no-explicit-any
  function filaKPIs(items: { valor: string; etiqueta: string; alerta?: boolean }[]): any {
    return {
      margin: [0, 6, 0, 12],
      table: {
        widths: items.map(() => '*'),
        body: [
          items.map((it) => ({
            stack: [
              { text: it.valor, bold: true, fontSize: 17, color: it.alerta ? COLOR.danger600 : COLOR.brand700 },
              { text: it.etiqueta, fontSize: 8, color: COLOR.ink400, margin: [0, 3, 0, 0] },
            ],
            margin: [10, 8, 10, 8],
          })),
        ],
      },
      layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => COLOR.ink200, vLineColor: () => COLOR.ink200 },
    };
  }

  // --- Tabla de oportunidades ---
  // deno-lint-ignore no-explicit-any
  const tablaOportunidades: any = {
    table: {
      headerRows: 1,
      widths: ['*', 70, 60, 60, 75],
      body: [
        [
          { text: 'OPORTUNIDAD', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'ETAPA', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'PRIORIDAD', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'VALOR', fontSize: 8, bold: true, color: COLOR.ink400, alignment: 'right' },
          { text: 'HORIZONTE', fontSize: 8, bold: true, color: COLOR.ink400 },
        ],
        ...oportunidadesOrdenadas.map((o) => [
          {
            stack: [
              { text: o.titulo, bold: true, fontSize: 10 },
              o.descripcion ? { text: o.descripcion, fontSize: 8.5, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
            ].filter(Boolean),
          },
          { text: etiqueta(ETAPA_LABEL, o.etapa), fontSize: 9.5 },
          {
            text: etiqueta(PRIORIDAD_LABEL, o.prioridad),
            fontSize: 9.5,
            bold: o.prioridad === 'estrategica' || o.prioridad === 'alta',
            color: o.prioridad === 'estrategica' ? COLOR.signal600 : o.prioridad === 'alta' ? COLOR.warning600 : COLOR.ink700,
          },
          { text: o.valor_estimado != null ? `${o.valor_estimado.toLocaleString('es-ES')} €` : '—', fontSize: 9.5, alignment: 'right' },
          { text: etiqueta(HORIZONTE_LABEL, o.horizonte_decision), fontSize: 9.5 },
        ]),
        [
          { text: 'Total estimado', bold: true, fontSize: 10, colSpan: 3 },
          {},
          {},
          { text: `${totalOportunidades.toLocaleString('es-ES')} €`, bold: true, fontSize: 10, alignment: 'right' },
          { text: '' },
        ],
      ],
    },
    layout: layoutTabla,
  };

  // --- Hallazgos agrupados ---
  // deno-lint-ignore no-explicit-any
  const bloquesHallazgos: any[] = gruposHallazgos.length
    ? gruposHallazgos.flatMap((g) => [
        {
          margin: [0, 4, 0, 6],
          columns: [
            { width: 'auto', ...chip(etiqueta(NATURALEZA_LABEL, g.naturaleza).toUpperCase(), NATURALEZA_COLOR[g.naturaleza] ?? COLOR.ink400) },
            { width: 'auto', text: `  ${g.items.length}`, color: COLOR.ink400, fontSize: 9.5, margin: [8, 3, 0, 0] },
          ],
        },
        ...g.items.map((h) => {
          const nombreTermino = (h.termino as unknown as { nombre: string } | null)?.nombre || 'Hallazgo';
          const ubicacionNombre = (h.ubicacion as unknown as { nombre: string } | null)?.nombre;
          const venceTexto = h.fecha_relevante
            ? `Vence: ${fechaCorta(h.fecha_relevante)}${h.tipo_fecha_relevante ? ` · ${etiqueta(TIPO_FECHA_LABEL, h.tipo_fecha_relevante)}` : ''}`
            : null;
          return {
            margin: [0, 0, 0, 8],
            stack: [
              {
                text: [
                  { text: nombreTermino, bold: true, fontSize: 10.5 },
                  venceTexto ? { text: `   ${venceTexto}`, color: COLOR.warning600, bold: true, fontSize: 8.5 } : null,
                ].filter(Boolean),
              },
              h.nota ? { text: h.nota, fontSize: 9.5, color: COLOR.ink700, margin: [0, 2, 0, 0] } : null,
              ubicacionNombre ? { text: `Ubicación: ${ubicacionNombre}`, fontSize: 8, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
            ].filter(Boolean),
          };
        }),
      ])
    : [estadoVacio('No se registraron hallazgos en esta visita.')];

  // --- Tabla de próximos pasos ---
  // deno-lint-ignore no-explicit-any
  const tablaPasos: any = {
    table: {
      headerRows: 1,
      widths: ['*', 90, 65, 70],
      body: [
        [
          { text: 'ACCIÓN', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'RESPONSABLE', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'FECHA OBJETIVO', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'ESTADO', fontSize: 8, bold: true, color: COLOR.ink400 },
        ],
        ...pasosOrdenados.map((p) => {
          const vencido = esVencido(p.fecha_objetivo, p.estado);
          return [
            { text: p.descripcion, fontSize: 9.5 },
            { text: (p.comercial_responsable as unknown as { nombre: string } | null)?.nombre ?? '—', fontSize: 9.5 },
            {
              text: p.fecha_objetivo ? fechaCorta(p.fecha_objetivo) : '—',
              fontSize: 9.5,
              color: vencido ? COLOR.danger600 : COLOR.ink700,
              bold: vencido,
            },
            vencido ? { ...chip('VENCIDO', COLOR.danger600) } : { text: etiqueta(ESTADO_PASO_LABEL, p.estado), fontSize: 9.5 },
          ];
        }),
      ],
    },
    layout: layoutTabla,
  };

  // --- Notas de la visita (se omite del todo si no hay ninguna) ---
  // deno-lint-ignore no-explicit-any
  const bloquesNotas: any[] | null = notas.length
    ? notas.map((n) => ({
        margin: [0, 0, 0, 8],
        table: {
          widths: ['*'],
          body: [[
            {
              stack: [
                n.titulo ? { text: n.titulo, bold: true, fontSize: 10 } : null,
                { text: n.contenido_texto || '', fontSize: 9.5, color: COLOR.ink700, margin: [0, n.titulo ? 2 : 0, 0, 0] },
              ].filter(Boolean),
              margin: [10, 8, 10, 8],
            },
          ]],
        },
        layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => COLOR.ink200, vLineColor: () => COLOR.ink200 },
      }))
    : null;

  // --- Anexo fotográfico, agrupado por ubicación ---
  // deno-lint-ignore no-explicit-any
  function celdaFoto(f: FotoLista): any {
    return {
      width: '*',
      stack: [
        { image: f.dataUri, fit: [220, 165] },
        {
          text: [
            { text: f.titulo || 'Foto', fontSize: 8.5, color: COLOR.ink700 },
            { text: `  ·  ${horaDe(f.creadoEn)}`, fontSize: 8, color: COLOR.ink400 },
          ],
          margin: [0, 4, 0, 0],
        },
      ],
    };
  }

  // deno-lint-ignore no-explicit-any
  const bloquesFotos: any[] = [];
  if (fotos.length === 0) {
    bloquesFotos.push(estadoVacio('Sin fotografías.'));
  } else {
    // deno-lint-ignore no-explicit-any
    const filaColumnas = (par: FotoLista[]): any => ({
      margin: [0, 0, 0, 12],
      columnGap: 14,
      columns: [celdaFoto(par[0]), par[1] ? celdaFoto(par[1]) : { width: '*', text: '' }],
    });
    for (const [ubicacionNombre, lista] of fotosPorUbicacion) {
      const pares = filasDeAPares(lista);
      const encabezado = { text: ubicacionNombre, bold: true, fontSize: 10.5, margin: [0, 10, 0, 6] };
      if (pares.length) {
        // El nombre de la ubicación no se queda huérfano al pie de página:
        // va pegado a su primera fila de fotos.
        bloquesFotos.push({ unbreakable: true, stack: [encabezado, filaColumnas(pares[0])] });
        for (const par of pares.slice(1)) bloquesFotos.push(filaColumnas(par));
      } else {
        bloquesFotos.push(encabezado);
      }
    }
    if (fotosNoIncluidas.length) {
      bloquesFotos.push({
        margin: [0, 6, 0, 4],
        text: [
          { text: 'No incluidas en el PDF ', bold: true, fontSize: 9, color: COLOR.ink700 },
          { text: '(formato no compatible con la vista previa; están en la carpeta fotos/ del zip):', fontSize: 9, color: COLOR.ink400 },
        ],
      });
      for (const nf of fotosNoIncluidas) {
        bloquesFotos.push({ text: `•  ${nf.titulo} (${nf.formato})`, fontSize: 9, color: COLOR.ink700, margin: [8, 2, 0, 0] });
      }
    }
  }

  // --- Anexo de audios (se omite del todo si no hay ninguno) ---
  // deno-lint-ignore no-explicit-any
  const bloquesAudios: any[] | null = audios.length
    ? audios.map((a) => ({
        text: `•  ${a.titulo || 'Audio sin título'}  ·  ${horaDe(a.creado_en)}  —  archivo en la carpeta audios/ del zip`,
        fontSize: 9.5,
        color: COLOR.ink700,
        margin: [0, 0, 0, 4],
      }))
    : null;

  // --- Ensamblado final ---
  // deno-lint-ignore no-explicit-any
  const contenido: any[] = [
    ...portada,
    tituloSeccion('Resumen ejecutivo'),
    visita.resumen_texto
      ? { text: visita.resumen_texto, fontSize: 10.5, color: COLOR.ink900, lineHeight: 1.3 }
      : estadoVacio('Sin resumen registrado para esta visita.'),
    filaKPIs([
      { valor: totalOportunidades > 0 ? `${totalOportunidades.toLocaleString('es-ES')} €` : '—', etiqueta: 'Valor estimado en oportunidades' },
      { valor: String(riesgosCount), etiqueta: riesgosCount === 1 ? 'Riesgo detectado' : 'Riesgos detectados' },
      {
        valor: String(pasosVencidos),
        etiqueta: `Próximos pasos vencidos (de ${pasosOrdenados.length})`,
        alerta: pasosVencidos > 0,
      },
    ]),
    tituloSeccion('Objetivo de la visita'),
    visita.objetivo ? { text: visita.objetivo, fontSize: 10, color: COLOR.ink700 } : estadoVacio('Sin objetivo registrado para esta visita.'),
    tituloSeccion('Oportunidades detectadas', oportunidadesOrdenadas.length ? `(${oportunidadesOrdenadas.length})` : undefined),
    oportunidadesOrdenadas.length ? tablaOportunidades : estadoVacio('No se registraron oportunidades en esta visita.'),
    tituloSeccion('Hallazgos', hallazgos?.length ? `(${hallazgos.length})` : undefined),
    ...bloquesHallazgos,
    tituloSeccion('Próximos pasos', pasosOrdenados.length ? `(${pasosOrdenados.length})` : undefined),
    pasosOrdenados.length ? tablaPasos : estadoVacio('No se registraron próximos pasos en esta visita.'),
  ];

  if (bloquesNotas) {
    contenido.push(tituloSeccion('Notas de la visita', `(${notas.length})`), ...bloquesNotas);
  }
  contenido.push(tituloSeccion('Anexo fotográfico', fotos.length ? `(${fotos.length})` : undefined), ...bloquesFotos);
  if (bloquesAudios) {
    contenido.push(tituloSeccion('Anexo de audios', `(${audios.length})`), ...bloquesAudios);
  }

  const docDefinition = {
    info: {
      title: `Informe de visita — ${clienteInfo?.nombre ?? 'cliente'} — ${fechaCorta(visita.fecha)}`,
      author: 'PrimeSuite Comercial',
    },
    pageSize: 'A4',
    pageMargins: [48, 40, 48, 56],
    header: (paginaActual: number) =>
      paginaActual === 1
        ? null
        : {
            margin: [48, 20, 48, 0],
            columns: [
              {
                text: [
                  { text: clienteInfo?.nombre ?? 'Cliente', bold: true },
                  { text: `  ·  ${tipoLabel}  ·  ${fechaCorta(visita.fecha)}` },
                ],
                fontSize: 8.5,
                color: COLOR.ink400,
              },
              { text: 'Informe de visita', alignment: 'right', fontSize: 8.5, color: COLOR.ink400 },
            ],
          },
    footer: (paginaActual: number, totalPaginas: number) =>
      paginaActual === 1
        ? null
        : {
            margin: [48, 0, 48, 20],
            columns: [
              { text: 'PrimeSuite Comercial', fontSize: 8.5, color: COLOR.ink400 },
              { text: `Pág. ${paginaActual} de ${totalPaginas}`, alignment: 'right', fontSize: 8.5, color: COLOR.ink400 },
            ],
          },
    content: contenido,
    defaultStyle: { font: 'Roboto', fontSize: 10 },
  };

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await new Promise<Uint8Array>((resolve, reject) => {
      try {
        // deno-lint-ignore no-explicit-any
        (pdfMake as any).createPdf(docDefinition).getBuffer((buffer: Uint8Array) => resolve(buffer));
      } catch (e) {
        reject(e);
      }
    });
  } catch (e) {
    console.error('Fallo generando el PDF del informe', e);
    return jsonResponse({ error: 'No se pudo maquetar el informe de la visita.' }, 500);
  }
  zip.file('informe.pdf', pdfBytes);

  // --- LEEME.txt ---
  const leeme =
    `PrimeSuite Comercial — copia de la visita\n` +
    `==========================================\n\n` +
    `Cliente:   ${clienteInfo?.nombre ?? 'cliente'}\n` +
    `Visita:    ${fechaLarga(visita.fecha)} (visita ${tipoLabel.toLowerCase()})\n` +
    `Generado:  ${fechaLarga(ahora)}, ${horaDe(ahora)}\n\n` +
    `Contenido de este archivo comprimido:\n\n` +
    `  informe.pdf   Informe completo de la visita: resumen, oportunidades,\n` +
    `                hallazgos, próximos pasos y anexo fotográfico.\n\n` +
    `  fotos/        Todas las fotos en su resolución original, numeradas por\n` +
    `                orden de captura. Las del PDF son copias reducidas.\n\n` +
    `  audios/       Grabaciones de voz de la visita.\n\n` +
    `Notas:\n` +
    `  - Este material es de uso interno.\n` +
    `  - El informe refleja el estado de la visita el día indicado; los\n` +
    `    cambios registrados después no aparecen aquí.\n` +
    (visitaEnCurso ? `  - Esta visita seguía en curso cuando se generó esta copia.\n` : '') +
    (fotosNoIncluidas.length
      ? `  - ${fotosNoIncluidas.length} foto(s) no se pudieron previsualizar en el PDF (formato no compatible); están igualmente en fotos/.\n`
      : '') +
    `\nGenerado automáticamente por PrimeSuite Comercial. No respondas a este\n` +
    `archivo; para dudas, contacta con tu responsable comercial.\n`;
  zip.file('LEEME.txt', leeme);

  const zipBytes = await zip.generateAsync({ type: 'uint8array' });

  // --- Subida al bucket de backups ---
  const timestamp = Date.now();
  const rutaZip = `${visitaId}/${timestamp}.zip`;
  const { error: errorSubida } = await admin.storage
    .from('backups-visita')
    .upload(rutaZip, zipBytes, { contentType: 'application/zip', upsert: true });
  if (errorSubida) {
    return jsonResponse({ error: `No se pudo guardar el backup: ${errorSubida.message}` }, 500);
  }

  const nombreDescarga = `visita-${nombreArchivoLegible(clienteInfo?.nombre, visitaId)}-${fechaCorta(visita.fecha).replace(/\//g, '-')}.zip`;
  const { data: firmada, error: errorFirma } = await admin.storage
    .from('backups-visita')
    .createSignedUrl(rutaZip, URL_FIRMADA_SEGUNDOS, { download: nombreDescarga });
  if (errorFirma || !firmada) {
    return jsonResponse({ error: 'Backup generado pero no se pudo crear el enlace de descarga.' }, 500);
  }

  return jsonResponse({
    url: firmada.signedUrl,
    expiraEnSegundos: URL_FIRMADA_SEGUNDOS,
    tamanoBytes: zipBytes.byteLength,
  });
});

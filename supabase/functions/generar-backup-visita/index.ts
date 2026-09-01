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

// Logo Primion (wordmark azul marino, PNG 320x94) para la portada del
// informe. Es el mismo activo que la app "Nota de Gastos" de Primion trae
// embebido en su index.html; aqui va como data-URI para no depender de red
// al generar el PDF.
const PRIMION_LOGO =
  'data:image/png;base64,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';

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
  // anterior, cuántas oportunidades activas tiene ahora mismo. Todo
  // opcional: si el cliente ya no existe (poco probable, pero cliente_id no
  // es NOT NULL con ON DELETE aquí) se omite sin romper el informe.
  let numeroVisita: number | null = null;
  let fechaVisitaAnterior: string | null = null;
  let oportunidadesActivas: number | null = null;
  if (clienteInfo?.id) {
    const [{ count: anteriores }, { data: anterior }, { data: contextoFila }] = await Promise.all([
      admin.from('visita').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteInfo.id).lt('fecha', visita.fecha),
      admin
        .from('visita')
        .select('fecha')
        .eq('cliente_id', clienteInfo.id)
        .lt('fecha', visita.fecha)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from('vw_semaforo_cliente').select('oportunidades_activas').eq('cliente_id', clienteInfo.id).maybeSingle(),
    ]);
    numeroVisita = (anteriores ?? 0) + 1;
    fechaVisitaAnterior = anterior?.fecha ?? null;
    oportunidadesActivas = contextoFila?.oportunidades_activas ?? null;
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

  const metaCliente = [clienteInfo?.sector, clienteInfo?.ubicacion_general, clienteInfo?.tamano_aprox].filter(Boolean).join('   ·   ');

  let lineaHora = '';
  if (visita.hora_definida) {
    lineaHora = ` · ${horaDe(visita.fecha)}`;
  } else if (visita.franja) {
    lineaHora = ` · ${FRANJA_LABEL[visita.franja] ?? visita.franja}`;
  }

  const partesHistorico: string[] = [];
  if (numeroVisita) {
    partesHistorico.push(
      numeroVisita === 1 ? 'Primera visita registrada a este cliente' : `${numeroVisita}.ª visita registrada`
    );
    if (numeroVisita > 1 && fechaVisitaAnterior) {
      partesHistorico.push(`última ${textoHaceMeses(mesesEntre(fechaVisitaAnterior, visita.fecha))}`);
    }
  }
  if (oportunidadesActivas && oportunidadesActivas > 0) {
    partesHistorico.push(
      `${oportunidadesActivas} ${oportunidadesActivas === 1 ? 'oportunidad activa' : 'oportunidades activas'}`
    );
  }
  const lineaHistorico = partesHistorico.length ? partesHistorico.join('  ·  ') : null;

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
    {
      stack: [
        { image: PRIMION_LOGO, width: 116 },
        { text: 'PRIMION TECHNOLOGY', bold: true, fontSize: 9, color: COLOR.signal600, characterSpacing: 1.2, margin: [0, 8, 0, 0] },
        { text: 'PrimeSuite Comercial · Documento interno', fontSize: 8, color: COLOR.ink400, margin: [0, 3, 0, 0] },
      ],
    },
    {
      margin: [0, 40, 0, 0],
      stack: [
        { text: 'INFORME DE VISITA', fontSize: 10, bold: true, color: COLOR.ink400, characterSpacing: 1 },
        { text: clienteInfo?.nombre ?? 'Cliente', fontSize: 27, bold: true, color: COLOR.brand700, margin: [0, 4, 0, 8] },
        metaCliente ? { text: metaCliente, fontSize: 10.5, color: COLOR.ink700 } : null,
        { text: `${frasesVisita} · ${fechaLarga(visita.fecha)}${lineaHora}`, fontSize: 12, bold: true, margin: [0, 18, 0, 0] },
        lineaHistorico ? { text: lineaHistorico, fontSize: 10, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
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
        `Generado el ${fechaLarga(ahora)}, ${horaDe(ahora)} por PrimeSuite Comercial · documento interno. ` +
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

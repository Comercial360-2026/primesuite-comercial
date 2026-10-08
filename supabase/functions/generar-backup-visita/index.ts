// supabase/functions/generar-backup-visita/index.ts
//
// Genera bajo demanda, y lo sube al bucket privado "backups-visita" (URL firmada de corta duración;
// se borra solo a las ~2h: lo hace la siguiente generación, _shared/limpiar-backups.ts):
//   · formato 'pdf'   → el informe de la visita en PDF (pdfmake), con las fotos reducidas.
//   · formato 'html'  → el informe web navegable (un único .html).
//   · formato 'zip'   → los ORIGINALES (fotos, audios, documentos) sin informe, partidos en trozos
//                       de ~40 MB (Supabase no admite objetos de más de 50 MB).
//   · formato 'miniaturas' → prepara la caché de miniaturas que usan el PDF y el informe web.
// Nunca se genera automáticamente al cerrar una visita: solo cuando se pide, salvo el worker de
// archivado de SharePoint (PDF y web de cada visita cerrada).
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
import { limpiarBackupsCaducados } from '../_shared/limpiar-backups.ts';
import { obtenerArchivoSharePoint, urlSharePoint } from '../_shared/sharepoint-enlace.ts';
import { reducirParaInforme } from '../_shared/imagen-reducida.ts';
import { generarInformeHtml, zonaDe, ordenarZonas, type FotoHtml, type ArchivoHtml } from '../_shared/informe-html.ts';
// El .d.ts que sirve esm.sh para jszip declara "no default export" aunque el
// módulo JS real sí lo tiene (verificado en Deno).
// @ts-ignore — default export presente en runtime
import JSZip from 'https://esm.sh/jszip@3.10.1';

// Marca, diccionarios de negocio, helpers y bloques de maqueta comunes a los
// dos informes PDF (este y generar-informe-proyecto). Ver _shared/informe-pdf.ts.
import {
  PRIMION_LOGO,
  CORS_HEADERS,
  jsonResponse,
  COLOR,
  PRIORIDAD_ORDEN,
  TIPO_VISITA_LABEL,
  TIPO_VISITA_FRASE,
  FRANJA_LABEL,
  etiqueta,
  crearNumeradorSecciones,
  filaKPIs,
  fechaLarga,
  fechaCorta,
  horaDe,
  mesesEntre,
  textoHaceMeses,
  esVencido,
  nombreArchivoLegible,
  estadoVacio,
  tablaOportunidades as construirTablaOportunidades,
  bloquesHallazgos as construirBloquesHallazgos,
  tablaPasos as construirTablaPasos,
  areasDeFilaHallazgo,
  filasQuienes as construirFilasQuienes,
  bloqueFotosConUbicacion,
  notaResumenManual,
  generarPdfBytes,
  type Nombrado,
  type OportunidadRow,
  type PasoRow,
  type HallazgoRow,
  type ParticipanteRow,
  type InterlocutorRow,
} from '../_shared/informe-pdf.ts';

const LIMITE_OBJETO_BYTES = 50 * 1024 * 1024; // máximo por objeto en Storage (plan gratuito de Supabase)
// Lo que se va sumando entre las peticiones de un mismo ZIP (para el LEEME de la última parte).
interface ZipAcumulado {
  fotos: number;
  audios: number;
  documentos: number;
  perdidasFotos: number;
  perdidasAudios: number;
  perdidasDocumentos: number;
}
const URL_FIRMADA_SEGUNDOS = 60 * 60; // 1h de descarga — el zip vive ~2h en Storage antes de autoborrarse.

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

function filasDeAPares<T>(items: T[]): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < items.length; i += 2) salida.push(items.slice(i, i + 2));
  return salida;
}

// El type-checker de supabase-js no infiere bien la forma de un select con
// varios recursos embebidos (lo colapsa a GenericStringError), así que se
// castea a estas formas explícitas tras cada consulta. Nombrado, HallazgoRow,
// OportunidadRow y PasoRow viven en _shared/informe-pdf.ts (las comparte con
// generar-informe-proyecto).
interface VisitaRow {
  id: string;
  fecha: string;
  tipo_visita: string | null;
  medio: string | null;
  objetivo: string | null;
  resumen_texto: string | null;
  resumen_origen: string | null;
  estado_captura: string;
  franja: string | null;
  hora_definida: boolean;
  cliente: { id: string; nombre: string; sector: string | null; ubicacion_general: string | null; tamano_aprox: string | null } | null;
  proyecto: { nombre: string } | null;
}
interface CapturaRow {
  id: string;
  tipo: string;
  titulo: string | null;
  contenido_texto: string | null;
  storage_path: string | null;
  creado_en: string;
  latitud: number | null;
  longitud: number | null;
  // Etiqueta de zona del Recorrido (texto libre). Sustituye a `ubicacion`
  // en las capturas nuevas; las visitas antiguas siguen con `ubicacion`.
  zona_texto: string | null;
  // Solo documentos: nombre del archivo tal como se subió.
  nombre_original: string | null;
  ubicacion: Nombrado | null;
  // Archivado a SharePoint (migración 128): si storage_path es null y esto
  // es 'sharepoint', el binario se trae del enlace temporal, no de Storage.
  ubicacion_archivo: string;
  ruta_sharepoint: string | null;
}

// Zona de una captura para el informe web: la etiqueta del Recorrido, o la ubicación antigua. '' = sin zona.
function zonaDeCaptura(c: CapturaRow): string {
  return (c.zona_texto || (c.ubicacion as unknown as { nombre: string } | null)?.nombre || '').trim();
}

// Bytes de una foto/audio: de Supabase Storage si sigue ahí, o del enlace
// temporal de SharePoint si ya se archivó (nunca a la vez).
async function descargarBinario(
  admin: ReturnType<typeof createClient>,
  bucket: 'fotos-visita' | 'audios-visita',
  c: CapturaRow
): Promise<Uint8Array | null> {
  if (c.storage_path) {
    const { data, error } = await admin.storage.from(bucket).download(c.storage_path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
  if (c.ubicacion_archivo !== 'sharepoint' || !c.ruta_sharepoint) return null;
  try {
    const url = await obtenerArchivoSharePoint(admin, c.ruta_sharepoint);
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405);
  }

  let visitaId: string | undefined;
  // 'pdf' = solo informe.pdf (lleva las fotos embebidas): la descarga normal
  // del comercial. 'zip' (por defecto, lo que pedían las versiones previas de
  // la app) = PDF + fotos originales + audios: la copia completa.
  // 'html' = solo informe.html (informe web con mapa de fotos, un único archivo).
  let formato: 'pdf' | 'zip' | 'html' | 'miniaturas' = 'zip';
  // Solo lo pide el worker de archivado: el PDF va a la carpeta de la visita en SharePoint, donde los
  // audios y documentos están al lado (no hay «Todo en ZIP»).
  let pedidoEnSharepoint = false;
  // Solo 'zip': la respuesta puede ser parcial (`continuar`) y la app vuelve a pedir con esos datos.
  let zipContinuar: { desde: number; marca: number; parteSiguiente: number; acum: ZipAcumulado } | null = null;
  try {
    const body = await req.json();
    visitaId = body.visitaId;
    if (body.formato === 'zip' && typeof body.desde === 'number' && body.acum) {
      zipContinuar = { desde: body.desde, marca: body.marca, parteSiguiente: body.parteSiguiente, acum: body.acum };
    }
    if (body.formato === 'pdf') formato = 'pdf';
    if (body.formato === 'html') formato = 'html';
    // Solo prepara miniaturas de las fotos (caché de 2 h en backups-visita) para que el informe web pese poco.
    if (body.formato === 'miniaturas') formato = 'miniaturas';
    pedidoEnSharepoint = body.enSharepoint === true;
  } catch {
    return jsonResponse({ error: 'Cuerpo de la petición inválido, se esperaba { visitaId }' }, 400);
  }
  if (!visitaId) {
    return jsonResponse({ error: 'Falta visitaId' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Cliente con service_role — el resto de la función necesita saltarse
  // RLS para leer todas las capturas/hallazgos/oportunidades de la visita
  // y escribir el zip en el bucket de backups.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Llamada del worker de archivado (informe.html a SharePoint): se identifica con la clave del
  // worker (Vault), igual que procesar-briefings; no es un usuario, así que no hay comprobación de
  // participante.
  const claveWorker = req.headers.get('x-clave-worker');
  const enSharepoint = pedidoEnSharepoint && !!claveWorker;
  if (claveWorker) {
    const { data: claveOk } = await admin.rpc('fn_clave_worker_valida', { p_clave: claveWorker });
    if (claveOk !== true) return jsonResponse({ error: 'No autorizado' }, 401);
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'No autenticado' }, 401);
    }

    // Cliente "como el usuario que llama" — solo para validar quién es.
    const clienteUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await clienteUsuario.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Sesión no válida' }, 401);
    }
    const comercialId = userData.user.id;

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
  }

  // --- Recolección de datos de la visita ---
  const { data: visitaData, error: errorVisita } = await admin
    .from('visita')
    .select(
      'id, fecha, tipo_visita, medio, objetivo, resumen_texto, resumen_origen, estado_captura, franja, hora_definida, ' +
        'cliente:cliente_id(id, nombre, sector, ubicacion_general, tamano_aprox), proyecto:proyecto_id(nombre)'
    )
    .eq('id', visitaId)
    .single();
  if (errorVisita || !visitaData) {
    return jsonResponse({ error: 'La visita no existe.' }, 404);
  }
  const visita = visitaData as unknown as VisitaRow;
  const clienteInfo = visita.cliente;
  const proyectoInfo = visita.proyecto;

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
      .select(
        'id, tipo, titulo, contenido_texto, storage_path, creado_en, latitud, longitud, zona_texto, nombre_original, desde_galeria, ubicacion:ubicacion_id(nombre), ubicacion_archivo, ruta_sharepoint'
      )
      .eq('visita_id', visitaId)
      .order('creado_en', { ascending: true }),
    admin
      .from('hallazgo')
      .select(
        'id, nota, creado_en, fecha_relevante, tipo_fecha_relevante, zona_texto, ' +
          'ubicacion:ubicacion_id(nombre), ' +
          'hallazgo_area(categoria:categoria_id(nombre), termino:termino_id(nombre, parent:parent_id(nombre)))'
      )
      .eq('visita_id', visitaId)
      .order('creado_en', { ascending: true }),
    admin
      .from('oportunidad')
      .select('id, titulo, descripcion, etapa, prioridad, valor_estimado, horizonte_decision, zona_texto, ubicacion:ubicacion_id(nombre)')
      .eq('visita_origen_id', visitaId),
    admin
      .from('proximo_paso')
      .select('id, descripcion, fecha_objetivo, estado, zona_texto, comercial_responsable:comercial_responsable_id(nombre)')
      .eq('visita_id', visitaId)
      .order('fecha_objetivo', { ascending: true }),
    admin.from('visita_participante').select('rol, estado, comercial:comercial_id(nombre)').eq('visita_id', visitaId),
    admin.from('visita_interlocutor').select('interlocutor:interlocutor_id(nombre, cargo)').eq('visita_id', visitaId),
  ]);

  const capturas = (capturasData ?? []) as unknown as CapturaRow[];
  // deno-lint-ignore no-explicit-any
  const hallazgos: HallazgoRow[] = ((hallazgosData ?? []) as any[]).map((h) => ({
    id: h.id,
    nota: h.nota,
    creado_en: h.creado_en,
    fecha_relevante: h.fecha_relevante,
    tipo_fecha_relevante: h.tipo_fecha_relevante,
    zona_texto: h.zona_texto,
    ubicacion: h.ubicacion ?? null,
    areas: areasDeFilaHallazgo(h.hallazgo_area),
  }));
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
  const documentos = (capturas ?? []).filter((c) => c.tipo === 'documento');
  const notas = (capturas ?? []).filter((c) => c.tipo === 'nota');

  // --- ZIP de originales ---
  // Fotos, audios y documentos tal cual se capturaron, sin informe: el PDF y el informe web se
  // descargan aparte. Se reparte en tantos archivos como hagan falta, de ~40 MB como máximo cada uno
  // (Supabase no admite objetos de más de 50 MB), y cada parte se sube en cuanto se llena, así que
  // en memoria solo hay una. Una petición no puede con todo si hay muchas: a los ~20 s se cierra la
  // parte en curso y se responde `continuar`; la app vuelve a pedir desde ahí hasta terminar.
  // Ningún archivo suelto pasa de 30 MB (límite de sus buckets): siempre cabe en una parte.
  if (formato === 'zip') {
    const LIMITE_PARTE = 40 * 1024 * 1024;
    const PRESUPUESTO_MS = 20_000;
    const inicio = performance.now();
    const marca = zipContinuar?.marca ?? Date.now();
    const acum: ZipAcumulado = zipContinuar?.acum ?? {
      fotos: 0, audios: 0, documentos: 0, perdidasFotos: 0, perdidasAudios: 0, perdidasDocumentos: 0,
    };
    let nParte = zipContinuar?.parteSiguiente ?? 1;
    const subidas: { ruta: string; bytes: number; n: number }[] = [];
    let zipActual = new JSZip();
    let bytesActual = 0;
    const cerrarParte = async (): Promise<string | null> => {
      const data = await zipActual.generateAsync({ type: 'uint8array' });
      const ruta = `${visitaId}/${marca}-parte-${nParte}.zip`;
      const { error } = await admin.storage
        .from('backups-visita')
        .upload(ruta, data, { contentType: 'application/zip', upsert: true });
      if (error) return error.message;
      subidas.push({ ruta, bytes: data.byteLength, n: nParte });
      nParte += 1;
      zipActual = new JSZip();
      bytesActual = 0;
      return null;
    };
    const agregar = async (ruta: string, bytes: Uint8Array): Promise<string | null> => {
      let fallo: string | null = null;
      if (bytesActual > 0 && bytesActual + bytes.byteLength > LIMITE_PARTE) fallo = await cerrarParte();
      zipActual.file(ruta, bytes);
      bytesActual += bytes.byteLength;
      return fallo;
    };
    const errorZip = (m: string) => jsonResponse({ error: `No se pudo guardar el ZIP: ${m}` }, 500);

    // Todo lo que va al zip, en un orden fijo (así «desde» significa lo mismo en cada petición).
    const elementos = [
      ...fotos.map((fila, i) => ({ tipo: 'foto' as const, fila, n: i + 1 })),
      ...audios.map((fila, i) => ({ tipo: 'audio' as const, fila, n: i + 1 })),
      ...documentos.map((fila, i) => ({ tipo: 'documento' as const, fila, n: i + 1 })),
    ];
    let i = zipContinuar?.desde ?? 0;
    for (; i < elementos.length; i++) {
      if (bytesActual > 0 && performance.now() - inicio > PRESUPUESTO_MS) break;
      const { tipo, fila, n } = elementos[i];
      const numero = String(n).padStart(2, '0');
      let fallo: string | null = null;
      if (tipo === 'foto') {
        const bytes = await descargarBinario(admin, 'fotos-visita', fila);
        if (!bytes) {
          acum.perdidasFotos += 1;
          continue;
        }
        const zona = fila.zona_texto || (fila.ubicacion as unknown as { nombre: string } | null)?.nombre || 'Sin ubicación asignada';
        const nombre = [numero, nombreArchivoLegible(zona, ''), nombreArchivoLegible(fila.titulo, 'foto')].filter(Boolean).join(' - ');
        fallo = await agregar(`fotos/${nombre}.${EXTENSION_POR_FORMATO[detectarFormatoImagen(bytes)]}`, bytes);
        acum.fotos += 1;
      } else if (tipo === 'audio') {
        const bytes = await descargarBinario(admin, 'audios-visita', fila);
        if (!bytes) {
          acum.perdidasAudios += 1;
          continue;
        }
        const extension = fila.storage_path?.split('.').pop() || 'm4a';
        fallo = await agregar(`audios/${numero} - ${nombreArchivoLegible(fila.titulo, 'audio')}.${extension}`, bytes);
        acum.audios += 1;
      } else {
        const descarga = fila.storage_path ? await admin.storage.from('documentos-visita').download(fila.storage_path) : null;
        if (!descarga?.data) {
          acum.perdidasDocumentos += 1;
          continue;
        }
        const nombre = (fila.nombre_original || `documento.${fila.storage_path!.split('.').pop() || 'bin'}`).replace(/[\\/:*?"<>|]/g, '-');
        fallo = await agregar(`documentos/${numero} - ${nombre}`, new Uint8Array(await descarga.data.arrayBuffer()));
        acum.documentos += 1;
      }
      if (fallo) return errorZip(fallo);
    }
    const terminado = i >= elementos.length;

    if (terminado) {
      // LEEME en la última parte (cuando ya se sabe cuántas hay y qué no se pudo recuperar).
      const ahoraZip = new Date().toISOString();
      zipActual.file(
        'LEEME.txt',
        `PrimeNotes — originales de la visita\n` +
          `==========================================\n\n` +
          `Cliente:   ${clienteInfo?.nombre ?? 'cliente'}\n` +
          `Visita:    ${fechaLarga(visita.fecha)}\n` +
          `Generado:  ${fechaLarga(ahoraZip)}, ${horaDe(ahoraZip)}\n\n` +
          `Contenido (${acum.fotos} foto${acum.fotos === 1 ? '' : 's'}, ${acum.audios} audio${acum.audios === 1 ? '' : 's'}, ${acum.documentos} documento${acum.documentos === 1 ? '' : 's'}):\n\n` +
          `  fotos/        Todas las fotos en su resolución original, numeradas por orden de\n` +
          `                captura; el nombre lleva la zona donde se hicieron.\n` +
          `  audios/       Grabaciones de voz de la visita.\n` +
          `  documentos/   Documentos adjuntos, con su nombre original.\n\n` +
          (nParte > 1
            ? `Esta copia viene en ${nParte} archivos (parte-1 … parte-${nParte}) porque pesa mucho: cada uno lleva\n` +
              `ficheros distintos; descomprímelos todos en el mismo sitio. Este es el último.\n\n`
            : '') +
          `El informe de la visita (PDF y web) no va aquí: se descarga aparte desde la visita.\n\n` +
          `Notas:\n` +
          `  - Este material es de uso interno.\n` +
          (acum.perdidasFotos > 0 ? `  - ${acum.perdidasFotos} foto(s) no se pudieron recuperar (archivo perdido o borrado).\n` : '') +
          (acum.perdidasAudios > 0 ? `  - ${acum.perdidasAudios} audio(s) no se pudieron recuperar (archivo perdido o borrado).\n` : '') +
          (acum.perdidasDocumentos > 0 ? `  - ${acum.perdidasDocumentos} documento(s) no se pudieron recuperar (archivo perdido o borrado).\n` : '') +
          `\nGenerado automáticamente por PrimeNotes. No respondas a este\narchivo; para dudas, contacta con tu responsable comercial.\n`
      );
    }
    if (bytesActual > 0 || terminado) {
      const fallo = await cerrarParte();
      if (fallo) return errorZip(fallo);
    }

    const nombreBase = `visita-${nombreArchivoLegible(clienteInfo?.nombre, visitaId)}-${fechaCorta(visita.fecha).replace(/\//g, '-')}`;
    // Sin sufijo solo si todo cupo en un único archivo.
    const unico = terminado && subidas.length === 1 && subidas[0].n === 1;
    const partes: { url: string; tamanoBytes: number }[] = [];
    for (const parte of subidas) {
      const { data: firmada, error: errorFirma } = await admin.storage
        .from('backups-visita')
        .createSignedUrl(parte.ruta, URL_FIRMADA_SEGUNDOS, { download: `${nombreBase}${unico ? '' : `-parte-${parte.n}`}.zip` });
      if (errorFirma || !firmada) return jsonResponse({ error: 'ZIP generado pero no se pudo crear el enlace de descarga.' }, 500);
      partes.push({ url: firmada.signedUrl, tamanoBytes: parte.bytes });
    }
    await limpiarBackupsCaducados(admin);
    return jsonResponse({
      url: partes[0]?.url ?? null,
      partes,
      expiraEnSegundos: URL_FIRMADA_SEGUNDOS,
      tamanoBytes: subidas.reduce((t, x) => t + x.bytes, 0),
      ruta: subidas[0]?.ruta ?? null,
      continuar: terminado ? null : { desde: i, marca, parteSiguiente: nParte, acum },
    });
  }

  // --- Miniaturas del informe web ---
  // Reducir fotos cuesta CPU (~0,15 s cada una) y una petición tiene ~2 s: se hace con presupuesto de
  // tiempo y se guarda en caché (bucket de backups, que se vacía solo a las 2 h). Lo que no dé tiempo
  // va con el original; el worker llama a formato 'miniaturas' hasta que no quede nada pendiente.
  const PRESUPUESTO_MINIATURAS_MS = 1200;
  const MAX_MINIATURAS_POR_LLAMADA = 10;
  // Se mide solo el tiempo que se pasa reduciendo (CPU), no las esperas de red.
  let cpuMiniaturasMs = 0;
  let miniaturasGeneradas = 0;
  let miniaturasPendientes = 0;
  const rutaMiniatura = (f: CapturaRow) => `miniaturas/${f.id}.jpg`;
  // Qué miniaturas hay ya guardadas (una sola consulta, no una por foto).
  const { data: listaMiniaturas } = await admin.storage.from('backups-visita').list('miniaturas', { limit: 1000 });
  const nombresEnCache = new Set((listaMiniaturas ?? []).map((o) => o.name));
  async function miniaturaEnCache(f: CapturaRow): Promise<Uint8Array | null> {
    if (!nombresEnCache.has(`${f.id}.jpg`)) return null;
    const { data } = await admin.storage.from('backups-visita').download(rutaMiniatura(f));
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  }
  const sinPresupuesto = () =>
    cpuMiniaturasMs > PRESUPUESTO_MINIATURAS_MS || miniaturasGeneradas >= MAX_MINIATURAS_POR_LLAMADA;
  // Genera y guarda la miniatura (o, si la foto ya es pequeña, guarda la propia foto como «miniatura»
  // para no volver a procesarla). Devuelve los bytes a embeber.
  async function generarMiniatura(f: CapturaRow, bytes: Uint8Array): Promise<Uint8Array> {
    const inicio = performance.now();
    const mini = (await reducirParaInforme(bytes)) ?? bytes;
    cpuMiniaturasMs += performance.now() - inicio;
    miniaturasGeneradas += 1;
    await admin.storage
      .from('backups-visita')
      .upload(rutaMiniatura(f), mini, { contentType: 'image/jpeg', upsert: true });
    return mini;
  }
  if (formato === 'miniaturas') {
    for (const f of fotos) {
      if (await miniaturaEnCache(f)) continue;
      if (sinPresupuesto()) {
        miniaturasPendientes += 1;
        continue;
      }
      const bytes = await descargarBinario(admin, 'fotos-visita', f);
      if (!bytes) continue;
      const tipoImagen = detectarFormatoImagen(bytes);
      if (tipoImagen !== 'jpeg' && tipoImagen !== 'png') continue;
      await generarMiniatura(f, bytes);
    }
    return jsonResponse({ pendientes: miniaturasPendientes, generadas: miniaturasGeneradas, fotos: fotos.length });
  }

  const pasosOrdenados = proximosPasos ?? [];
  const pasosVencidos = pasosOrdenados.filter((p) => esVencido(p.fecha_objetivo, p.estado)).length;

  const oportunidadesOrdenadas = [...(oportunidades ?? [])].sort(
    (a, b) => (PRIORIDAD_ORDEN[a.prioridad] ?? 9) - (PRIORIDAD_ORDEN[b.prioridad] ?? 9)
  );
  const totalOportunidades = oportunidadesOrdenadas.reduce((suma, o) => suma + (o.valor_estimado ?? 0), 0);

  const hallazgosCount = hallazgos.length;

  const visitaEnCurso = visita.estado_captura === 'en_curso';

  const tipoLabel = visita.tipo_visita ? etiqueta(TIPO_VISITA_LABEL, visita.tipo_visita) : 'Visita';
  const frasesBase = (visita.tipo_visita && TIPO_VISITA_FRASE[visita.tipo_visita]) || 'Visita';
  // Teams / llamada se dicen en la portada; presencial no añade nada (migración 136).
  const frasesVisita =
    visita.medio === 'teams' ? `${frasesBase} (por Teams)` : visita.medio === 'llamada' ? `${frasesBase} (por llamada)` : frasesBase;

  // --- Descarga de binarios para el informe: fotos (miniaturas o, sin caché, originales) ---

  type FotoLista = {
    titulo: string | null;
    ubicacionNombre: string;
    zona: string; // '' = sin zona
    creadoEn: string;
    dataUri: string;
  };
  const fotosParaPdf: FotoLista[] = [];
  // Para el informe web: TODAS las fotos recuperadas (también las de formato no embebible), con su GPS.
  const fotosHtml: FotoHtml[] = [];
  const audiosHtml: ArchivoHtml[] = [];
  const documentosHtml: ArchivoHtml[] = [];
  const fotosNoIncluidas: { titulo: string; formato: string }[] = [];
  // Antes de este cambio, un archivo huérfano/borrado se omitía en silencio:
  // el comercial veía "5 fotos" en la app pero el PDF/zip solo traía 4, sin
  // ninguna pista de por qué. Se cuenta y se avisa (portada + LEEME.txt).
  let fotosFallidas = 0;
  let audiosFallidos = 0;
  let documentosFallidos = 0;

  // `formato` se vuelve a usar dentro del bucle para el de la imagen: aquí se guarda el de la salida.
  const formatoSalida = formato;
  let indiceFoto = 0;
  for (const f of fotos) {
    indiceFoto += 1;
    const ubicacionNombre =
      f.zona_texto || (f.ubicacion as unknown as { nombre: string } | null)?.nombre || 'Sin ubicación asignada';
    // Informe web y PDF con la miniatura ya en caché: no hace falta bajar el original (ahorra tiempo y,
    // sobre todo, memoria: con ~35+ originales el PDF se quedaba sin recursos).
    if (formatoSalida === 'html' || formatoSalida === 'pdf') {
      const enCache = await miniaturaEnCache(f);
      const formatoCache = enCache ? detectarFormatoImagen(enCache) : 'desconocido';
      if (enCache && (formatoCache === 'jpeg' || formatoCache === 'png') && formatoSalida === 'pdf') {
        fotosParaPdf.push({
          titulo: f.titulo,
          ubicacionNombre,
          zona: zonaDeCaptura(f),
          creadoEn: f.creado_en,
          dataUri: `data:image/${formatoCache};base64,${base64Encode(enCache)}`,
        });
        continue;
      }
      if (enCache && (formatoCache === 'jpeg' || formatoCache === 'png')) {
        fotosHtml.push({
          n: indiceFoto,
          titulo: f.titulo,
          zona: zonaDeCaptura(f),
          creadoEn: f.creado_en,
          dataUri: `data:image/${formatoCache};base64,${base64Encode(enCache)}`,
          urlOriginal: urlSharePoint(f.ruta_sharepoint),
          latitud: f.latitud,
          longitud: f.longitud,
          deGaleria: f.desde_galeria,
        });
        continue;
      }
    }
    const bytes = await descargarBinario(admin, 'fotos-visita', f);
    if (!bytes) {
      fotosFallidas += 1;
      continue; // fichero huérfano/borrado, o SharePoint no respondió — se omite, no se aborta el backup entero.
    }
    const formato = detectarFormatoImagen(bytes);
    // Miniatura reducida (~50 KB): la usan el informe web y el PDF (con los originales en base64 el PDF
    // se quedaba sin memoria a partir de unas 30 fotos). Los originales van en el ZIP de originales.
    let mini: Uint8Array | null = null;
    // Informe web: miniatura y enlace al original (en SharePoint, si ya está copiada).
    if (formatoSalida !== 'pdf') {
      const embebible = formato === 'jpeg' || formato === 'png';
      if (embebible) {
        mini = await miniaturaEnCache(f);
        if (!mini && !sinPresupuesto()) mini = await generarMiniatura(f, bytes);
      }
      const formatoMini = mini ? detectarFormatoImagen(mini) : 'desconocido';
      fotosHtml.push({
        n: indiceFoto,
        titulo: f.titulo,
        zona: zonaDeCaptura(f),
        creadoEn: f.creado_en,
        dataUri: mini && (formatoMini === 'jpeg' || formatoMini === 'png')
          ? `data:image/${formatoMini};base64,${base64Encode(mini)}`
          : embebible
            ? `data:image/${formato};base64,${base64Encode(bytes)}`
            : null,
        urlOriginal: urlSharePoint(f.ruta_sharepoint),
        latitud: f.latitud,
        longitud: f.longitud,
        deGaleria: f.desde_galeria,
      });
    }

    if (formatoSalida === 'html') {
      // El informe web no usa el anexo del PDF.
    } else if (formato === 'jpeg' || formato === 'png') {
      const formatoMini = mini ? detectarFormatoImagen(mini) : 'desconocido';
      const usaMini = mini && (formatoMini === 'jpeg' || formatoMini === 'png');
      fotosParaPdf.push({
        titulo: f.titulo,
        ubicacionNombre,
        zona: zonaDeCaptura(f),
        creadoEn: f.creado_en,
        dataUri: usaMini
          ? `data:image/${formatoMini};base64,${base64Encode(mini as Uint8Array)}`
          : `data:image/${formato};base64,${base64Encode(bytes)}`,
      });
    } else {
      fotosNoIncluidas.push({
        titulo: f.titulo || `Foto ${indiceFoto}`,
        formato: formato === 'desconocido' ? 'formato no reconocido' : formato.toUpperCase(),
      });
    }
  }

  // Solo los que sí se descargaron van al anexo del PDF — antes se listaban
  // TODOS los de `audios` (incluidos los fallidos) diciendo "archivo en la
  // carpeta audios/ del zip", una mentira si esa descarga en concreto falló.
  const audiosDescargados: CapturaRow[] = [];
  let indiceAudio = 0;
  for (const a of audios) {
    indiceAudio += 1;
    const bytes = await descargarBinario(admin, 'audios-visita', a);
    if (!bytes) {
      audiosFallidos += 1;
      continue;
    }
    audiosHtml.push({ titulo: a.titulo || 'Audio sin título', creadoEn: a.creado_en, zona: zonaDeCaptura(a), url: urlSharePoint(a.ruta_sharepoint, true) });
    audiosDescargados.push(a);
  }

  // Documentos adjuntos: solo van al zip (como los audios), con su nombre
  // original — nunca el uuid de Storage. Numerados para que dos con el mismo
  // nombre no se pisen.
  const documentosDescargados: CapturaRow[] = [];
  let indiceDocumento = 0;
  for (const d of documentos) {
    indiceDocumento += 1;
    if (!d.storage_path) {
      documentosFallidos += 1;
      continue;
    }
    const { data, error } = await admin.storage.from('documentos-visita').download(d.storage_path);
    if (error || !data) {
      documentosFallidos += 1;
      continue;
    }
    documentosHtml.push({ titulo: d.titulo || d.nombre_original || 'Documento', creadoEn: d.creado_en, zona: zonaDeCaptura(d), url: urlSharePoint(d.ruta_sharepoint, true) });
    documentosDescargados.push(d);
  }

  const fotosPorUbicacion = new Map<string, FotoLista[]>();
  for (const f of fotosParaPdf) {
    const lista = fotosPorUbicacion.get(f.ubicacionNombre) ?? [];
    lista.push(f);
    fotosPorUbicacion.set(f.ubicacionNombre, lista);
  }

  // ---------------------------------------------------------------------
  // Construcción del PDF con pdfmake — layoutTabla, chip, estadoVacio,
  // tablaOportunidades, bloquesHallazgos y tablaPasos vienen de
  // _shared/informe-pdf.ts. Aquí solo la portada, la numeración de secciones
  // y el ensamblado propios del informe de visita.
  // ---------------------------------------------------------------------

  const tituloSeccion = crearNumeradorSecciones();

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

  // Responsable / Acompañantes / Interlocutores — compartido con
  // generar-informe-proyecto (_shared/informe-pdf.ts), para que la
  // cronología del proyecto muestre exactamente lo mismo por cada visita.
  const filasQuienes = construirFilasQuienes(participantesVisita ?? [], interlocutoresVisita ?? []);

  const ahora = new Date().toISOString();

  // deno-lint-ignore no-explicit-any
  const portada: any[] = [
    {
      stack: [
        { image: PRIMION_LOGO, width: 116 },
        { text: 'PRIMION TECHNOLOGY', bold: true, fontSize: 9, color: COLOR.signal600, characterSpacing: 1.2, margin: [0, 8, 0, 0] },
        { text: 'PrimeNotes · Documento interno', fontSize: 8, color: COLOR.ink400, margin: [0, 3, 0, 0] },
      ],
    },
    {
      margin: [0, 40, 0, 0],
      stack: [
        { text: 'INFORME DE VISITA', fontSize: 10, bold: true, color: COLOR.ink400, characterSpacing: 1 },
        { text: clienteInfo?.nombre ?? 'Cliente', fontSize: 27, bold: true, color: COLOR.brand700, margin: [0, 4, 0, 4] },
        { text: 'Proyecto · ' + (proyectoInfo?.nombre ?? '—'), fontSize: 10.5, bold: true, color: COLOR.brand600, margin: [0, 0, 0, 8] },
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
                  color: COLOR.warning600,
                  fillColor: COLOR.warning050,
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
        `Generado el ${fechaLarga(ahora)}, ${horaDe(ahora)} por PrimeNotes · documento interno. ` +
        'Refleja el estado de la visita en el momento de generarlo; los cambios posteriores no se recogen aquí.',
    },
  ];

  // Bloques compartidos con generar-informe-proyecto (_shared/informe-pdf.ts):
  // la tabla de oportunidades, la lista de hallazgos (nota + áreas) y la tabla
  // de próximos pasos salen idénticas en los dos informes.
  const tablaOportunidades = construirTablaOportunidades(oportunidadesOrdenadas);
  const bloquesHallazgos = construirBloquesHallazgos(hallazgos, 'No se registraron hallazgos en esta visita.');
  const tablaPasos = construirTablaPasos(pasosOrdenados);

  // --- Notas (sección fija; si no hay, un estado vacío como Hallazgos u
  // Oportunidades) ---
  // deno-lint-ignore no-explicit-any
  const bloqueNota = (n: CapturaRow): any => ({
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
  });
  // deno-lint-ignore no-explicit-any
  const bloquesNotas: any[] = notas.length ? notas.map(bloqueNota) : [estadoVacio('No se registraron notas en esta visita.')];

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
  const filaColumnas = (par: FotoLista[]): any => ({
    margin: [0, 0, 0, 12],
    columnGap: 14,
    columns: [celdaFoto(par[0]), par[1] ? celdaFoto(par[1]) : { width: '*', text: '' }],
  });

  // Avisos sobre las fotos (no incluidas por formato / no recuperadas): van tras las fotos, en
  // cualquiera de las dos organizaciones del PDF.
  // deno-lint-ignore no-explicit-any
  const avisosFotos = (): any[] => {
    // deno-lint-ignore no-explicit-any
    const out: any[] = [];
    if (fotosNoIncluidas.length) {
      out.push({
        margin: [0, 6, 0, 4],
        text: [
          { text: 'No incluidas en el PDF ', bold: true, fontSize: 9, color: COLOR.ink700 },
          { text: '(formato no compatible con la vista previa; están en «Originales en ZIP»):', fontSize: 9, color: COLOR.ink400 },
        ],
      });
      for (const nf of fotosNoIncluidas) {
        out.push({ text: `•  ${nf.titulo} (${nf.formato})`, fontSize: 9, color: COLOR.ink700, margin: [8, 2, 0, 0] });
      }
    }
    if (fotosFallidas > 0) {
      out.push({
        margin: [0, 6, 0, 0],
        text: `${fotosFallidas} ${fotosFallidas === 1 ? 'foto no se pudo recuperar' : 'fotos no se pudieron recuperar'} (puede que el archivo se haya perdido o borrado) y no está${fotosFallidas === 1 ? '' : 'n'} en este backup.`,
        fontSize: 9,
        color: COLOR.warning600,
      });
    }
    return out;
  };

  // deno-lint-ignore no-explicit-any
  const bloquesFotos: any[] = [];
  if (fotos.length === 0) {
    bloquesFotos.push(estadoVacio('Sin fotografías.'));
  } else {
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
    bloquesFotos.push(...avisosFotos());
  }

  // --- Fotos con ubicación: coordenadas GPS + enlace a Google Maps ---
  // Compartido con generar-informe-proyecto (_shared/informe-pdf.ts).
  const bloquesFotosUbicacion = bloqueFotosConUbicacion(fotos);

  // Una línea de la lista de audios / documentos (en el anexo, o dentro de su zona).
  // deno-lint-ignore no-explicit-any
  const lineaAudio = (a: CapturaRow): any => ({
    text: `•  ${a.titulo || 'Audio sin título'}  ·  ${horaDe(a.creado_en)}  —  ${enSharepoint ? 'archivo en esta misma carpeta de SharePoint' : 'se descarga aparte en «Originales en ZIP»'}`,
    fontSize: 9.5,
    color: COLOR.ink700,
    margin: [0, 0, 0, 4],
  });
  // deno-lint-ignore no-explicit-any
  const lineaDocumento = (d: CapturaRow): any => ({
    text: `•  ${d.titulo || d.nombre_original || 'Documento'}  ·  ${horaDe(d.creado_en)}  —  ${enSharepoint ? 'archivo en esta misma carpeta de SharePoint' : 'se descarga aparte en «Originales en ZIP»'}`,
    fontSize: 9.5,
    color: COLOR.ink700,
    margin: [0, 0, 0, 4],
  });

  // deno-lint-ignore no-explicit-any
  const avisoAudiosFallidos: any = audiosFallidos > 0
    ? {
        text: `${audiosFallidos} ${audiosFallidos === 1 ? 'audio no se pudo recuperar' : 'audios no se pudieron recuperar'} (puede que el archivo se haya perdido o borrado) y no está${audiosFallidos === 1 ? '' : 'n'} en este backup.`,
        fontSize: 9,
        color: COLOR.warning600,
        margin: [0, 6, 0, 0],
      }
    : null;
  // deno-lint-ignore no-explicit-any
  const avisoDocumentosFallidos: any = documentosFallidos > 0
    ? {
        text: `${documentosFallidos} ${documentosFallidos === 1 ? 'documento no se pudo recuperar' : 'documentos no se pudieron recuperar'} (puede que el archivo se haya perdido o borrado) y no está${documentosFallidos === 1 ? '' : 'n'} en este backup.`,
        fontSize: 9,
        color: COLOR.warning600,
        margin: [0, 6, 0, 0],
      }
    : null;

  // --- Anexo de audios (se omite del todo si no hay ninguno) ---
  // deno-lint-ignore no-explicit-any
  const bloquesAudios: any[] | null = audiosDescargados.length || audiosFallidos > 0
    ? [...audiosDescargados.map(lineaAudio), avisoAudiosFallidos].filter(Boolean)
    : null;

  // --- Anexo de documentos (se omite del todo si no hay ninguno) ---
  // deno-lint-ignore no-explicit-any
  const bloquesDocumentos: any[] | null = documentosDescargados.length || documentosFallidos > 0
    ? [...documentosDescargados.map(lineaDocumento), avisoDocumentosFallidos].filter(Boolean)
    : null;

  // --- Organización por zona ---
  // Si la visita tiene zonas, el informe se cuenta zona a zona: todo lo de una zona junto
  // (oportunidades, hallazgos, notas, próximos pasos, audios, documentos y fotos) y lo que no tiene
  // zona, al final como «Sin zona». Sin zonas, el orden clásico por tipo. Mismo criterio que el
  // informe web.
  const contadorZonas = new Map<string, number>();
  const cuentaZona = (z: string) => contadorZonas.set(z, (contadorZonas.get(z) ?? 0) + 1);
  fotosParaPdf.forEach((f) => cuentaZona(f.zona));
  hallazgos.forEach((h) => cuentaZona(zonaDe(h.zona_texto, h.ubicacion)));
  oportunidadesOrdenadas.forEach((o) => cuentaZona(zonaDe(o.zona_texto, o.ubicacion)));
  pasosOrdenados.forEach((p) => cuentaZona(zonaDe(p.zona_texto)));
  notas.forEach((n) => cuentaZona(zonaDeCaptura(n)));
  audiosDescargados.forEach((a) => cuentaZona(zonaDeCaptura(a)));
  documentosDescargados.forEach((d) => cuentaZona(zonaDeCaptura(d)));
  const zonasOrden = ordenarZonas(contadorZonas);
  const hayZonas = zonasOrden.some((z) => z !== '');

  // headlineLevel: ver pageBreakBefore en docDefinition (un subtítulo no se queda solo al pie de página).
  // deno-lint-ignore no-explicit-any
  const subtituloZona = (texto: string, n: number): any => ({
    headlineLevel: 1,
    margin: [0, 12, 0, 6],
    text: [
      { text: texto, bold: true, fontSize: 11, color: COLOR.brand600 },
      { text: `  (${n})`, fontSize: 9.5, color: COLOR.ink400 },
    ],
  });
  const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

  // deno-lint-ignore no-explicit-any
  function bloquesDeZona(z: string): any[] {
    const ops = oportunidadesOrdenadas.filter((o) => zonaDe(o.zona_texto, o.ubicacion) === z);
    const hs = hallazgos.filter((h) => zonaDe(h.zona_texto, h.ubicacion) === z);
    const ns = notas.filter((n) => zonaDeCaptura(n) === z);
    const ps = pasosOrdenados.filter((p) => zonaDe(p.zona_texto) === z);
    const as = audiosDescargados.filter((a) => zonaDeCaptura(a) === z);
    const ds = documentosDescargados.filter((d) => zonaDeCaptura(d) === z);
    const fs = fotosParaPdf.filter((f) => f.zona === z);
    const resumen = [
      ops.length ? cuantos(ops.length, 'oportunidad', 'oportunidades') : '',
      hs.length ? cuantos(hs.length, 'hallazgo', 'hallazgos') : '',
      ns.length ? cuantos(ns.length, 'nota', 'notas') : '',
      ps.length ? cuantos(ps.length, 'próximo paso', 'próximos pasos') : '',
      as.length ? cuantos(as.length, 'audio', 'audios') : '',
      ds.length ? cuantos(ds.length, 'documento', 'documentos') : '',
      fs.length ? cuantos(fs.length, 'foto', 'fotos') : '',
    ]
      .filter(Boolean)
      .join(' · ');
    // deno-lint-ignore no-explicit-any
    const out: any[] = [tituloSeccion(z || 'Sin zona', resumen)];
    if (ops.length) out.push(subtituloZona('Oportunidades', ops.length), construirTablaOportunidades(ops));
    if (hs.length) out.push(subtituloZona('Hallazgos', hs.length), ...construirBloquesHallazgos(hs, ''));
    if (ns.length) out.push(subtituloZona('Notas', ns.length), ...ns.map(bloqueNota));
    if (ps.length) out.push(subtituloZona('Próximos pasos', ps.length), construirTablaPasos(ps));
    if (as.length) out.push(subtituloZona('Audios', as.length), ...as.map(lineaAudio));
    if (ds.length) out.push(subtituloZona('Documentos', ds.length), ...ds.map(lineaDocumento));
    if (fs.length) {
      out.push(subtituloZona('Fotos', fs.length));
      for (const par of filasDeAPares(fs)) out.push(filaColumnas(par));
    }
    return out;
  }

  // --- Ensamblado final ---
  // deno-lint-ignore no-explicit-any
  const contenido: any[] = [
    ...portada,
    tituloSeccion('Resumen ejecutivo'),
    visita.resumen_texto
      ? { text: visita.resumen_texto, fontSize: 10.5, color: COLOR.ink900, lineHeight: 1.3 }
      : estadoVacio('Sin resumen registrado para esta visita.'),
    notaResumenManual(visita.resumen_origen),
    filaKPIs([
      { valor: totalOportunidades > 0 ? `${totalOportunidades.toLocaleString('es-ES')} €` : '—', etiqueta: 'Valor estimado en oportunidades' },
      { valor: String(hallazgosCount), etiqueta: hallazgosCount === 1 ? 'Hallazgo' : 'Hallazgos' },
      {
        valor: String(pasosVencidos),
        etiqueta: `Próximos pasos vencidos (de ${pasosOrdenados.length})`,
        alerta: pasosVencidos > 0,
      },
    ]),
    tituloSeccion('Objetivo de la visita'),
    visita.objetivo ? { text: visita.objetivo, fontSize: 10, color: COLOR.ink700 } : estadoVacio('Sin objetivo registrado para esta visita.'),
  ];

  if (hayZonas) {
    // Zona a zona; después, lo que no se pudo incluir/recuperar y el listado de coordenadas de las fotos.
    for (const z of zonasOrden) contenido.push(...bloquesDeZona(z));
    const avisos = [...avisosFotos(), avisoAudiosFallidos, avisoDocumentosFallidos].filter(Boolean);
    if (avisos.length) contenido.push(tituloSeccion('Avisos'), ...avisos);
    if (bloquesFotosUbicacion.length) contenido.push(tituloSeccion('Fotos con ubicación'), ...bloquesFotosUbicacion);
  } else {
    contenido.push(
      // PM11 Fase 4 — mismas palabras y orden que la app: Notas · Hallazgos ·
      // Oportunidades · Próximos pasos.
      tituloSeccion('Notas', notas.length ? `(${notas.length})` : undefined),
      ...bloquesNotas,
      tituloSeccion('Hallazgos', hallazgos.length ? `(${hallazgos.length})` : undefined),
      ...bloquesHallazgos,
      tituloSeccion('Oportunidades', oportunidadesOrdenadas.length ? `(${oportunidadesOrdenadas.length})` : undefined),
      oportunidadesOrdenadas.length ? tablaOportunidades : estadoVacio('No se registraron oportunidades en esta visita.'),
      tituloSeccion('Próximos pasos', pasosOrdenados.length ? `(${pasosOrdenados.length})` : undefined),
      pasosOrdenados.length ? tablaPasos : estadoVacio('No se registraron próximos pasos en esta visita.'),
      tituloSeccion('Anexo fotográfico', fotos.length ? `(${fotos.length})` : undefined),
      ...bloquesFotos,
      ...bloquesFotosUbicacion
    );
    if (bloquesAudios) {
      contenido.push(tituloSeccion('Anexo de audios', `(${audiosDescargados.length})`), ...bloquesAudios);
    }
    if (bloquesDocumentos) {
      contenido.push(tituloSeccion('Anexo de documentos', `(${documentosDescargados.length})`), ...bloquesDocumentos);
    }
  }

  const docDefinition = {
    info: {
      title: `Informe de visita — ${clienteInfo?.nombre ?? 'cliente'} — ${fechaCorta(visita.fecha)}`,
      author: 'PrimeNotes',
    },
    pageSize: 'A4',
    pageMargins: [48, 40, 48, 56],
    // Un subtítulo de zona (headlineLevel 1) no se queda solo al pie de la página.
    pageBreakBefore: (nodo: { headlineLevel?: number }, siguientes: unknown[]) =>
      nodo.headlineLevel === 1 && siguientes.length === 0,
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
              { text: 'PrimeNotes', fontSize: 8.5, color: COLOR.ink400 },
              { text: `Pág. ${paginaActual} de ${totalPaginas}`, alignment: 'right', fontSize: 8.5, color: COLOR.ink400 },
            ],
          },
    content: contenido,
    defaultStyle: { font: 'Roboto', fontSize: 10 },
  };

  // El informe web (solo .html) no necesita el PDF: se ahorra su maquetación.
  let pdfBytes = new Uint8Array();
  if (formato !== 'html') {
    try {
      pdfBytes = await generarPdfBytes(docDefinition);
    } catch (e) {
      console.error('Fallo generando el PDF del informe', e);
      return jsonResponse({ error: 'No se pudo maquetar el informe de la visita.' }, 500);
    }
  }

  // --- Informe web: mapa + fichas de foto con su ubicación, todo junto ---
  const avisosHtml = [
    fotosFallidas > 0 ? `${fotosFallidas} foto(s) no se pudieron recuperar (archivo perdido o borrado) y no están en este informe.` : null,
    audiosFallidos > 0 ? `${audiosFallidos} audio(s) no se pudieron recuperar y no están en este backup.` : null,
    documentosFallidos > 0 ? `${documentosFallidos} documento(s) no se pudieron recuperar y no están en este backup.` : null,
  ].filter((t): t is string => !!t);
  const informeHtml = generarInformeHtml({
    clienteNombre: clienteInfo?.nombre ?? 'Cliente',
    proyectoNombre: proyectoInfo?.nombre ?? '—',
    metaCliente,
    lineaVisita: `${frasesVisita} · ${fechaLarga(visita.fecha)}${lineaHora}`,
    lineaHistorico,
    participantes: participantesVisita,
    interlocutores: interlocutoresVisita,
    enCurso: visitaEnCurso,
    resumenTexto: visita.resumen_texto,
    resumenManual: visita.resumen_origen === 'manual',
    objetivo: visita.objetivo,
    oportunidades: oportunidadesOrdenadas,
    hallazgos,
    pasos: pasosOrdenados,
    notas: notas.map((n) => ({ titulo: n.titulo, texto: n.contenido_texto, zona: zonaDeCaptura(n) })),
    fotos: fotosHtml,
    audios: audiosHtml,
    documentos: documentosHtml,
    urlTeselas: `${supabaseUrl}/functions/v1/tile-mapa`,
    enlaceApp: `${(Deno.env.get('APP_URL') ?? 'https://rococo-gumption-efb70a.netlify.app').replace(/\/+$/, '')}/visita/${visitaId}${visitaEnCurso ? '' : '/detalle'}`,
    avisos: avisosHtml,
    generadoEn: `${fechaLarga(ahora)}, ${horaDe(ahora)}`,
    logo: typeof PRIMION_LOGO === 'string' ? PRIMION_LOGO : null,
  });

  const archivo =
    formato === 'pdf'
      ? { bytes: pdfBytes, extension: 'pdf', contentType: 'application/pdf' }
      : { bytes: new TextEncoder().encode(informeHtml), extension: 'html', contentType: 'text/html; charset=utf-8' };

  // --- Subida al bucket de backups ---
  // Supabase rechaza objetos de más de 50 MB (plan gratuito). Mejor avisar con claridad que dejar un
  // «no se pudo generar» sin explicación; quien descarga para liberar espacio no borra nada si falla.
  if (archivo.bytes.byteLength > LIMITE_OBJETO_BYTES) {
    const mb = Math.ceil(archivo.bytes.byteLength / (1024 * 1024));
    return jsonResponse(
      {
        error: `Esta visita pesa ${mb} MB y no cabe en un solo archivo (máximo 50 MB). Usa «PDF de la visita» o «Informe web»; las fotos originales siguen en la app y en SharePoint.`,
      },
      413
    );
  }
  const timestamp = Date.now();
  const ruta = `${visitaId}/${timestamp}.${archivo.extension}`;
  const { error: errorSubida } = await admin.storage
    .from('backups-visita')
    .upload(ruta, archivo.bytes, { contentType: archivo.contentType, upsert: true });
  if (errorSubida) {
    return jsonResponse({ error: `No se pudo guardar el informe: ${errorSubida.message}` }, 500);
  }

  const nombreDescarga = `visita-${nombreArchivoLegible(clienteInfo?.nombre, visitaId)}-${fechaCorta(visita.fecha).replace(/\//g, '-')}.${archivo.extension}`;
  const { data: firmada, error: errorFirma } = await admin.storage
    .from('backups-visita')
    .createSignedUrl(ruta, URL_FIRMADA_SEGUNDOS, { download: nombreDescarga });
  if (errorFirma || !firmada) {
    return jsonResponse({ error: 'Informe generado pero no se pudo crear el enlace de descarga.' }, 500);
  }

  await limpiarBackupsCaducados(admin);

  return jsonResponse({
    url: firmada.signedUrl,
    expiraEnSegundos: URL_FIRMADA_SEGUNDOS,
    tamanoBytes: archivo.bytes.byteLength,
    ruta,
  });
});

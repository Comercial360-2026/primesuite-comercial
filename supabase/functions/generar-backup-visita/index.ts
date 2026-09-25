// supabase/functions/generar-backup-visita/index.ts
//
// Fase B del sistema de espacio/backup (Dirección Comercial, agosto 2026).
// Genera bajo demanda un zip con: informe.pdf (maquetado con pdfmake,
// jerarquía real, tablas, anexo fotográfico) + fotos originales + audios
// sueltos + LEEME.txt, y lo sube al bucket privado "backups-visita".
// Devuelve una URL firmada de corta duración — el propio zip se borra solo
// a las ~2h (lo borra la siguiente generación: _shared/limpiar-backups.ts),
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
import { limpiarBackupsCaducados } from '../_shared/limpiar-backups.ts';
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
  ubicacion: Nombrado | null;
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
  let formato: 'pdf' | 'zip' = 'zip';
  try {
    const body = await req.json();
    visitaId = body.visitaId;
    if (body.formato === 'pdf') formato = 'pdf';
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
      'id, fecha, tipo_visita, objetivo, resumen_texto, resumen_origen, estado_captura, franja, hora_definida, ' +
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
      .select('id, tipo, titulo, contenido_texto, storage_path, creado_en, latitud, longitud, zona_texto, ubicacion:ubicacion_id(nombre)')
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
      .select('id, titulo, descripcion, etapa, prioridad, valor_estimado, horizonte_decision')
      .eq('visita_origen_id', visitaId),
    admin
      .from('proximo_paso')
      .select('id, descripcion, fecha_objetivo, estado, comercial_responsable:comercial_responsable_id(nombre)')
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
  const notas = (capturas ?? []).filter((c) => c.tipo === 'nota');

  const pasosOrdenados = proximosPasos ?? [];
  const pasosVencidos = pasosOrdenados.filter((p) => esVencido(p.fecha_objetivo, p.estado)).length;

  const oportunidadesOrdenadas = [...(oportunidades ?? [])].sort(
    (a, b) => (PRIORIDAD_ORDEN[a.prioridad] ?? 9) - (PRIORIDAD_ORDEN[b.prioridad] ?? 9)
  );
  const totalOportunidades = oportunidadesOrdenadas.reduce((suma, o) => suma + (o.valor_estimado ?? 0), 0);

  const hallazgosCount = hallazgos.length;

  const visitaEnCurso = visita.estado_captura === 'en_curso';

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
  // Antes de este cambio, un archivo huérfano/borrado se omitía en silencio:
  // el comercial veía "5 fotos" en la app pero el PDF/zip solo traía 4, sin
  // ninguna pista de por qué. Se cuenta y se avisa (portada + LEEME.txt).
  let fotosFallidas = 0;
  let audiosFallidos = 0;

  let indiceFoto = 0;
  for (const f of fotos) {
    indiceFoto += 1;
    const ubicacionNombre =
      f.zona_texto || (f.ubicacion as unknown as { nombre: string } | null)?.nombre || 'Sin ubicación asignada';
    if (!f.storage_path) {
      fotosFallidas += 1;
      continue;
    }
    const { data, error } = await admin.storage.from('fotos-visita').download(f.storage_path);
    if (error || !data) {
      fotosFallidas += 1;
      continue; // fichero huérfano o ya borrado — se omite, no se aborta el backup entero.
    }
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

  // Solo los que sí se descargaron van al anexo del PDF — antes se listaban
  // TODOS los de `audios` (incluidos los fallidos) diciendo "archivo en la
  // carpeta audios/ del zip", una mentira si esa descarga en concreto falló.
  const audiosDescargados: CapturaRow[] = [];
  let indiceAudio = 0;
  for (const a of audios) {
    indiceAudio += 1;
    if (!a.storage_path) {
      audiosFallidos += 1;
      continue;
    }
    const { data, error } = await admin.storage.from('audios-visita').download(a.storage_path);
    if (error || !data) {
      audiosFallidos += 1;
      continue;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    const extension = a.storage_path.split('.').pop() || 'm4a';
    const nombreArchivo = [String(indiceAudio).padStart(2, '0'), nombreArchivoLegible(a.titulo, 'audio')].join(' - ');
    carpetaAudios.file(`${nombreArchivo}.${extension}`, bytes);
    audiosDescargados.push(a);
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
  const bloquesNotas: any[] = notas.length
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
    : [estadoVacio('No se registraron notas en esta visita.')];

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
    if (fotosFallidas > 0) {
      bloquesFotos.push({
        margin: [0, 6, 0, 0],
        text: `${fotosFallidas} ${fotosFallidas === 1 ? 'foto no se pudo recuperar' : 'fotos no se pudieron recuperar'} (puede que el archivo se haya perdido o borrado) y no está${fotosFallidas === 1 ? '' : 'n'} en este backup.`,
        fontSize: 9,
        color: COLOR.warning600,
      });
    }
  }

  // --- Fotos con ubicación: coordenadas GPS + enlace a Google Maps ---
  // Compartido con generar-informe-proyecto (_shared/informe-pdf.ts).
  const bloquesFotosUbicacion = bloqueFotosConUbicacion(fotos);

  // --- Anexo de audios (se omite del todo si no hay ninguno) ---
  // deno-lint-ignore no-explicit-any
  const bloquesAudios: any[] | null = audiosDescargados.length || audiosFallidos > 0
    ? [
        ...audiosDescargados.map((a) => ({
          text: `•  ${a.titulo || 'Audio sin título'}  ·  ${horaDe(a.creado_en)}  —  ${formato === 'pdf' ? 'se descarga aparte en «Todo en ZIP»' : 'archivo en la carpeta audios/ del zip'}`,
          fontSize: 9.5,
          color: COLOR.ink700,
          margin: [0, 0, 0, 4],
        })),
        audiosFallidos > 0
          ? {
              text: `${audiosFallidos} ${audiosFallidos === 1 ? 'audio no se pudo recuperar' : 'audios no se pudieron recuperar'} (puede que el archivo se haya perdido o borrado) y no está${audiosFallidos === 1 ? '' : 'n'} en este backup.`,
              fontSize: 9,
              color: COLOR.warning600,
              margin: [0, 6, 0, 0],
            }
          : null,
      ].filter(Boolean)
    : null;

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
  ];

  contenido.push(
    tituloSeccion('Anexo fotográfico', fotos.length ? `(${fotos.length})` : undefined),
    ...bloquesFotos,
    ...bloquesFotosUbicacion
  );
  if (bloquesAudios) {
    contenido.push(tituloSeccion('Anexo de audios', `(${audiosDescargados.length})`), ...bloquesAudios);
  }

  const docDefinition = {
    info: {
      title: `Informe de visita — ${clienteInfo?.nombre ?? 'cliente'} — ${fechaCorta(visita.fecha)}`,
      author: 'PrimeNotes',
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
              { text: 'PrimeNotes', fontSize: 8.5, color: COLOR.ink400 },
              { text: `Pág. ${paginaActual} de ${totalPaginas}`, alignment: 'right', fontSize: 8.5, color: COLOR.ink400 },
            ],
          },
    content: contenido,
    defaultStyle: { font: 'Roboto', fontSize: 10 },
  };

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generarPdfBytes(docDefinition);
  } catch (e) {
    console.error('Fallo generando el PDF del informe', e);
    return jsonResponse({ error: 'No se pudo maquetar el informe de la visita.' }, 500);
  }
  zip.file('informe.pdf', pdfBytes);

  // --- LEEME.txt ---
  const leeme =
    `PrimeNotes — copia de la visita\n` +
    `==========================================\n\n` +
    `Cliente:   ${clienteInfo?.nombre ?? 'cliente'}\n` +
    `Visita:    ${fechaLarga(visita.fecha)}${visita.tipo_visita ? ` · ${frasesVisita}` : ''}\n` +
    `Generado:  ${fechaLarga(ahora)}, ${horaDe(ahora)}\n\n` +
    `Contenido de este archivo comprimido:\n\n` +
    `  informe.pdf   Informe completo de la visita: resumen, notas, hallazgos,\n` +
    `                oportunidades, próximos pasos y anexo fotográfico.\n\n` +
    `  fotos/        Todas las fotos en su resolución original, numeradas por\n` +
    `                orden de captura. Las del PDF son copias reducidas.\n\n` +
    `  audios/       Grabaciones de voz de la visita.\n\n` +
    `Notas:\n` +
    `  - Este material es de uso interno.\n` +
    `  - El informe refleja el estado de la visita el día indicado; los\n` +
    `    cambios registrados después no aparecen aquí.\n` +
    (visitaEnCurso ? `  - Esta visita seguía en curso cuando se generó esta copia.\n` : '') +
    (visita.resumen_origen === 'manual' ? `  - El resumen fue editado a mano por el comercial.\n` : '') +
    (fotosNoIncluidas.length
      ? `  - ${fotosNoIncluidas.length} foto(s) no se pudieron previsualizar en el PDF (formato no compatible); están igualmente en fotos/.\n`
      : '') +
    (fotosFallidas > 0
      ? `  - ${fotosFallidas} foto(s) no se pudieron recuperar (archivo perdido o borrado) y no están en este backup.\n`
      : '') +
    (audiosFallidos > 0
      ? `  - ${audiosFallidos} audio(s) no se pudieron recuperar (archivo perdido o borrado) y no están en este backup.\n`
      : '') +
    `\nGenerado automáticamente por PrimeNotes. No respondas a este\n` +
    `archivo; para dudas, contacta con tu responsable comercial.\n`;
  zip.file('LEEME.txt', leeme);

  const archivo =
    formato === 'pdf'
      ? { bytes: pdfBytes, extension: 'pdf', contentType: 'application/pdf' }
      : { bytes: await zip.generateAsync({ type: 'uint8array' }), extension: 'zip', contentType: 'application/zip' };

  // --- Subida al bucket de backups ---
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
  });
});

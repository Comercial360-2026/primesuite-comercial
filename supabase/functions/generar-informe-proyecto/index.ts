// supabase/functions/generar-informe-proyecto/index.ts
//
// Informe PDF de UN proyecto con su cronología de visitas cerradas.
// Hermano de generar-backup-visita: comparte marca, diccionarios y bloques
// de maqueta (_shared/informe-pdf.ts). Diferencias:
//   - salida: PDF suelto (no zip). No embebe fotos ni audios — solo cuenta
//     "N adjuntos" por visita; el material vive en el backup de cada visita.
//   - solo visitas CERRADAS (consolidada / cerrada). Las que siguen en curso
//     no tienen resumen ni cierre: se cuentan al pie, no se incluyen.
//   - tope de MAX_VISITAS: si el proyecto tiene más, van las más recientes.
//
// El PDF se sube al bucket privado "backups-visita" (reutilizado) bajo
// proyecto/<id>/<ts>.pdf y se devuelve una URL firmada de 1h. El job de
// limpieza del bucket lo borra igual que a los zip de visita.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import {
  PRIMION_LOGO,
  CORS_HEADERS,
  jsonResponse,
  COLOR,
  PRIORIDAD_ORDEN,
  TIPO_VISITA_FRASE,
  FRANJA_LABEL,
  crearNumeradorSecciones,
  filaKPIs,
  fechaLarga,
  fechaCorta,
  horaDe,
  nombreArchivoLegible,
  estadoVacio,
  tablaOportunidades,
  bloquesHallazgos,
  tablaPasos,
  areasDeFilaHallazgo,
  generarPdfBytes,
  type Nombrado,
  type OportunidadRow,
  type PasoRow,
  type HallazgoRow,
} from '../_shared/informe-pdf.ts';

const URL_FIRMADA_SEGUNDOS = 60 * 60;
// Tope de visitas por informe. Sin fotos/audios embebidos el PDF pesa poco
// aunque haya muchas, pero un proyecto con cientos de visitas puede acercarse
// al timeout de 45s del cliente. 25 cubre de sobra los proyectos reales; si
// hay más, se toman las más recientes y se avisa en la portada.
const MAX_VISITAS = 25;

// Etapas que cuentan una oportunidad como "cerrada". El resto = abierta.
const ETAPAS_CERRADAS = ['ganada', 'perdida', 'descartada'];

const ESTADO_PROYECTO_LABEL: Record<string, string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  terminado: 'Terminado',
};
const ESTADO_PROYECTO_COLOR: Record<string, string> = {
  activo: COLOR.success600,
  pausado: COLOR.warning600,
  terminado: COLOR.ink400,
};

interface VisitaRow {
  id: string;
  fecha: string;
  tipo_visita: string | null;
  objetivo: string | null;
  resumen_texto: string | null;
  estado_captura: string;
  franja: string | null;
  hora_definida: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405);
  }

  let proyectoId: string | undefined;
  try {
    proyectoId = (await req.json()).proyectoId;
  } catch {
    return jsonResponse({ error: 'Cuerpo de la petición inválido, se esperaba { proyectoId }' }, 400);
  }
  if (!proyectoId) {
    return jsonResponse({ error: 'Falta proyectoId' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'No autenticado' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const clienteUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await clienteUsuario.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Sesión no válida' }, 401);
  }
  const comercialId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // --- Proyecto + cliente ---
  const { data: proyectoData, error: errorProyecto } = await admin
    .from('proyecto')
    .select('id, nombre, estado, cliente:cliente_id(id, nombre, sector, ubicacion_general, tamano_aprox, responsable_id)')
    .eq('id', proyectoId)
    .single();
  if (errorProyecto || !proyectoData) {
    return jsonResponse({ error: 'El proyecto no existe.' }, 404);
  }
  // deno-lint-ignore no-explicit-any
  const proyecto = proyectoData as any as {
    id: string;
    nombre: string;
    estado: string;
    cliente: {
      id: string;
      nombre: string;
      sector: string | null;
      ubicacion_general: string | null;
      tamano_aprox: string | null;
      responsable_id: string | null;
    } | null;
  };
  const clienteInfo = proyecto.cliente;

  // --- Autorización: dirección comercial, responsable del cliente en cartera,
  // o participante de al menos una visita de este proyecto. ---
  const [{ data: comercial }, { data: participaEnAlguna }] = await Promise.all([
    admin.from('comercial').select('rol').eq('id', comercialId).single(),
    admin
      .from('visita_participante')
      .select('visita:visita_id!inner(proyecto_id)')
      .eq('comercial_id', comercialId)
      .eq('visita.proyecto_id', proyectoId)
      .limit(1),
  ]);
  const autorizado =
    comercial?.rol === 'direccion_comercial' ||
    clienteInfo?.responsable_id === comercialId ||
    (participaEnAlguna?.length ?? 0) > 0;
  if (!autorizado) {
    return jsonResponse({ error: 'No tienes permiso para generar el informe de este proyecto.' }, 403);
  }

  // --- Visitas cerradas del proyecto (las MAX_VISITAS más recientes) ---
  const [{ count: totalCerradas }, { count: enCurso }, { data: visitasData }] = await Promise.all([
    admin
      .from('visita')
      .select('id', { count: 'exact', head: true })
      .eq('proyecto_id', proyectoId)
      .in('estado_captura', ['consolidada', 'cerrada']),
    admin
      .from('visita')
      .select('id', { count: 'exact', head: true })
      .eq('proyecto_id', proyectoId)
      .eq('estado_captura', 'en_curso'),
    admin
      .from('visita')
      .select('id, fecha, tipo_visita, objetivo, resumen_texto, estado_captura, franja, hora_definida')
      .eq('proyecto_id', proyectoId)
      .in('estado_captura', ['consolidada', 'cerrada'])
      .order('fecha', { ascending: false })
      .limit(MAX_VISITAS),
  ]);

  // De más reciente a más antigua venían; el informe las lee en orden.
  const visitas = ((visitasData ?? []) as unknown as VisitaRow[]).slice().reverse();
  const visitaIds = visitas.map((v) => v.id);
  const visitasCerradas = totalCerradas ?? visitas.length;
  const visitasEnCurso = enCurso ?? 0;
  const hayRecorte = visitasCerradas > visitas.length;

  // --- Datos por visita (4+1 consultas para las <=25, agrupadas en memoria) ---
  // deno-lint-ignore no-explicit-any
  let opsData: any[] = [];
  // deno-lint-ignore no-explicit-any
  let hallData: any[] = [];
  // deno-lint-ignore no-explicit-any
  let pasosData: any[] = [];
  // deno-lint-ignore no-explicit-any
  let capturasData: any[] = [];
  // deno-lint-ignore no-explicit-any
  let responsablesData: any[] = [];
  if (visitaIds.length) {
    const [r1, r2, r3, r4, r5] = await Promise.all([
      admin
        .from('oportunidad')
        .select('id, titulo, descripcion, etapa, prioridad, valor_estimado, horizonte_decision, visita_origen_id')
        .in('visita_origen_id', visitaIds),
      admin
        .from('hallazgo')
        .select(
          'id, nota, creado_en, fecha_relevante, tipo_fecha_relevante, zona_texto, visita_id, ' +
            'ubicacion:ubicacion_id(nombre), ' +
            'hallazgo_area(categoria:categoria_id(nombre), termino:termino_id(nombre, parent:parent_id(nombre)))'
        )
        .in('visita_id', visitaIds)
        .order('creado_en', { ascending: true }),
      admin
        .from('proximo_paso')
        .select('id, descripcion, fecha_objetivo, estado, visita_id, comercial_responsable:comercial_responsable_id(nombre)')
        .in('visita_id', visitaIds)
        .order('fecha_objetivo', { ascending: true }),
      admin
        .from('captura_libre')
        .select('visita_id, tipo, titulo, contenido_texto, creado_en')
        .in('visita_id', visitaIds)
        .order('creado_en', { ascending: true }),
      admin
        .from('visita_participante')
        .select('visita_id, comercial:comercial_id(nombre)')
        .in('visita_id', visitaIds)
        .eq('rol', 'responsable'),
    ]);
    opsData = r1.data ?? [];
    hallData = r2.data ?? [];
    pasosData = r3.data ?? [];
    capturasData = r4.data ?? [];
    responsablesData = r5.data ?? [];
  }

  // deno-lint-ignore no-explicit-any
  function porVisita(filas: any[], clave: 'visita_id' | 'visita_origen_id') {
    // deno-lint-ignore no-explicit-any
    const m = new Map<string, any[]>();
    for (const f of filas) {
      const k = f[clave] as string | undefined;
      if (!k) continue;
      const lista = m.get(k);
      if (lista) lista.push(f);
      else m.set(k, [f]);
    }
    return m;
  }

  const opsPorVisita = porVisita(opsData, 'visita_origen_id');
  const hallPorVisita = porVisita(hallData, 'visita_id');
  const pasosPorVisita = porVisita(pasosData, 'visita_id');
  const capturasPorVisita = porVisita(capturasData, 'visita_id');
  const responsablePorVisita = new Map<string, string>();
  for (const r of responsablesData) {
    const nombre = (r.comercial as Nombrado | null)?.nombre;
    if (r.visita_id && nombre) responsablePorVisita.set(r.visita_id, nombre);
  }

  // --- Agregados del proyecto entero (no solo las <=25 del cuerpo) ---
  const [{ data: opsAbiertasData }, { count: opsGanadas }, { data: pasosPendientesData }] = await Promise.all([
    admin
      .from('oportunidad')
      .select('id, titulo, descripcion, etapa, prioridad, valor_estimado, horizonte_decision')
      .eq('proyecto_id', proyectoId)
      .not('etapa', 'in', `(${ETAPAS_CERRADAS.join(',')})`),
    admin
      .from('oportunidad')
      .select('id', { count: 'exact', head: true })
      .eq('proyecto_id', proyectoId)
      .eq('etapa', 'ganada'),
    admin
      .from('proximo_paso')
      .select('id, descripcion, fecha_objetivo, estado, comercial_responsable:comercial_responsable_id(nombre)')
      .eq('proyecto_id', proyectoId)
      .eq('estado', 'pendiente')
      .order('fecha_objetivo', { ascending: true }),
  ]);

  const opsAbiertas = ([...((opsAbiertasData ?? []) as unknown as OportunidadRow[])]).sort(
    (a, b) => (PRIORIDAD_ORDEN[a.prioridad] ?? 9) - (PRIORIDAD_ORDEN[b.prioridad] ?? 9)
  );
  const pasosPendientes = (pasosPendientesData ?? []) as unknown as PasoRow[];
  const valorAbierto = opsAbiertas.reduce((s, o) => s + (o.valor_estimado ?? 0), 0);

  // ---------------------------------------------------------------------
  // PDF
  // ---------------------------------------------------------------------

  const tituloSeccion = crearNumeradorSecciones();
  const ahora = new Date().toISOString();
  const metaCliente = [clienteInfo?.sector, clienteInfo?.ubicacion_general, clienteInfo?.tamano_aprox]
    .filter(Boolean)
    .join('   ·   ');

  const primera = visitas[0]?.fecha ?? null;
  const ultima = visitas[visitas.length - 1]?.fecha ?? null;
  const rangoFechas =
    primera && ultima && fechaCorta(primera) !== fechaCorta(ultima)
      ? `de ${fechaCorta(primera)} a ${fechaCorta(ultima)}`
      : primera
        ? fechaCorta(primera)
        : '';
  const lineaRango =
    visitasCerradas === 0
      ? 'Sin visitas cerradas todavía'
      : `${visitasCerradas} ${visitasCerradas === 1 ? 'visita cerrada' : 'visitas cerradas'} · ${rangoFechas}` +
        (hayRecorte ? ` (aquí, las ${visitas.length} últimas)` : '');

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
        { text: 'INFORME DE PROYECTO', fontSize: 10, bold: true, color: COLOR.ink400, characterSpacing: 1 },
        { text: clienteInfo?.nombre ?? 'Cliente', fontSize: 27, bold: true, color: COLOR.brand700, margin: [0, 4, 0, 4] },
        {
          columns: [
            { width: 'auto', text: 'Proyecto · ' + proyecto.nombre, fontSize: 12, bold: true, color: COLOR.brand600, margin: [0, 2, 8, 0] },
            {
              width: 'auto',
              ...chipEstado(proyecto.estado),
            },
          ],
        },
        metaCliente ? { text: metaCliente, fontSize: 10.5, color: COLOR.ink700, margin: [0, 8, 0, 0] } : null,
        { text: lineaRango, fontSize: 12, bold: true, margin: [0, 18, 0, 0] },
        visitasEnCurso > 0
          ? {
              margin: [0, 20, 0, 0],
              table: {
                widths: ['*'],
                body: [[{
                  text:
                    `${visitasEnCurso} ${visitasEnCurso === 1 ? 'visita sigue' : 'visitas siguen'} en curso y no ` +
                    'aparecen en este informe: una visita sin cerrar no tiene resumen ni cierre.',
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
        'Refleja el estado del proyecto en el momento de generarlo; los cambios posteriores no se recogen aquí.',
    },
  ];

  // deno-lint-ignore no-explicit-any
  function chipEstado(estado: string): any {
    const texto = (ESTADO_PROYECTO_LABEL[estado] ?? estado).toUpperCase();
    const color = ESTADO_PROYECTO_COLOR[estado] ?? COLOR.ink400;
    return { table: { body: [[{ text: texto, color: '#FFFFFF', fillColor: color, bold: true, fontSize: 7.5, margin: [5, 2, 5, 2] }]] }, layout: 'noBorders' };
  }

  // --- Cronología: un bloque por visita ---
  // deno-lint-ignore no-explicit-any
  const bloquesCronologia: any[] = [];
  if (!visitas.length) {
    bloquesCronologia.push(estadoVacio('Este proyecto todavía no tiene visitas cerradas.'));
  } else {
    visitas.forEach((v, i) => {
      const ops = ([...((opsPorVisita.get(v.id) ?? []) as unknown as OportunidadRow[])]).sort(
        (a, b) => (PRIORIDAD_ORDEN[a.prioridad] ?? 9) - (PRIORIDAD_ORDEN[b.prioridad] ?? 9)
      );
      // deno-lint-ignore no-explicit-any
      const hall: HallazgoRow[] = ((hallPorVisita.get(v.id) ?? []) as any[]).map((h) => ({
        id: h.id,
        nota: h.nota,
        creado_en: h.creado_en,
        fecha_relevante: h.fecha_relevante,
        tipo_fecha_relevante: h.tipo_fecha_relevante,
        zona_texto: h.zona_texto,
        ubicacion: h.ubicacion ?? null,
        areas: areasDeFilaHallazgo(h.hallazgo_area),
      }));
      const pasos = (pasosPorVisita.get(v.id) ?? []) as unknown as PasoRow[];
      const caps = (capturasPorVisita.get(v.id) ?? []) as {
        tipo: string;
        titulo: string | null;
        contenido_texto: string | null;
      }[];
      const nFotos = caps.filter((c) => c.tipo === 'foto').length;
      const nAudios = caps.filter((c) => c.tipo === 'audio').length;
      const notasVisita = caps.filter((c) => c.tipo === 'nota');

      let lineaHora = '';
      if (v.hora_definida) lineaHora = ` · ${horaDe(v.fecha)}`;
      else if (v.franja) lineaHora = ` · ${FRANJA_LABEL[v.franja] ?? v.franja}`;
      const frase = (v.tipo_visita && TIPO_VISITA_FRASE[v.tipo_visita]) || 'Visita';
      const responsable = responsablePorVisita.get(v.id);

      const adjuntos: string[] = [];
      if (nFotos) adjuntos.push(`${nFotos} foto${nFotos === 1 ? '' : 's'}`);
      if (nAudios) adjuntos.push(`${nAudios} audio${nAudios === 1 ? '' : 's'}`);

      // deno-lint-ignore no-explicit-any
      const bloque: any[] = [
        {
          margin: [0, i === 0 ? 0 : 22, 0, 8],
          stack: [
            {
              text: [
                { text: `Visita ${i + 1}`, bold: true, fontSize: 12.5, color: COLOR.brand700 },
                { text: `   ${frase} · ${fechaLarga(v.fecha)}${lineaHora}`, fontSize: 10, color: COLOR.ink700 },
              ],
            },
            responsable ? { text: `Responsable: ${responsable}`, fontSize: 8.5, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
            { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 499, y2: 4, lineWidth: 0.5, lineColor: COLOR.ink200 }] },
          ].filter(Boolean),
        },
      ];

      bloque.push(subtitulo('Resumen'));
      bloque.push(
        v.resumen_texto
          ? { text: v.resumen_texto, fontSize: 9.5, color: COLOR.ink900, lineHeight: 1.3 }
          : estadoVacio('Sin resumen registrado.')
      );
      if (v.objetivo) {
        bloque.push(subtitulo('Objetivo'));
        bloque.push({ text: v.objetivo, fontSize: 9.5, color: COLOR.ink700 });
      }
      // PM11 Fase 4 — mismo orden y palabras que la app: Notas · Hallazgos ·
      // Oportunidades · Próximos pasos.
      bloque.push(subtitulo(`Notas${notasVisita.length ? ` (${notasVisita.length})` : ''}`));
      if (notasVisita.length) {
        for (const n of notasVisita) {
          bloque.push({
            margin: [0, 0, 0, 5],
            text: [
              n.titulo?.trim() ? { text: `${n.titulo.trim()}. `, bold: true, fontSize: 9.5, color: COLOR.ink900 } : null,
              { text: n.contenido_texto?.trim() || '(nota sin texto)', fontSize: 9.5, color: COLOR.ink700 },
            ].filter(Boolean),
          });
        }
      } else {
        bloque.push(estadoVacio('Ninguna en esta visita.'));
      }
      bloque.push(subtitulo(`Hallazgos${hall.length ? ` (${hall.length})` : ''}`));
      bloque.push(...bloquesHallazgos(hall, 'Ninguno en esta visita.'));
      bloque.push(subtitulo(`Oportunidades${ops.length ? ` (${ops.length})` : ''}`));
      bloque.push(ops.length ? tablaOportunidades(ops) : estadoVacio('Ninguna en esta visita.'));
      bloque.push(subtitulo(`Próximos pasos${pasos.length ? ` (${pasos.length})` : ''}`));
      bloque.push(pasos.length ? tablaPasos(pasos) : estadoVacio('Ninguno en esta visita.'));
      bloque.push({
        text: adjuntos.length
          ? `Adjuntos: ${adjuntos.join(' · ')} — en el backup de esta visita.`
          : 'Sin adjuntos.',
        fontSize: 8.5,
        italics: true,
        color: COLOR.ink400,
        margin: [0, 8, 0, 0],
      });

      bloquesCronologia.push({ stack: bloque });
    });
  }

  // deno-lint-ignore no-explicit-any
  function subtitulo(texto: string): any {
    return { text: texto, bold: true, fontSize: 10, color: COLOR.ink700, margin: [0, 10, 0, 4] };
  }

  // --- Ensamblado ---
  // deno-lint-ignore no-explicit-any
  const contenido: any[] = [
    ...portada,
    tituloSeccion('Resumen del proyecto'),
    filaKPIs([
      { valor: String(visitasCerradas), etiqueta: visitasCerradas === 1 ? 'Visita cerrada' : 'Visitas cerradas' },
      { valor: String(opsAbiertas.length), etiqueta: 'Oportunidades abiertas' },
      { valor: String(opsGanadas ?? 0), etiqueta: 'Oportunidades ganadas' },
      { valor: String(pasosPendientes.length), etiqueta: 'Próximos pasos pendientes', alerta: pasosPendientes.length > 0 },
    ]),
    valorAbierto > 0
      ? { text: `Valor estimado en oportunidades abiertas: ${valorAbierto.toLocaleString('es-ES')} €`, fontSize: 10, color: COLOR.ink700, margin: [0, 0, 0, 4] }
      : null,
    tituloSeccion('Oportunidades abiertas', opsAbiertas.length ? `(${opsAbiertas.length})` : undefined),
    opsAbiertas.length ? tablaOportunidades(opsAbiertas) : estadoVacio('El proyecto no tiene oportunidades abiertas.'),
    tituloSeccion('Próximos pasos pendientes', pasosPendientes.length ? `(${pasosPendientes.length})` : undefined),
    pasosPendientes.length ? tablaPasos(pasosPendientes) : estadoVacio('El proyecto no tiene próximos pasos pendientes.'),
    tituloSeccion('Cronología de visitas', visitas.length ? `(${visitas.length}${hayRecorte ? ` de ${visitasCerradas}` : ''})` : undefined),
    ...bloquesCronologia,
  ].filter(Boolean);

  const docDefinition = {
    info: {
      title: `Informe de proyecto — ${clienteInfo?.nombre ?? 'cliente'} — ${proyecto.nombre}`,
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
                  { text: `  ·  ${proyecto.nombre}` },
                ],
                fontSize: 8.5,
                color: COLOR.ink400,
              },
              { text: 'Informe de proyecto', alignment: 'right', fontSize: 8.5, color: COLOR.ink400 },
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
    console.error('Fallo generando el PDF del informe de proyecto', e);
    return jsonResponse({ error: 'No se pudo maquetar el informe del proyecto.' }, 500);
  }

  const timestamp = Date.now();
  const rutaPdf = `proyecto/${proyectoId}/${timestamp}.pdf`;
  const { error: errorSubida } = await admin.storage
    .from('backups-visita')
    .upload(rutaPdf, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (errorSubida) {
    return jsonResponse({ error: `No se pudo guardar el informe: ${errorSubida.message}` }, 500);
  }

  const nombreDescarga = `proyecto-${nombreArchivoLegible(clienteInfo?.nombre, proyectoId)}-${nombreArchivoLegible(proyecto.nombre, 'informe')}.pdf`;
  const { data: firmada, error: errorFirma } = await admin.storage
    .from('backups-visita')
    .createSignedUrl(rutaPdf, URL_FIRMADA_SEGUNDOS, { download: nombreDescarga });
  if (errorFirma || !firmada) {
    return jsonResponse({ error: 'Informe generado pero no se pudo crear el enlace de descarga.' }, 500);
  }

  return jsonResponse({
    url: firmada.signedUrl,
    expiraEnSegundos: URL_FIRMADA_SEGUNDOS,
    tamanoBytes: pdfBytes.byteLength,
  });
});

// supabase/functions/generar-backup-visita/index.ts
//
// Fase B del sistema de espacio/backup (Dirección Comercial, agosto 2026).
// Genera bajo demanda un zip con: informe.pdf (texto + fotos comprimidas
// embebidas) + fotos originales + audios sueltos, y lo sube al bucket
// privado "backups-visita". Devuelve una URL firmada de corta duración —
// el propio zip se borra solo a las ~2h (ver 56_bucket_backups_visita.sql,
// job "limpiar-backups-visita"), así que un backup nunca ocupa cuota para
// siempre.
//
// Nunca se genera automáticamente al cerrar una visita — solo cuando el
// comercial lo pide explícitamente desde "mi espacio", antes de decidir si
// borra la visita o no.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import JSZip from 'https://esm.sh/jszip@3.10.1';

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

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const { data: visita, error: errorVisita } = await admin
    .from('visita')
    .select('id, fecha, tipo_visita, estado_captura, resumen_texto, cliente:cliente_id(id, nombre)')
    .eq('id', visitaId)
    .single();
  if (errorVisita || !visita) {
    return jsonResponse({ error: 'La visita no existe.' }, 404);
  }
  const clienteInfo = visita.cliente as unknown as { id: string; nombre: string } | null;

  const [{ data: capturas }, { data: hallazgos }, { data: oportunidades }, { data: proximosPasos }] =
    await Promise.all([
      admin
        .from('captura_libre')
        .select('id, tipo, titulo, contenido_texto, storage_path, creado_en')
        .eq('visita_id', visitaId)
        .order('creado_en', { ascending: true }),
      admin
        .from('hallazgo')
        .select('id, nota, naturaleza, creado_en, termino:termino_id(nombre)')
        .eq('visita_id', visitaId)
        .order('creado_en', { ascending: true }),
      admin
        .from('oportunidad')
        .select('id, titulo, descripcion, etapa, prioridad, valor_estimado')
        .eq('visita_origen_id', visitaId),
      admin
        .from('proximo_paso')
        .select('id, descripcion, fecha_objetivo, estado')
        .eq('visita_id', visitaId)
        .order('fecha_objetivo', { ascending: true }),
    ]);

  const fotos = (capturas ?? []).filter((c) => c.tipo === 'foto');
  const audios = (capturas ?? []).filter((c) => c.tipo === 'audio');
  const notas = (capturas ?? []).filter((c) => c.tipo === 'nota');

  // --- Construcción del PDF ---
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ANCHO = 595;
  const ALTO = 842;
  const MARGEN = 50;
  let pagina = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - MARGEN;

  function nuevaPaginaSiHaceFalta(alturaNecesaria: number) {
    if (y - alturaNecesaria < MARGEN) {
      pagina = pdf.addPage([ANCHO, ALTO]);
      y = ALTO - MARGEN;
    }
  }

  function escribirTitulo(texto: string) {
    nuevaPaginaSiHaceFalta(30);
    pagina.drawText(texto, { x: MARGEN, y, size: 16, font: fuenteNegrita, color: rgb(0.1, 0.1, 0.15) });
    y -= 26;
  }

  function escribirSubtitulo(texto: string) {
    nuevaPaginaSiHaceFalta(22);
    pagina.drawText(texto, { x: MARGEN, y, size: 12, font: fuenteNegrita, color: rgb(0.15, 0.15, 0.2) });
    y -= 18;
  }

  // Envuelve texto largo a un ancho fijo, línea a línea.
  function escribirParrafo(texto: string, tamano = 10) {
    const anchoMax = ANCHO - MARGEN * 2;
    const palabras = texto.split(/\s+/);
    let linea = '';
    for (const palabra of palabras) {
      const pruebaLinea = linea ? `${linea} ${palabra}` : palabra;
      const anchoTexto = fuente.widthOfTextAtSize(pruebaLinea, tamano);
      if (anchoTexto > anchoMax && linea) {
        nuevaPaginaSiHaceFalta(16);
        pagina.drawText(linea, { x: MARGEN, y, size: tamano, font: fuente, color: rgb(0.2, 0.2, 0.2) });
        y -= 14;
        linea = palabra;
      } else {
        linea = pruebaLinea;
      }
    }
    if (linea) {
      nuevaPaginaSiHaceFalta(16);
      pagina.drawText(linea, { x: MARGEN, y, size: tamano, font: fuente, color: rgb(0.2, 0.2, 0.2) });
      y -= 14;
    }
    y -= 4;
  }

  escribirTitulo(`Visita — ${clienteInfo?.nombre ?? 'cliente'}`);
  escribirParrafo(`${formatearFecha(visita.fecha)}${visita.tipo_visita ? ` · ${visita.tipo_visita}` : ''}`);
  y -= 6;

  if (visita.resumen_texto) {
    escribirSubtitulo('Resumen');
    escribirParrafo(visita.resumen_texto);
  }

  if (notas.length) {
    escribirSubtitulo(`Notas (${notas.length})`);
    for (const n of notas) {
      escribirParrafo(`• ${n.titulo ? `${n.titulo}: ` : ''}${n.contenido_texto ?? ''}`);
    }
  }

  if (hallazgos?.length) {
    escribirSubtitulo(`Hallazgos (${hallazgos.length})`);
    for (const h of hallazgos) {
      const terminoNombre = (h.termino as unknown as { nombre: string } | null)?.nombre ?? '';
      escribirParrafo(`• [${h.naturaleza}] ${terminoNombre}${h.nota ? ` — ${h.nota}` : ''}`);
    }
  }

  if (oportunidades?.length) {
    escribirSubtitulo(`Oportunidades originadas (${oportunidades.length})`);
    for (const o of oportunidades) {
      escribirParrafo(
        `• ${o.titulo} — ${o.etapa} · prioridad ${o.prioridad}${o.valor_estimado ? ` · ${o.valor_estimado}€` : ''}`
      );
      if (o.descripcion) escribirParrafo(o.descripcion, 9);
    }
  }

  if (proximosPasos?.length) {
    escribirSubtitulo(`Próximos pasos (${proximosPasos.length})`);
    for (const p of proximosPasos) {
      const fecha = p.fecha_objetivo ? ` — objetivo ${formatearFecha(p.fecha_objetivo)}` : '';
      escribirParrafo(`• ${p.descripcion}${fecha} [${p.estado}]`);
    }
  }

  // --- Descarga de binarios y montaje del zip ---
  const zip = new JSZip();

  if (fotos.length) {
    escribirSubtitulo(`Fotos (${fotos.length})`);
    escribirParrafo('Las fotos en resolución original van adjuntas en la carpeta "fotos" de este zip.', 9);
  }
  if (audios.length) {
    escribirSubtitulo(`Audios (${audios.length})`);
    escribirParrafo('Los audios van adjuntos en la carpeta "audios" de este zip.', 9);
    for (const a of audios) {
      escribirParrafo(`• ${a.titulo ?? 'audio sin título'} — ${formatearFecha(a.creado_en)}`, 9);
    }
  }

  const carpetaFotos = zip.folder('fotos')!;
  const carpetaAudios = zip.folder('audios')!;

  async function descargarYAdjuntar(
    bucket: 'fotos-visita' | 'audios-visita',
    storagePath: string,
    carpeta: ReturnType<typeof zip.folder>,
    nombreArchivo: string
  ) {
    const { data, error } = await admin.storage.from(bucket).download(storagePath);
    if (error || !data) return; // fichero huérfano o ya borrado — se omite, no se aborta el backup entero.
    const bytes = new Uint8Array(await data.arrayBuffer());
    carpeta!.file(nombreArchivo, bytes);
    return bytes;
  }

  for (const f of fotos) {
    if (!f.storage_path) continue;
    const bytes = await descargarYAdjuntar('fotos-visita', f.storage_path, carpetaFotos, `${f.id}.jpg`);
    // Embebe también una copia pequeña en el propio PDF para que se pueda
    // hojear sin descomprimir el zip.
    if (bytes) {
      try {
        const imagen = await pdf.embedJpg(bytes);
        const escala = Math.min(1, (ANCHO - MARGEN * 2) / imagen.width, 260 / imagen.height);
        const w = imagen.width * escala;
        const h = imagen.height * escala;
        nuevaPaginaSiHaceFalta(h + 20);
        pagina.drawImage(imagen, { x: MARGEN, y: y - h, width: w, height: h });
        y -= h + 8;
        if (f.titulo) {
          escribirParrafo(f.titulo, 9);
        }
      } catch {
        // Formato no soportado por pdf-lib (no-JPEG) — la foto sigue en el zip igualmente.
      }
    }
  }

  for (const a of audios) {
    if (!a.storage_path) continue;
    await descargarYAdjuntar('audios-visita', a.storage_path, carpetaAudios, `${a.id}.m4a`);
  }

  const pdfBytes = await pdf.save();
  zip.file('informe.pdf', pdfBytes);

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

  const { data: firmada, error: errorFirma } = await admin.storage
    .from('backups-visita')
    .createSignedUrl(rutaZip, URL_FIRMADA_SEGUNDOS, { download: `visita-${clienteInfo?.nombre ?? visitaId}.zip` });
  if (errorFirma || !firmada) {
    return jsonResponse({ error: 'Backup generado pero no se pudo crear el enlace de descarga.' }, 500);
  }

  return jsonResponse({
    url: firmada.signedUrl,
    expiraEnSegundos: URL_FIRMADA_SEGUNDOS,
    tamanoBytes: zipBytes.byteLength,
  });
});

// supabase/functions/procesar-briefings/rapido.ts
//
// Briefing rápido (docs/briefing-rapido-plan.md). En vez de un único agente que lee y
// redacta (motor GitHub Copilot, ~300 s), el worker lanza EN PARALELO varias conversaciones
// de Direct Line contra el agente estándar «Consultas comerciales CB» (una por fuente:
// oportunidades, ofertas, Licitaciones, Jira) y, cuando todas han terminado o vencido su
// plazo, UNA conversación de redacción con las instrucciones y los datos dentro del mensaje.
// Cuenta y contactos salen de Supabase (crm_cuenta / crm_contacto), sin agente.
// Una fuente que no llega a tiempo no bloquea: el briefing sale sin ella y lo dice.
// Estado en briefing_tarea (migración 155). Interruptor: ajustes_app.briefing_rapido_activo.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PROMPT_REDACTOR } from './prompt-redactor.ts';

const DIRECT_LINE = 'https://europe.directline.botframework.com/v3/directline';
const USUARIO = 'primesuite';
const MAX_BRIEFINGS_EN_MARCHA = 2;
const MAX_CARACTERES_FUENTE = 12_000;
const MIN_CARACTERES_PARTE = 800;
const PLAZO_REDACCION_S = 240;
// Lecturas que casi no cambian: se reutilizan por cuenta durante este tiempo (migración 156).
const CACHEABLES = ['licitaciones'];
const CACHE_HORAS = 24;
const FIN_REDACCION = 'FIN-REDACCION';

// Una sola redacción: con el Redactor (modelo rápido) tarda ~10-20 s y así ningún dato se repite
// entre secciones (con 3 redactores en paralelo cada uno contaba lo mismo).
const PARTES: { fuente: string; secciones: string; fecha: boolean }[] = [{ fuente: 'redaccion_a', fecha: true, secciones: '' }];

function instruccionParte(_p: { secciones: string; fecha: boolean }): string {
  return `\n\nTermina con una última línea que diga exactamente: ${FIN_REDACCION}`;
}

type Cliente = { id: string; nombre: string; crm_accountid: string };
type Tarea = {
  id: string;
  visita_id: string;
  fase: 'lectura' | 'redaccion';
  fuente: string;
  estado: string;
  mensaje: string | null;
  resultado: string | null;
  error: string | null;
  conversacion_id: string | null;
  watermark: string | null;
  plazo_segundos: number;
  iniciado_en: string | null;
  creado_en: string;
};

const FORMATO = 'Devuelve SOLO las filas, una por línea y con los campos separados por " | ", sin comentarios, sin resumen y sin explicar cómo has buscado. Si no hay filas, responde exactamente: SIN REGISTROS. Termina SIEMPRE con una última línea que diga exactamente: FIN-LECTURA';

const LECTURAS: { fuente: string; plazo: number; pregunta: (id: string) => string }[] = [
  {
    fuente: 'crm_oportunidades',
    plazo: 150,
    pregunta: (id) =>
      `Consulta SOLO la tabla Oportunidades del CRM (filtro customerid_value eq '${id}', más recientes primero). Devuelve como máximo las 30 más recientes. Campos por fila: opportunityid | name | modifiedon | estado | tipo | fase | probabilidad_texto | estimatedclosedate | actualclosedate | estimatedvalue | propietario. ${FORMATO}`,
  },
  {
    fuente: 'crm_ofertas',
    plazo: 150,
    pregunta: (id) =>
      `Consulta SOLO la tabla Ofertas del CRM (filtro customerid_value eq '${id}', más recientes primero). Devuelve como máximo las 25 más recientes. Campos por fila: quotenumber | pri_reference | opportunityid_value | tipo_oferta | pri_quotedate | effectiveto | totalamount | estado | name. ${FORMATO}`,
  },
  {
    fuente: 'licitaciones',
    plazo: 150,
    pregunta: () =>
      `Busca en Licitaciones y pedidos las carpetas que correspondan a este cliente (comprueba las 5 categorías del mapa; no abras ni leas documentos). Campos por fila: ruta de la carpeta | última modificación. ${FORMATO}`,
  },
  {
    fuente: 'jira',
    plazo: 150,
    pregunta: () =>
      `Busca en Jira las incidencias de los últimos 90 días de este cliente (JQL acotado). Campos por fila: clave | estado | fecha | resumen en una línea. ${FORMATO}`,
  },
];

const TITULO: Record<string, string> = {
  crm_oportunidades: 'OPORTUNIDADES (CRM)',
  crm_ofertas: 'OFERTAS (CRM)',
  licitaciones: 'LICITACIONES Y PEDIDOS (carpetas)',
  jira: 'JIRA (últimos 90 días)',
};

export async function briefingRapidoActivo(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from('ajustes_app').select('valor').eq('clave', 'briefing_rapido_activo').maybeSingle();
  return data?.valor === true;
}

function cabecerasDL(secreto: string) {
  return { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' };
}

/** Abre una conversación y manda el mensaje. null = Direct Line frena (429): reintentar luego. */
async function abrirConversacion(cab: Record<string, string>, texto: string): Promise<string | null> {
  const rc = await fetch(`${DIRECT_LINE}/conversations`, { method: 'POST', headers: cab });
  if (rc.status === 429) {
    await rc.body?.cancel();
    return null;
  }
  if (!rc.ok) throw new Error(`abrir conversación (${rc.status})`);
  const { conversationId } = await rc.json();
  const ra = await fetch(`${DIRECT_LINE}/conversations/${conversationId}/activities`, {
    method: 'POST',
    headers: cab,
    body: JSON.stringify({ type: 'message', from: { id: USUARIO }, locale: 'es-ES', text: texto }),
  });
  if (!ra.ok) throw new Error(`enviar mensaje (${ra.status})`);
  await ra.body?.cancel();
  return conversationId;
}

async function iniciarTarea(admin: SupabaseClient, cab: Record<string, string>, t: Tarea) {
  // Marca antes de llamar: si dos pasadas coinciden, la segunda no la coge.
  const { data: tomada } = await admin
    .from('briefing_tarea')
    .update({ estado: 'generando', iniciado_en: new Date().toISOString() })
    .eq('id', t.id)
    .eq('estado', 'pendiente')
    .select('id');
  if (!tomada?.length) return;
  try {
    const conv = await abrirConversacion(cab, t.mensaje ?? '');
    if (conv === null) {
      await admin.from('briefing_tarea').update({ estado: 'pendiente', iniciado_en: null }).eq('id', t.id);
      return;
    }
    await admin.from('briefing_tarea').update({ conversacion_id: conv, watermark: null }).eq('id', t.id);
  } catch (e) {
    await admin
      .from('briefing_tarea')
      .update({ estado: 'error', error: (e as Error).message, terminado_en: new Date().toISOString() })
      .eq('id', t.id);
  }
}

function limpiarLectura(texto: string): string {
  return texto
    .split('\n')
    .filter((l) => !/^\s*\**\s*Fuente\s*:/i.test(l))
    .join('\n')
    .trim()
    .slice(0, MAX_CARACTERES_FUENTE);
}

const SEP = '\n\u0001\n';
const FIN = 'FIN-LECTURA';

async function recogerTarea(admin: SupabaseClient, cab: Record<string, string>, t: Tarea) {
  const cerrar = (cambio: Record<string, unknown>) =>
    admin
      .from('briefing_tarea')
      .update({ ...cambio, conversacion_id: null, watermark: null, terminado_en: new Date().toISOString() })
      .eq('id', t.id)
      .eq('estado', 'generando');

  const desde = t.iniciado_en ? new Date(t.iniciado_en).getTime() : Date.now();
  const vencida = Date.now() - desde > t.plazo_segundos * 1000;

  const r = await fetch(
    `${DIRECT_LINE}/conversations/${t.conversacion_id}/activities${t.watermark ? `?watermark=${t.watermark}` : ''}`,
    { headers: cab }
  );
  if (!r.ok) {
    await r.body?.cancel();
    if (r.status === 429 && !vencida) return;
    await cerrar({ estado: vencida ? 'vencida' : 'error', error: `leer respuesta (${r.status})` });
    return;
  }
  const { activities = [], watermark } = await r.json();
  const delBot = activities.filter((a: { from?: { id?: string } }) => a.from?.id !== USUARIO);
  const nuevos: string[] = delBot
    .filter((a: { type: string }) => a.type === 'message')
    .map((a: { text?: string }) => (a.text ?? '').trim())
    .filter((x: string) => x && !/^Hola, soy /i.test(x));
  // Sondeo con watermark = solo lo nuevo: se acumula en resultado mientras la tarea está en marcha.
  const textos = [...(t.resultado ? t.resultado.split(SEP) : []), ...nuevos];
  const turnoCerrado = delBot.some((a: { type: string; name?: string }) => a.type === 'event' && a.name === 'turn.complete');
  const masLargo = () => textos.reduce((m, x) => (x.length > m.length ? x : m), '');
  // Error del propio agente (p. ej. IntegratedAuthenticationNotSupportedInChannel): fallar YA, sin esperar al plazo.
  const errorAgente = textos.find((x) => /Código de error:|Lo sentimos, se ha producido un error/i.test(x));
  if (errorAgente) {
    await cerrar({ estado: 'error', error: errorAgente.slice(0, 300) });
    return;
  }

  if (t.fase === 'lectura') {
    const marcado = textos.some((x) => x.includes(FIN)) || textos.some((x) => /(^|\n)\s*\**Fuente/i.test(x));
    if (marcado || (turnoCerrado && textos.length)) {
      const dato = masLargo();
      if (/^Mensaje de error:/i.test(dato)) await cerrar({ estado: 'error', error: dato.slice(0, 300) });
      else await cerrar({ estado: 'listo', resultado: limpiarLectura(dato.replaceAll(FIN, '')) });
      return;
    }
    if (turnoCerrado) {
      await cerrar({ estado: 'error', error: 'El agente cerró el turno sin respuesta' });
      return;
    }
  } else {
    const final = textos.find((x) => x.startsWith('{') || x.includes(FIN_REDACCION) || x.length >= MIN_CARACTERES_PARTE);
    if (final) {
      await cerrar(final.startsWith('{') ? { estado: 'error', error: 'Respuesta inesperada del agente.' } : { estado: 'listo', resultado: final });
      return;
    }
    if (turnoCerrado) {
      const dicho = masLargo();
      await cerrar(
        dicho.length >= 300
          ? { estado: 'listo', resultado: dicho }
          : { estado: 'error', error: dicho ? `El agente respondió: «${dicho.slice(0, 300)}»` : 'El agente terminó sin devolver el briefing.' }
      );
      return;
    }
  }
  if (vencida) {
    await cerrar({
      estado: t.fase === 'lectura' ? 'vencida' : 'error',
      error: `sin respuesta en ${t.plazo_segundos} s (mensajes ${textos.length}, turno cerrado ${turnoCerrado}, largo ${masLargo().length})`,
    });
    return;
  }
  const cambio: Record<string, unknown> = {};
  if (watermark) cambio.watermark = watermark;
  if (nuevos.length) cambio.resultado = textos.join(SEP);
  if (Object.keys(cambio).length) await admin.from('briefing_tarea').update(cambio).eq('id', t.id);
}

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return 'fecha desconocida';
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

async function datosCuenta(admin: SupabaseClient, accountid: string): Promise<string> {
  const { data: c } = await admin
    .from('crm_cuenta')
    .select('nombre, ciudad, cuenta_matriz, activa, sincronizado_en')
    .eq('accountid', accountid)
    .maybeSingle();
  const { data: contactos } = await admin
    .from('crm_contacto')
    .select('nombre, cargo, email, telefono, movil, modificado_crm')
    .eq('accountid', accountid)
    .eq('activo', true)
    .order('modificado_crm', { ascending: false })
    .limit(40);
  const cuenta = c
    ? `${c.nombre} | ${c.activa === false ? 'INACTIVA' : 'Activa'} | ${c.ciudad ?? 'sin ciudad'} | cuenta matriz: ${c.cuenta_matriz ?? 'ninguna'}`
    : 'cuenta no encontrada en la copia del CRM';
  const filas = (contactos ?? []).map((x) =>
    [x.nombre, x.cargo || 'sin cargo', x.email || 'sin email', x.telefono || x.movil || 'sin teléfono'].join(' | ')
  );
  return `Datos del CRM al ${fechaCorta(c?.sincronizado_en)}\n== CUENTA ==\n${cuenta}\n== CONTACTOS (${filas.length}) ==\n${filas.length ? filas.join('\n') : 'SIN REGISTROS'}`;
}

function bloque(t: Tarea | undefined, titulo: string): string {
  if (!t || t.estado !== 'listo' || !t.resultado) return `== ${titulo} ==\nNO DISPONIBLE (la fuente no respondió a tiempo)`;
  if (/^\s*SIN REGISTROS\.?\s*$/i.test(t.resultado)) return `== ${titulo} ==\nSIN REGISTROS`;
  return `== ${titulo} ==\n${t.resultado}`;
}


const recorta = (t: string | null | undefined, n: number) => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Lo que ya consta en PrimeSuite del cliente (visitas, pendientes, interlocutores): SQL, 0 s. */
async function datosPrimeSuite(admin: SupabaseClient, clienteId: string): Promise<string> {
  const [visitas, pasos, opps, inter] = await Promise.all([
    admin
      .from('visita')
      .select('fecha, tipo_visita, objetivo, resumen_texto, resumen')
      .eq('cliente_id', clienteId)
      .in('estado_captura', ['consolidada', 'cerrada'])
      .order('fecha', { ascending: false })
      .limit(3),
    admin
      .from('proximo_paso')
      .select('descripcion, fecha_objetivo, visita:visita_id!inner(cliente_id)')
      .eq('estado', 'pendiente')
      .eq('visita.cliente_id', clienteId)
      .order('fecha_objetivo', { ascending: true, nullsFirst: false })
      .limit(8),
    admin
      .from('oportunidad')
      .select('titulo, etapa, valor_estimado, horizonte_decision')
      .eq('cliente_id', clienteId)
      .is('motivo_cierre', null)
      .order('actualizado_en', { ascending: false })
      .limit(6),
    admin.from('interlocutor').select('nombre, cargo, tipo_influencia, relevancia, email, telefono').eq('cliente_id', clienteId).eq('activo', true).limit(10),
  ]);
  const lin = (xs: (string | null | undefined)[]) => xs.map((x) => (x && String(x).trim() ? String(x).trim() : 'sin dato')).join(' | ');
  const bloques = [
    ['ÚLTIMAS VISITAS (PrimeSuite)', (visitas.data ?? []).map((v) => lin([fechaCorta(v.fecha), v.tipo_visita, recorta(v.objetivo, 120), recorta(v.resumen_texto || v.resumen, 500)]))],
    ['PRÓXIMOS PASOS PENDIENTES (PrimeSuite)', (pasos.data ?? []).map((p) => lin([recorta(p.descripcion, 160), p.fecha_objetivo ? fechaCorta(p.fecha_objetivo) : 'sin fecha']))],
    ['OPORTUNIDADES EN SEGUIMIENTO (PrimeSuite)', (opps.data ?? []).map((o) => lin([recorta(o.titulo, 100), o.etapa, o.valor_estimado != null ? `${o.valor_estimado}` : null, o.horizonte_decision]))],
    ['INTERLOCUTORES CONOCIDOS (PrimeSuite)', (inter.data ?? []).map((x) => lin([x.nombre, x.cargo, x.tipo_influencia, recorta(x.relevancia, 80), x.email, x.telefono]))],
  ] as [string, string[]][];
  return bloques.map(([t, filas]) => `== ${t} ==\n${filas.length ? filas.join('\n') : 'SIN REGISTROS'}`).join('\n');
}

async function avanzarBriefing(admin: SupabaseClient, cab: Record<string, string>, visitaId: string, cliente: Cliente) {
  // cab = cabeceras del agente que REDACTA (Redactor; si no hay secreto, el de Consultas)
  const { data: tareas } = await admin.from('briefing_tarea').select('*').eq('visita_id', visitaId);
  const todas = (tareas ?? []) as Tarea[];
  const lecturas = todas.filter((t) => t.fase === 'lectura');
  const redacciones = todas.filter((t) => t.fase === 'redaccion');
  const fallo = (error: string) =>
    admin
      .from('briefing_visita')
      .update({ estado: 'error', error, terminado_en: new Date().toISOString(), conversacion_id: null, watermark: null })
      .eq('visita_id', visitaId)
      .eq('estado', 'generando');

  if (redacciones.length) {
    if (redacciones.some((t) => t.estado === 'pendiente' || t.estado === 'generando')) return;
    const parte = (f: string) => redacciones.find((t) => t.fuente === f);
    const a = parte('redaccion_a');
    if (a?.estado !== 'listo' || !a.resultado) {
      await fallo(a?.error ? `Redacción: ${a.error}` : 'No se pudo redactar el briefing.');
      return;
    }
    const limpio = (t?: Tarea) => (t?.estado === 'listo' && t.resultado ? t.resultado.replaceAll(FIN_REDACCION, '').trim() : null);
    const partes = PARTES.map((p) => limpio(parte(p.fuente)));
    const limpiarMarcas = (x: string) =>
      x
        .replaceAll(/SIN REGISTROS\.?/g, 'ninguno')
        .replaceAll(/NO DISPONIBLE/g, 'no disponible')
        .replaceAll(/(,\d{2})\d+(?= ?€)/g, '$1'); // importes con más de 2 decimales (1.837,9900 €)
    const contenido = limpiarMarcas([
      ...partes.filter((x): x is string => !!x),
      ...(partes.some((x) => !x) ? ['_Una parte del briefing no se pudo redactar a tiempo. Vuelve a generarlo para completarla._'] : []),
    ].join('\n\n'));
    await admin
      .from('briefing_visita')
      .update({ estado: 'listo', contenido, error: null, terminado_en: new Date().toISOString(), conversacion_id: null, watermark: null })
      .eq('visita_id', visitaId)
      .eq('estado', 'generando');
    return;
  }

  if (!lecturas.length || lecturas.some((t) => t.estado === 'pendiente' || t.estado === 'generando')) return;

  // Guarda en caché las lecturas cacheables recién hechas (las servidas desde caché tienen mensaje null).
  for (const t of lecturas) {
    if (CACHEABLES.includes(t.fuente) && t.estado === 'listo' && t.mensaje && t.resultado) {
      await admin
        .from('briefing_cache_fuente')
        .upsert({ cuenta_id: cliente.crm_accountid, fuente: t.fuente, resultado: t.resultado, actualizado_en: new Date().toISOString() });
    }
  }

  const crmOk = ['crm_oportunidades', 'crm_ofertas'].some((f) => lecturas.find((t) => t.fuente === f)?.estado === 'listo');
  if (!crmOk) {
    await fallo('El agente no ha podido leer los datos del CRM. Vuelve a intentarlo más tarde.');
    return;
  }

  const por = (f: string) => lecturas.find((t) => t.fuente === f);
  const datos = [
    `Cliente: ${cliente.nombre}`,
    await datosCuenta(admin, cliente.crm_accountid),
    await datosPrimeSuite(admin, cliente.id),
    ...LECTURAS.map((l) => bloque(por(l.fuente), TITULO[l.fuente])),
  ].join('\n');
  const base = `${PROMPT_REDACTOR}`;
  // Si otra pasada del worker ya las creó (índice único visita+fuente), no inserta nada y no relanza.
  const { data: nuevas } = await admin
    .from('briefing_tarea')
    .upsert(
      PARTES.map((p) => ({
        visita_id: visitaId,
        fase: 'redaccion',
        fuente: p.fuente,
        mensaje: `${base}${instruccionParte(p)}\n\n=== DATOS ===\n${datos}`,
        plazo_segundos: PLAZO_REDACCION_S,
      })),
      { onConflict: 'visita_id,fuente', ignoreDuplicates: true }
    )
    .select('*');
  await Promise.all(((nuevas ?? []) as Tarea[]).map((t) => iniciarTarea(admin, cab, t)));
}

export async function pasoRapido(admin: SupabaseClient, secreto: string, secretoRedactor?: string | null) {
  const cab = cabecerasDL(secreto); // lecturas: agente de Consultas
  const cabRedaccion = secretoRedactor ? cabecerasDL(secretoRedactor) : cab; // redacción: Redactor Briefing CB (modelo General rápido)
  const cabDe = (t: Tarea) => (t.fase === 'redaccion' ? cabRedaccion : cab);

  // 1. Arrancar briefings pendientes (respetando huecos y tope diario).
  const { count: enMarcha } = await admin
    .from('briefing_visita')
    .select('visita_id', { count: 'exact', head: true })
    .eq('estado', 'generando');
  let hueco = MAX_BRIEFINGS_EN_MARCHA - (enMarcha ?? 0);
  const { data: tope } = await admin.from('ajustes_app').select('valor, valor_numero').eq('clave', 'briefing_tope_diario').maybeSingle();
  if (tope?.valor && tope.valor_numero != null) {
    const { data: hoy } = await admin.rpc('fn_briefings_enviados_hoy');
    hueco = Math.min(hueco, tope.valor_numero - Number(hoy ?? 0));
  }
  if (hueco > 0) {
    const { data: pendientes, error: ePend } = await admin
      .from('briefing_visita')
      .select('visita_id, motivo, visita:visita!briefing_visita_visita_id_fkey(cliente:cliente_id(id, nombre, crm_accountid))')
      .eq('estado', 'pendiente')
      .order('pedido_en')
      .limit(hueco);
    if (ePend) throw new Error(`pendientes: ${ePend.message}`);
    for (const p of pendientes ?? []) {
      const cliente = (p as unknown as { visita: { cliente: Cliente | null } }).visita?.cliente;
      if (!cliente?.crm_accountid) {
        await admin.from('briefing_visita').update({ estado: 'sin_cuenta' }).eq('visita_id', p.visita_id);
        continue;
      }
      const { data: tomada, error: eTom } = await admin
        .from('briefing_visita')
        .update({ estado: 'generando', iniciado_en: new Date().toISOString(), conversacion_id: null, watermark: null, error: null })
        .eq('visita_id', p.visita_id)
        .eq('estado', 'pendiente')
        .select('visita_id');
      if (eTom) throw new Error(`tomar: ${eTom.message}`);
      if (!tomada?.length) continue;
      await admin.from('briefing_tarea').delete().eq('visita_id', p.visita_id);
      await admin.from('briefing_uso').insert({ visita_id: p.visita_id, motivo: p.motivo });
      const { data: enCache } = await admin
        .from('briefing_cache_fuente')
        .select('fuente, resultado')
        .eq('cuenta_id', cliente.crm_accountid)
        .in('fuente', CACHEABLES)
        .gte('actualizado_en', new Date(Date.now() - CACHE_HORAS * 3_600_000).toISOString());
      const cacheada = new Map((enCache ?? []).map((c) => [c.fuente as string, c.resultado as string]));
      const ahora = new Date().toISOString();
      const { error: eIns } = await admin.from('briefing_tarea').insert(
        LECTURAS.map((l) =>
          cacheada.has(l.fuente)
            ? // Servida desde caché: ya terminada, sin mensaje (no se vuelve a guardar).
              { visita_id: p.visita_id, fase: 'lectura', fuente: l.fuente, estado: 'listo', mensaje: null, resultado: cacheada.get(l.fuente) as string, plazo_segundos: l.plazo, iniciado_en: ahora, terminado_en: ahora }
            : {
                // Todas las filas del insert llevan las mismas columnas (si no, PostgREST rellena con null).
                visita_id: p.visita_id,
                fase: 'lectura',
                fuente: l.fuente,
                estado: 'pendiente',
                mensaje: `Cliente: ${cliente.nombre} (id de cuenta ${cliente.crm_accountid}). Pregunta: ${l.pregunta(cliente.crm_accountid)}`,
                resultado: null,
                plazo_segundos: l.plazo,
                iniciado_en: null,
                terminado_en: null,
              }
        )
      );
      if (eIns) throw new Error(`crear tareas: ${eIns.message}`);
    }
  }

  // 2. Lanzar tareas pendientes (todas a la vez) y recoger las que están en marcha.
  const { data: vivas } = await admin
    .from('briefing_tarea')
    .select('*')
    .in('estado', ['pendiente', 'generando']);
  const lista = (vivas ?? []) as Tarea[];
  await Promise.all(
    lista.map((t) => (t.estado === 'pendiente' ? iniciarTarea(admin, cabDe(t), t) : t.conversacion_id ? recogerTarea(admin, cabDe(t), t) : Promise.resolve()))
  );

  // 3. Avanzar cada briefing en marcha (lecturas terminadas -> redacción; redacción terminada -> listo).
  const { data: generando } = await admin
    .from('briefing_visita')
    .select('visita_id, visita:visita!briefing_visita_visita_id_fkey(cliente:cliente_id(id, nombre, crm_accountid))')
    .eq('estado', 'generando');
  for (const b of generando ?? []) {
    const cliente = (b as unknown as { visita: { cliente: Cliente | null } }).visita?.cliente;
    if (!cliente?.crm_accountid) continue;
    // Solo los que van por el camino rápido (tienen tareas).
    const { count } = await admin.from('briefing_tarea').select('id', { count: 'exact', head: true }).eq('visita_id', b.visita_id);
    if (count) await avanzarBriefing(admin, cabRedaccion, b.visita_id, cliente);
  }
}

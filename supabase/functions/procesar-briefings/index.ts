// supabase/functions/procesar-briefings/index.ts
//
// Worker de la cola briefing_visita (migración 122). Lo llama pg_cron cada
// minuto (solo si hay algo en cola), con la cabecera `x-clave-worker` que se
// valida contra Vault. Desplegar con --no-verify-jwt.
//
// Cada pasada:
//   1. Recoge las respuestas de las conversaciones 'generando' (Direct Line,
//      endpoint EUROPEO: el global da 403 con este agente).
//   2. Arranca pendientes hasta MAX_EN_MARCHA a la vez y sin pasar el tope
//      diario (ajustes_app.briefing_tope_diario). Un 429 de Direct Line deja
//      la fila en 'pendiente' para la siguiente pasada.
//
// El agente responde un briefing en markdown (~10.000 caracteres) o, si algo
// falla, un JSON {"ok":false,"tipo":...}. Antes puede mandar saludos o
// mensajes cortos: se da por terminada la respuesta con el primer mensaje que
// empieza por "{" o supera MIN_CARACTERES.
// ponytail: heurística de longitud; si el agente cambia de formato y manda
// briefings cortos, marcar el final con una etiqueta explícita en sus
// instrucciones y buscar esa etiqueta aquí.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const DIRECT_LINE = 'https://europe.directline.botframework.com/v3/directline';
const USUARIO = 'primesuite';
const MAX_EN_MARCHA = 2;
const MIN_CARACTERES = 1500;
const MINUTOS_MAXIMOS = 20;
const MAX_INTENTOS = 3;

const MENSAJE_JSON: Record<string, string> = {
  no_encontrado: 'El CRM no tiene datos de esta cuenta.',
  varios_clientes: 'El agente no ha sabido identificar la cuenta del CRM.',
  error_datos: 'El agente no ha podido leer los datos del CRM. Vuelve a intentarlo más tarde.',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: claveOk } = await admin.rpc('fn_clave_worker_valida', {
    p_clave: req.headers.get('x-clave-worker') ?? '',
  });
  if (claveOk !== true) return json({ error: 'No autorizado' }, 401);

  const secreto = Deno.env.get('DIRECT_LINE_SECRET')!;
  const cabeceras = { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' };
  const resumen = { recogidos: 0, arrancados: 0, errores: 0 };

  // --- 1. Recoger respuestas ---
  const { data: enMarcha } = await admin
    .from('briefing_visita')
    .select('visita_id, conversacion_id, watermark, iniciado_en')
    .eq('estado', 'generando');

  for (const b of enMarcha ?? []) {
    const url = `${DIRECT_LINE}/conversations/${b.conversacion_id}/activities${b.watermark ? `?watermark=${b.watermark}` : ''}`;
    const r = await fetch(url, { headers: cabeceras });
    if (!r.ok) {
      await r.body?.cancel();
      if (r.status === 429) continue;
      await admin
        .from('briefing_visita')
        .update({ estado: 'error', error: `No se pudo leer la respuesta del agente (${r.status}).` })
        .eq('visita_id', b.visita_id);
      resumen.errores++;
      continue;
    }
    const { activities = [], watermark } = await r.json();
    const textos: string[] = activities
      .filter((a: { type: string; from?: { id?: string } }) => a.type === 'message' && a.from?.id !== USUARIO)
      .map((a: { text?: string }) => (a.text ?? '').trim());
    const final = textos.find((t) => t.startsWith('{') || t.length >= MIN_CARACTERES);

    if (final) {
      let cambio: Record<string, unknown> = {
        estado: 'listo',
        contenido: final,
        terminado_en: new Date().toISOString(),
        error: null,
      };
      if (final.startsWith('{')) {
        let tipo = '';
        try {
          tipo = JSON.parse(final)?.tipo ?? '';
        } catch {
          /* JSON roto: mensaje genérico */
        }
        cambio = { estado: 'error', error: MENSAJE_JSON[tipo] ?? 'Respuesta inesperada del agente.' };
      }
      await admin
        .from('briefing_visita')
        .update({ ...cambio, conversacion_id: null, watermark: null })
        .eq('visita_id', b.visita_id);
      resumen.recogidos++;
    } else if (Date.now() - new Date(b.iniciado_en).getTime() > MINUTOS_MAXIMOS * 60_000) {
      await admin
        .from('briefing_visita')
        .update({ estado: 'error', error: `El agente no ha respondido en ${MINUTOS_MAXIMOS} minutos.`, conversacion_id: null })
        .eq('visita_id', b.visita_id);
      resumen.errores++;
    } else if (watermark) {
      await admin.from('briefing_visita').update({ watermark }).eq('visita_id', b.visita_id);
    }
  }

  // --- 2. Arrancar pendientes ---
  const { count: generando } = await admin
    .from('briefing_visita')
    .select('visita_id', { count: 'exact', head: true })
    .eq('estado', 'generando');
  let hueco = MAX_EN_MARCHA - (generando ?? 0);

  const { data: tope } = await admin
    .from('ajustes_app')
    .select('valor, valor_numero')
    .eq('clave', 'briefing_tope_diario')
    .maybeSingle();
  if (tope?.valor && tope.valor_numero != null) {
    const { data: hoy } = await admin.rpc('fn_briefings_enviados_hoy');
    hueco = Math.min(hueco, tope.valor_numero - Number(hoy ?? 0));
  }

  if (hueco > 0) {
    const { data: pendientes } = await admin
      .from('briefing_visita')
      .select('visita_id, motivo, intentos, visita:visita_id(cliente:cliente_id(nombre, crm_accountid))')
      .eq('estado', 'pendiente')
      .order('pedido_en')
      .limit(hueco);

    for (const p of pendientes ?? []) {
      const cliente = (p as unknown as { visita: { cliente: { nombre: string; crm_accountid: string | null } } }).visita
        ?.cliente;
      if (!cliente?.crm_accountid) {
        await admin.from('briefing_visita').update({ estado: 'sin_cuenta' }).eq('visita_id', p.visita_id);
        continue;
      }
      try {
        const rc = await fetch(`${DIRECT_LINE}/conversations`, { method: 'POST', headers: cabeceras });
        if (rc.status === 429) {
          await rc.body?.cancel();
          break; // Copilot frena: la siguiente pasada lo reintenta.
        }
        if (!rc.ok) throw new Error(`abrir conversación (${rc.status})`);
        const { conversationId } = await rc.json();

        const ra = await fetch(`${DIRECT_LINE}/conversations/${conversationId}/activities`, {
          method: 'POST',
          headers: cabeceras,
          body: JSON.stringify({
            type: 'message',
            from: { id: USUARIO },
            locale: 'es-ES',
            text: `Briefing del cliente con id de cuenta ${cliente.crm_accountid} (${cliente.nombre})`,
          }),
        });
        if (!ra.ok) throw new Error(`enviar petición (${ra.status})`);
        await ra.body?.cancel();

        await admin
          .from('briefing_visita')
          .update({ estado: 'generando', iniciado_en: new Date().toISOString(), conversacion_id: conversationId, watermark: null })
          .eq('visita_id', p.visita_id);
        await admin.from('briefing_uso').insert({ visita_id: p.visita_id, motivo: p.motivo });
        resumen.arrancados++;
      } catch (e) {
        const intentos = p.intentos + 1;
        await admin
          .from('briefing_visita')
          .update(
            intentos >= MAX_INTENTOS
              ? { estado: 'error', intentos, error: `No se pudo contactar con el agente: ${(e as Error).message}.` }
              : { intentos }
          )
          .eq('visita_id', p.visita_id);
        resumen.errores++;
      }
    }
  }

  return json(resumen);
});

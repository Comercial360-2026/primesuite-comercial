// supabase/functions/procesar-consultas/index.ts
//
// Worker de la cola consulta_ia (migración 126) — «Pregunta a la IA».
// Mismo esquema que procesar-briefings, con el agente «Consultas comerciales
// CB» (secreto DIRECT_LINE_SECRET_CONSULTAS, endpoint EUROPEO de Direct Line).
// Lo llaman fn_preguntar_ia (al momento) y pg_cron cada minuto mientras haya
// algo en marcha, con la cabecera `x-clave-worker` (Vault). Desplegar con
// --no-verify-jwt.
//
// La respuesta es corta: se da por terminada cuando el agente cierra el turno
// (evento `turn.complete`) y se toma su último mensaje. Si no llega a cerrar
// el turno pero ya hay un mensaje con «Fuente:», también vale.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const DIRECT_LINE = 'https://europe.directline.botframework.com/v3/directline';
const USUARIO = 'primesuite';
const MAX_EN_MARCHA = 3;
const MINUTOS_MAXIMOS = 8;
const MAX_INTENTOS = 3;
// Sondeo dentro de la propia ejecución: sin esto la respuesta se recogía como mucho
// una vez por minuto (cron) y sumaba hasta 60 s a cada consulta. Edge Functions:
// 150 s de reloj en el plan gratuito (docs de Supabase), de ahí el presupuesto.
const SONDEO_MS = 4_000;
const PRESUPUESTO_MS = 110_000;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: claveOk } = await admin.rpc('fn_clave_worker_valida', {
    p_clave: req.headers.get('x-clave-worker') ?? '',
  });
  if (claveOk !== true) return json({ error: 'No autorizado' }, 401);

  const secreto = Deno.env.get('DIRECT_LINE_SECRET_CONSULTAS');
  if (!secreto) return json({ error: 'Falta DIRECT_LINE_SECRET_CONSULTAS' }, 500);
  const cabeceras = { Authorization: `Bearer ${secreto}`, 'Content-Type': 'application/json' };
  // Responde YA y sigue trabajando en segundo plano (EdgeRuntime.waitUntil): si la petición
  // del cron durara 110 s, pg_net dejaría esperando a las siguientes llamadas del cron.
  const trabajo = async () => {
    const resumen = { recogidos: 0, arrancados: 0, errores: 0 };
    const cerrar = (id: string, cambio: Record<string, unknown>) =>
      admin
        .from('consulta_ia')
        .update({ ...cambio, conversacion_id: null, watermark: null, terminado_en: new Date().toISOString() })
        .eq('id', id)
        .eq('estado', 'generando');

    // --- 1. Recoger respuestas ---
    const recoger = async () => {
      const { data: enMarcha } = await admin
        .from('consulta_ia')
        .select('id, conversacion_id, watermark, iniciado_en')
        .eq('estado', 'generando');

      for (const c of enMarcha ?? []) {
        const url = `${DIRECT_LINE}/conversations/${c.conversacion_id}/activities${c.watermark ? `?watermark=${c.watermark}` : ''}`;
        const r = await fetch(url, { headers: cabeceras });
        if (!r.ok) {
          await r.body?.cancel();
          if (r.status === 429) continue;
          await cerrar(c.id, { estado: 'error', error: `No se pudo leer la respuesta del agente (${r.status}).` });
          resumen.errores++;
          continue;
        }
        const { activities = [], watermark } = await r.json();
        const delBot = activities.filter((a: { from?: { id?: string } }) => a.from?.id !== USUARIO);
        const textos: string[] = delBot
          .filter((a: { type: string }) => a.type === 'message')
          .map((a: { text?: string }) => (a.text ?? '').trim())
          .filter(Boolean);
        const turnoCerrado = delBot.some((a: { type: string; name?: string }) => a.type === 'event' && a.name === 'turn.complete');
        const conFuente = textos.find((t) => /(^|\n)\s*\**Fuente/i.test(t));
        const final = conFuente ?? (turnoCerrado ? textos.at(-1) : undefined);

        if (final) {
          const esError = /^Mensaje de error:/i.test(final);
          await cerrar(
            c.id,
            esError
              ? { estado: 'error', error: 'El agente ha fallado al buscar la respuesta. Prueba a preguntarlo de otra forma.' }
              : { estado: 'listo', respuesta: final, error: null }
          );
          if (esError) resumen.errores++;
          else resumen.recogidos++;
        } else if (turnoCerrado) {
          await cerrar(c.id, { estado: 'error', error: 'El agente terminó sin responder.' });
          resumen.errores++;
        } else if (Date.now() - new Date(c.iniciado_en).getTime() > MINUTOS_MAXIMOS * 60_000) {
          await cerrar(c.id, { estado: 'error', error: `El agente no ha respondido en ${MINUTOS_MAXIMOS} minutos.` });
          resumen.errores++;
        } else if (watermark) {
          await admin.from('consulta_ia').update({ watermark }).eq('id', c.id);
        }
      }
    };

    // --- 2. Arrancar pendientes ---
    const arrancar = async () => {
      const { count: generando } = await admin
        .from('consulta_ia')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'generando');
      const hueco = MAX_EN_MARCHA - (generando ?? 0);

      if (hueco > 0) {
        const { data: pendientes } = await admin
          .from('consulta_ia')
          .select('id, pregunta, intentos, cliente:cliente_id(nombre, crm_accountid)')
          .eq('estado', 'pendiente')
          .order('pedido_en')
          .limit(hueco);

        for (const p of pendientes ?? []) {
          const cliente = (p as unknown as { cliente: { nombre: string; crm_accountid: string | null } }).cliente;
          if (!cliente?.crm_accountid) {
            await admin.from('consulta_ia').update({ estado: 'sin_cuenta' }).eq('id', p.id);
            continue;
          }
          // Marca antes de llamar: si dos pasadas coinciden, la segunda no la coge.
          const { data: tomada } = await admin
            .from('consulta_ia')
            .update({ estado: 'generando', iniciado_en: new Date().toISOString() })
            .eq('id', p.id)
            .eq('estado', 'pendiente')
            .select('id');
          if (!tomada?.length) continue;
          try {
            const rc = await fetch(`${DIRECT_LINE}/conversations`, { method: 'POST', headers: cabeceras });
            if (rc.status === 429) {
              await rc.body?.cancel();
              await admin.from('consulta_ia').update({ estado: 'pendiente', iniciado_en: null }).eq('id', p.id);
              break;
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
                text: `Cliente: ${cliente.nombre} (id de cuenta ${cliente.crm_accountid}). Pregunta: ${p.pregunta}`,
              }),
            });
            if (!ra.ok) throw new Error(`enviar pregunta (${ra.status})`);
            await ra.body?.cancel();

            await admin.from('consulta_ia').update({ conversacion_id: conversationId, watermark: null }).eq('id', p.id);
            resumen.arrancados++;
          } catch (e) {
            const intentos = p.intentos + 1;
            await admin
              .from('consulta_ia')
              .update(
                intentos >= MAX_INTENTOS
                  ? { estado: 'error', intentos, error: `No se pudo contactar con el agente: ${(e as Error).message}.` }
                  : { estado: 'pendiente', iniciado_en: null, intentos }
              )
              .eq('id', p.id);
            resumen.errores++;
          }
        }
      }
    };

    // --- 3. Sondeo: recoger y arrancar hasta que no quede nada en marcha ---
    const t0 = Date.now();
    while (true) {
      await recoger();
      await arrancar();
      const { count: vivas } = await admin
        .from('consulta_ia')
        .select('id', { count: 'exact', head: true })
        .in('estado', ['generando', 'pendiente']);
      if (!vivas || Date.now() - t0 + SONDEO_MS > PRESUPUESTO_MS) break;
      await new Promise((r) => setTimeout(r, SONDEO_MS));
    }

  };
  EdgeRuntime.waitUntil(trabajo().catch((e) => console.error('worker', e)));
  return json({ ok: true, segundo_plano: true });
});

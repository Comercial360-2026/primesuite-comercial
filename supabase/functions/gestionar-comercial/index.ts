// supabase/functions/gestionar-comercial/index.ts
//
// Fase 5 — Dirección Comercial gestiona el equipo de comerciales desde la
// app (pantalla /comerciales). Es el único trozo que necesita la clave de
// servicio: dar de alta un comercial = crear un usuario en Supabase Auth,
// y `comercial.id` DEBE ser el mismo uuid que `auth.users.id` (ver
// use-sesion-actual.ts y 02_auth_rls.sql §1).
//
// El resto de escrituras en `comercial` (nombre/rol/zona) ya las permite
// la política RLS `pol_comercial_admin_todo` a direccion_comercial, pero
// pasan también por aquí para tener una sola vía auditada y coherente, y
// sobre todo para que "dar de baja" bloquee además el login del usuario de
// Auth — si solo se pusiera `activo=false`, el comercial dado de baja
// seguiría pudiendo entrar (nada filtra `activo` al resolver la sesión).
//
// Contrato (POST JSON):
//   { accion: 'crear',      nombre, email, rol, zona_cartera? }
//     -> { id, password_temporal }
//   { accion: 'editar',     id, nombre, rol, zona_cartera? }   -> { ok: true }
//   { accion: 'desactivar', id }                               -> { ok: true }
//   { accion: 'reactivar',  id }                               -> { ok: true }
//
// Todas exigen que quien llama sea direccion_comercial. No se puede uno
// desactivar a sí mismo (candado anti-bloqueo).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLES_VALIDOS = ['comercial', 'direccion_comercial'];
// Bloqueo de login "para siempre" (100 años). Supabase no tiene un ban
// permanente explícito; una duración enorme es el patrón habitual.
const BAN_LARGO = '876000h';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Contraseña temporal legible para dictar por teléfono: "Prime-" + 8
// caracteres de un alfabeto sin ambigüedades (sin 0/O, 1/l/I) + un dígito.
function contrasenaTemporal(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const cuerpo = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
  const digito = crypto.getRandomValues(new Uint8Array(1))[0] % 10;
  return `Prime-${cuerpo}${digito}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo de la petición inválido' }, 400);
  }
  const accion = body.accion;
  if (accion !== 'crear' && accion !== 'editar' && accion !== 'desactivar' && accion !== 'reactivar') {
    return jsonResponse({ error: 'Acción no reconocida' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'No autenticado' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Cliente "como el usuario que llama" — solo para saber quién es.
  const clienteUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await clienteUsuario.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'Sesión no válida' }, 401);
  const quienLlamaId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Autorización: solo Dirección Comercial.
  const { data: quienLlama } = await admin
    .from('comercial')
    .select('rol')
    .eq('id', quienLlamaId)
    .single();
  if (quienLlama?.rol !== 'direccion_comercial') {
    return jsonResponse({ error: 'Solo Dirección Comercial puede gestionar el equipo.' }, 403);
  }

  // ----------------------------------------------------------------- CREAR
  if (accion === 'crear') {
    const nombre = String(body.nombre ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const rol = String(body.rol ?? '');
    const zonaCartera = body.zona_cartera ? String(body.zona_cartera).trim() : null;

    if (!nombre) return jsonResponse({ error: 'Falta el nombre.' }, 400);
    if (!email || !email.includes('@')) return jsonResponse({ error: 'El correo no es válido.' }, 400);
    if (!ROLES_VALIDOS.includes(rol)) return jsonResponse({ error: 'Rol no válido.' }, 400);

    const password = contrasenaTemporal();
    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (errCrear || !creado.user) {
      const msg = /already been registered|already exists/i.test(errCrear?.message ?? '')
        ? 'Ya existe un usuario con ese correo.'
        : `No se pudo crear el usuario: ${errCrear?.message ?? 'error desconocido'}`;
      return jsonResponse({ error: msg }, 400);
    }

    const { error: errFila } = await admin.from('comercial').insert({
      id: creado.user.id,
      nombre,
      rol,
      zona_cartera: zonaCartera,
      activo: true,
    });
    if (errFila) {
      // Sin fila `comercial` el usuario de Auth no sirve para nada y
      // dejaría un correo "ocupado" — se revierte.
      await admin.auth.admin.deleteUser(creado.user.id);
      return jsonResponse({ error: `No se pudo guardar el comercial: ${errFila.message}` }, 400);
    }

    return jsonResponse({ id: creado.user.id, password_temporal: password });
  }

  // ---------------------------------------------------------------- EDITAR
  if (accion === 'editar') {
    const id = String(body.id ?? '');
    const nombre = String(body.nombre ?? '').trim();
    const rol = String(body.rol ?? '');
    const zonaCartera = body.zona_cartera ? String(body.zona_cartera).trim() : null;

    if (!id) return jsonResponse({ error: 'Falta el id del comercial.' }, 400);
    if (!nombre) return jsonResponse({ error: 'Falta el nombre.' }, 400);
    if (!ROLES_VALIDOS.includes(rol)) return jsonResponse({ error: 'Rol no válido.' }, 400);

    const { error } = await admin
      .from('comercial')
      .update({ nombre, rol, zona_cartera: zonaCartera, actualizado_en: new Date().toISOString() })
      .eq('id', id);
    if (error) return jsonResponse({ error: `No se pudo guardar: ${error.message}` }, 400);

    await admin.auth.admin.updateUserById(id, { user_metadata: { nombre } });
    return jsonResponse({ ok: true });
  }

  // -------------------------------------------------- DESACTIVAR / REACTIVAR
  const id = String(body.id ?? '');
  if (!id) return jsonResponse({ error: 'Falta el id del comercial.' }, 400);
  if (accion === 'desactivar' && id === quienLlamaId) {
    return jsonResponse({ error: 'No puedes darte de baja a ti mismo.' }, 400);
  }

  const desactivar = accion === 'desactivar';
  const { error: errFila } = await admin
    .from('comercial')
    .update({
      activo: !desactivar,
      fecha_baja: desactivar ? new Date().toISOString() : null,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', id);
  if (errFila) return jsonResponse({ error: `No se pudo actualizar: ${errFila.message}` }, 400);

  // Bloquea (o desbloquea) el login del usuario de Auth. Sin esto, un
  // comercial dado de baja seguiría entrando en la app.
  const { error: errBan } = await admin.auth.admin.updateUserById(id, {
    ban_duration: desactivar ? BAN_LARGO : 'none',
  });
  if (errBan) {
    return jsonResponse(
      { error: `El estado se guardó, pero no se pudo ${desactivar ? 'bloquear' : 'desbloquear'} el acceso: ${errBan.message}` },
      500
    );
  }

  return jsonResponse({ ok: true });
});

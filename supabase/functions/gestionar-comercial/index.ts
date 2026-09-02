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
// Fase 6a — el alta ya no devuelve una contraseña: devuelve un enlace de
// un solo uso (`type: recovery`) con el que el comercial elige su
// contraseña en la pantalla /establecer-contrasena. `enlace_acceso`
// regenera ese enlace (contraseña perdida, enlace caducado).
// `solicitar_acceso` la usa el propio comercial SIN sesión desde el login.
//
// Contrato (POST JSON):
//   { accion: 'crear',      nombre, email, rol, zona_cartera?, app_url? }
//     -> { id, action_link }
//   { accion: 'editar',     id, nombre, rol, zona_cartera? }   -> { ok: true }
//   { accion: 'desactivar', id, traspasar_a? }                 -> { ok: true }
//   { accion: 'reactivar',  id }                               -> { ok: true }
//   { accion: 'enlace_acceso', id, app_url? }                  -> { action_link }
//   { accion: 'solicitar_acceso', email }                      -> { ok: true }  (SIN auth)
//
// Todas menos `solicitar_acceso` exigen que quien llama sea
// direccion_comercial. No se puede uno desactivar a sí mismo.

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

// Contraseña interna aleatoria — el usuario NO la ve nunca (elige la suya
// con el enlace). Solo existe porque createUser necesita una.
function contrasenaAleatoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Solo se acepta un app_url http(s); si no, se omite y Supabase usa su
// Site URL por defecto. El allowlist de "Redirect URLs" lo valida Supabase.
function redireccionEstablecer(appUrl: unknown): string | undefined {
  const s = typeof appUrl === 'string' ? appUrl.trim().replace(/\/$/, '') : '';
  if (!/^https?:\/\/[^\s]+$/i.test(s)) return undefined;
  return `${s}/establecer-contrasena`;
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
  const ACCIONES = ['crear', 'editar', 'desactivar', 'reactivar', 'enlace_acceso', 'solicitar_acceso'];
  if (typeof accion !== 'string' || !ACCIONES.includes(accion)) {
    return jsonResponse({ error: 'Acción no reconocida' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // --------------------------------------------------- SOLICITAR ACCESO (SIN auth)
  // La pide el propio comercial desde el login, sin sesión. Respuesta
  // SIEMPRE la misma (no se puede sondear qué correos existen).
  if (accion === 'solicitar_acceso') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (email && email.includes('@')) {
      try {
        // El equipo es pequeño: una página basta para encontrar el correo.
        const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const usuario = lista?.users?.find((u) => (u.email ?? '').toLowerCase() === email);
        if (usuario) {
          const { data: fila } = await admin
            .from('comercial')
            .select('id, activo')
            .eq('id', usuario.id)
            .maybeSingle();
          if (fila?.activo) {
            // Ignora el choque con el índice único parcial (ya hay una
            // pendiente): volver a pedirlo no crea otra.
            await admin
              .from('solicitud_acceso')
              .insert({ comercial_id: fila.id, email });
          }
        }
      } catch {
        /* se responde ok igualmente — no se filtra nada */
      }
    }
    return jsonResponse({ ok: true });
  }

  // --------------------------------------------------------- AUTORIZACIÓN
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'No autenticado' }, 401);

  const clienteUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await clienteUsuario.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'Sesión no válida' }, 401);
  const quienLlamaId = userData.user.id;

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

    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email,
      password: contrasenaAleatoria(),
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
      await admin.auth.admin.deleteUser(creado.user.id);
      return jsonResponse({ error: `No se pudo guardar el comercial: ${errFila.message}` }, 400);
    }

    const { data: enlace, error: errEnlace } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: redireccionEstablecer(body.app_url) },
    });
    if (errEnlace || !enlace?.properties?.action_link) {
      // El comercial está creado; solo falló el enlace. Se puede reenviar
      // desde su ficha con `enlace_acceso`.
      return jsonResponse(
        { id: creado.user.id, action_link: null, aviso: 'El comercial está creado, pero no se pudo generar el enlace. Reenvíalo desde su ficha.' },
        200
      );
    }

    return jsonResponse({ id: creado.user.id, action_link: enlace.properties.action_link });
  }

  // ---------------------------------------------------------- ENLACE ACCESO
  if (accion === 'enlace_acceso') {
    const id = String(body.id ?? '');
    if (!id) return jsonResponse({ error: 'Falta el id del comercial.' }, 400);

    const { data: usuario, error: errUsuario } = await admin.auth.admin.getUserById(id);
    if (errUsuario || !usuario.user?.email) {
      return jsonResponse({ error: 'No se encontró el usuario de ese comercial.' }, 400);
    }

    const { data: enlace, error: errEnlace } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: usuario.user.email,
      options: { redirectTo: redireccionEstablecer(body.app_url) },
    });
    if (errEnlace || !enlace?.properties?.action_link) {
      return jsonResponse({ error: `No se pudo generar el enlace: ${errEnlace?.message ?? 'error desconocido'}` }, 400);
    }

    // Si había una petición de acceso pendiente de este comercial, queda
    // resuelta al reenviarle el enlace.
    await admin
      .from('solicitud_acceso')
      .update({ estado: 'resuelta', resuelto_por: quienLlamaId, resuelto_en: new Date().toISOString() })
      .eq('comercial_id', id)
      .eq('estado', 'pendiente');

    return jsonResponse({ action_link: enlace.properties.action_link });
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

  // Baja con traspaso de cartera (Fase 6b) — antes de bloquear el acceso,
  // pasa clientes / visitas planificadas / próximos pasos a otro comercial.
  // La RPC se llama COMO el usuario (no con service role) para que su guard
  // de rol `fn_rol_actual()` siga viendo a Dirección Comercial.
  const traspasarA = desactivar && body.traspasar_a ? String(body.traspasar_a) : null;
  if (traspasarA) {
    const { error: errTraspaso } = await clienteUsuario.rpc('fn_traspasar_cartera', {
      p_de: id,
      p_a: traspasarA,
    });
    if (errTraspaso) {
      return jsonResponse(
        { error: `No se pudo traspasar la cartera, no se ha dado de baja: ${errTraspaso.message}` },
        400
      );
    }
  }

  const { error: errFila } = await admin
    .from('comercial')
    .update({
      activo: !desactivar,
      fecha_baja: desactivar ? new Date().toISOString() : null,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', id);
  if (errFila) return jsonResponse({ error: `No se pudo actualizar: ${errFila.message}` }, 400);

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

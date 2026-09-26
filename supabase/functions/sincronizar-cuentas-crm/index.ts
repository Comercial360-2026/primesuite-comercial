// supabase/functions/sincronizar-cuentas-crm/index.ts
//
// Entrada para el flujo de Power Automate Desktop (PC de Cesar, una vez al día)
// que lee las cuentas del CRM Dynamics on-prem (tras VPN) y las sube aquí.
// Hace upsert en crm_cuenta (migración 119) por accountid.
//
// El flujo no tiene sesión de Supabase: se despliega con --no-verify-jwt y se
// autentica con la cabecera `x-clave-sync`, que debe coincidir con el secreto
// CRM_SYNC_KEY. Así en el PC no vive la service role key, solo una clave que
// únicamente sirve para esto y se puede rotar sin tocar nada más.
//
// Cuerpo: array JSON de cuentas con los MISMOS nombres de columna que ya
// produce el script del flujo (DIGITEK_Accounts: accountid, name,
// address1_city, address1_postalcode, address1_country,
// _parentaccountid_value, cuenta_matriz, statecode, modifiedon). Paso de PAD
// que la llama: docs/crm-copilot/subir-cuentas-a-primesuite.ps1.
//
// Con `?tabla=contactos` el cuerpo son los contactos (DIGITEK_Contacts:
// contactid, fullname, jobtitle, emailaddress1, telephone1, mobilephone,
// _parentcustomerid_value, statecode, modifiedon): upsert en crm_contacto y
// después fn_sincronizar_interlocutores_crm los vuelca como interlocutores de
// los clientes vinculados (migración 125).
//
// ponytail: solo upsert. Una cuenta que desaparezca del CRM se queda como
// estaba; si hiciera falta, marcar activa=false las no recibidas en una carga
// completa (con un umbral para no desactivarlo todo por una carga parcial).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const LOTE = 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Comparación en tiempo constante: no filtrar la clave por tiempos de respuesta.
function mismaClave(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : null);
function fecha(v: unknown) {
  const t = texto(v);
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);

  const clave = Deno.env.get('CRM_SYNC_KEY') ?? '';
  if (!clave || !mismaClave(req.headers.get('x-clave-sync') ?? '', clave)) {
    return json({ error: 'No autorizado' }, 401);
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'El cuerpo no es JSON válido' }, 400);
  }
  // ConvertTo-Json de PowerShell devuelve un objeto suelto si solo hay una fila.
  const filas = Array.isArray(cuerpo) ? cuerpo : cuerpo && typeof cuerpo === 'object' ? [cuerpo] : [];
  if (!filas.length) return json({ error: 'No llega ninguna fila' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const ahora = new Date().toISOString();

  if (new URL(req.url).searchParams.get('tabla') === 'contactos') {
    return await guardarContactos(admin, filas as Record<string, unknown>[], ahora);
  }

  const porId = new Map<string, Record<string, unknown>>();
  let descartadas = 0;
  for (const f of filas as Record<string, unknown>[]) {
    const accountid = uuid(f.accountid);
    const nombre = texto(f.name);
    if (!accountid || !nombre) {
      descartadas++;
      continue;
    }
    porId.set(accountid, {
      accountid,
      nombre,
      ciudad: texto(f.address1_city),
      codigo_postal: texto(f.address1_postalcode),
      pais: texto(f.address1_country),
      // Los scripts corregidos de PAD pueden quitar el "_" inicial.
      cuenta_matriz_id: uuid(f._parentaccountid_value ?? f.parentaccountid_value),
      cuenta_matriz: texto(f.cuenta_matriz),
      // statecode de Dynamics: 0 = activa, 1 = inactiva.
      activa: String(f.statecode ?? '0').trim() === '0',
      modificado_crm: fecha(f.modifiedon),
      sincronizado_en: ahora,
    });
  }

  const cuentas = [...porId.values()];
  for (let i = 0; i < cuentas.length; i += LOTE) {
    const { error } = await admin.from('crm_cuenta').upsert(cuentas.slice(i, i + LOTE), { onConflict: 'accountid' });
    if (error) {
      return json({ error: `Fallo guardando el lote ${i / LOTE + 1}: ${error.message}`, guardadas: i }, 500);
    }
  }

  return json({ recibidas: filas.length, guardadas: cuentas.length, descartadas });
});

async function guardarContactos(
  admin: ReturnType<typeof createClient>,
  filas: Record<string, unknown>[],
  ahora: string
) {
  const porId = new Map<string, Record<string, unknown>>();
  let descartadas = 0;
  for (const f of filas) {
    const contactid = uuid(f.contactid);
    const nombre = texto(f.fullname) ?? [texto(f.firstname), texto(f.lastname)].filter(Boolean).join(' ');
    if (!contactid || !nombre) {
      descartadas++;
      continue;
    }
    porId.set(contactid, {
      contactid,
      accountid: uuid(f._parentcustomerid_value ?? f.parentcustomerid_value),
      nombre,
      cargo: texto(f.jobtitle),
      email: texto(f.emailaddress1),
      telefono: texto(f.telephone1),
      movil: texto(f.mobilephone),
      activo: String(f.statecode ?? '0').trim() === '0',
      modificado_crm: fecha(f.modifiedon),
      sincronizado_en: ahora,
    });
  }
  const contactos = [...porId.values()];
  for (let i = 0; i < contactos.length; i += LOTE) {
    const { error } = await admin.from('crm_contacto').upsert(contactos.slice(i, i + LOTE), { onConflict: 'contactid' });
    if (error) {
      return json({ error: `Fallo guardando el lote ${i / LOTE + 1}: ${error.message}`, guardadas: i }, 500);
    }
  }
  const { error } = await admin.rpc('fn_sincronizar_interlocutores_crm');
  if (error) return json({ error: `Contactos guardados, pero fallo al pasarlos a interlocutores: ${error.message}` }, 500);
  return json({ recibidas: filas.length, guardadas: contactos.length, descartadas });
}

import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { normalizarNombre } from '@/lib/nombres-cliente';
import type { CuentaCrm } from '@/features/clientes/cuenta-crm';

// Vincular un cliente a su cuenta del CRM (o desvincularlo). Un solo sitio para la ficha, la vinculación automática y el
// panel de Dirección. Con `adoptarNombre`, el cliente pasa a llamarse como la cuenta y el nombre que tenía se guarda en
// `nombre_alias` (los buscadores lo siguen encontrando). Desvincular restaura ese nombre.
export interface ClienteAVincular {
  id: string;
  nombre: string;
  nombre_alias: string | null;
  ubicacion_general: string | null;
}


export async function vincularClienteACuenta(
  cliente: ClienteAVincular,
  cuenta: CuentaCrm | null,
  adoptarNombre: boolean,
  /** La cuenta que tenía hasta ahora (al cambiarla o quitarla): si la ubicación del cliente es la ciudad de ESA cuenta, se actualiza. */
  cuentaAnterior?: CuentaCrm | null
) {
  const cambios: {
    crm_accountid: string | null;
    ubicacion_general?: string | null;
    nombre?: string;
    nombre_alias?: string | null;
    crm_no_autovincular?: boolean;
  } = {
    crm_accountid: cuenta?.accountid ?? null,
  };
  if (cuenta) {
    // Sin ubicación escrita, se toma la ciudad de la cuenta. Nunca pisa lo que el comercial escribió: solo se sustituye la
    // que venía de la cuenta anterior (misma ciudad que ella), para que cambiar de cuenta no deje la ciudad equivocada.
    if (cuenta.ciudad && (!cliente.ubicacion_general || (cuentaAnterior?.ciudad && cliente.ubicacion_general === cuentaAnterior.ciudad))) {
      cambios.ubicacion_general = cuenta.ciudad;
    }
    if (adoptarNombre && normalizarNombre(cuenta.nombre) !== normalizarNombre(cliente.nombre)) {
      cambios.nombre = cuenta.nombre;
      // El alias es el nombre ORIGINAL: cambiar de cuenta más tarde no lo pierde.
      cambios.nombre_alias = cliente.nombre_alias ?? cliente.nombre;
    }
  } else {
    // Quitar la cuenta a mano = «esta no era»: que no se vuelva a vincular sola.
    cambios.crm_no_autovincular = true;
    // La ubicación que se había tomado de esa cuenta se quita (si la cambió el comercial, no se toca).
    if (cuentaAnterior?.ciudad && cliente.ubicacion_general === cuentaAnterior.ciudad) cambios.ubicacion_general = null;
    if (cliente.nombre_alias) {
      cambios.nombre = cliente.nombre_alias;
      cambios.nombre_alias = null;
    }
  }
  await conReintentoDeSesion(
    () => supabase.from('cliente').update(cambios, { count: 'exact' }).eq('id', cliente.id),
    'No se ha podido guardar (0 filas afectadas). Puede que no tengas permiso.'
  );
}

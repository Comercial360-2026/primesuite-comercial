import { supabase } from '@/lib/supabase-client';

// Sin permiso, Supabase no da error: el UPDATE/DELETE "tiene éxito"
// afectando a 0 filas (adenda_punto1_delete_silencioso.md) — por eso todo
// el código comprueba `count`. Pero un 0 también puede ser un falso
// negativo: en iOS, volver de la cámara nativa o desbloquear el móvil a
// media edición dejan la sesión un instante desactualizada, y el primer
// intento se manda con un token a punto de caducar — RLS lo rechaza sin
// avisar, exactamente igual que si de verdad faltara permiso. Antes de dar
// el error por bueno, se refresca la sesión y se reintenta; si tras todos
// los reintentos sigue dando 0 (o sigue sin cumplir `esFallo`), ahí sí es
// un permiso real. Devuelve el resultado final por si el llamador necesita
// leer `count` (p. ej. para un mensaje de "N de M").
//
// Un solo reintento no bastaba (13 sept, reportado por Cesar: foto + zona
// justo al volver de la cámara nativa — el caso exacto que motivó este
// mecanismo — seguía fallando y hacía falta pulsar "Guardar" varias veces
// a mano para que colara). Cada pulsación manual daba tiempo de más para
// que la sesión terminase de refrescarse en segundo plano; ahora ese
// tiempo lo da el propio reintento, con una pequeña espera entre intentos
// en vez de encadenarlos sin pausa.
const MAX_INTENTOS = 3;
const ESPERA_ENTRE_INTENTOS_MS = 400;

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function conReintentoDeSesion<
  T extends { error: { message: string } | null; count: number | null },
>(
  ejecutar: () => PromiseLike<T>,
  mensajeSinFilas: string | ((resultado: T) => string),
  esFallo: (resultado: T) => boolean = (resultado) => !resultado.count
): Promise<T> {
  let resultado = await ejecutar();
  if (resultado.error) throw new Error(resultado.error.message);
  for (let intento = 2; esFallo(resultado) && intento <= MAX_INTENTOS; intento++) {
    await esperar(ESPERA_ENTRE_INTENTOS_MS);
    await supabase.auth.refreshSession();
    resultado = await ejecutar();
    if (resultado.error) throw new Error(resultado.error.message);
  }
  if (esFallo(resultado)) {
    throw new Error(typeof mensajeSinFilas === 'string' ? mensajeSinFilas : mensajeSinFilas(resultado));
  }
  return resultado;
}

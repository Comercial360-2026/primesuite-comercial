import { supabase } from '@/lib/supabase-client';

// Sin permiso, Supabase no da error: el UPDATE/DELETE "tiene éxito"
// afectando a 0 filas (adenda_punto1_delete_silencioso.md) — por eso todo
// el código comprueba `count`. Pero un 0 también puede ser un falso
// negativo: en iOS, volver de la cámara nativa o desbloquear el móvil a
// media edición dejan la sesión un instante desactualizada, y el primer
// intento se manda con un token a punto de caducar — RLS lo rechaza sin
// avisar, exactamente igual que si de verdad faltara permiso. Antes de dar
// el error por bueno, se refresca la sesión y se reintenta una vez; si el
// reintento también da 0 (o sigue sin cumplir `esFallo`), ahí sí es un
// permiso real. Devuelve el resultado final por si el llamador necesita
// leer `count` (p. ej. para un mensaje de "N de M").
export async function conReintentoDeSesion<
  T extends { error: { message: string } | null; count: number | null },
>(
  ejecutar: () => PromiseLike<T>,
  mensajeSinFilas: string | ((resultado: T) => string),
  esFallo: (resultado: T) => boolean = (resultado) => !resultado.count
): Promise<T> {
  let resultado = await ejecutar();
  if (resultado.error) throw new Error(resultado.error.message);
  if (esFallo(resultado)) {
    await supabase.auth.refreshSession();
    resultado = await ejecutar();
    if (resultado.error) throw new Error(resultado.error.message);
    if (esFallo(resultado)) {
      throw new Error(typeof mensajeSinFilas === 'string' ? mensajeSinFilas : mensajeSinFilas(resultado));
    }
  }
  return resultado;
}

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
// BUG real (13 sept, reportado por Cesar con mala cobertura): ninguna
// llamada de red de aquí tenía timeout — con conexión lenta/intermitente,
// `ejecutar()` o `refreshSession()` podían quedarse colgados literalmente
// minutos (el navegador espera lo que haga falta), sin ningún feedback, y
// el mensaje final ("falta permiso") era engañoso: el problema era la
// cobertura, no el permiso — de hecho el UPDATE podía acabar aplicándose
// igual mucho después, cuando ya se había mostrado el error. Cada llamada
// de red ahora corta a los 10s con un mensaje claro de conexión en vez de
// esperar indefinidamente o confundir "sin red" con "sin permiso".
const MAX_INTENTOS = 2;
const ESPERA_ENTRE_INTENTOS_MS = 400;
const TIMEOUT_RED_MS = 10_000;
// Exportados para que useAccionAsync (use-accion-async.ts) pueda reconocer
// estos dos mensajes concretos y mostrarlos tal cual, sin dejar que el
// `mensajeError` fijo de cada pantalla los tape — ver el bug documentado
// más abajo, en MENSAJE_SESION_CADUCADA.
export const MENSAJE_SIN_RED =
  'La conexión está tardando demasiado para guardar. Comprueba tu cobertura o wifi y vuelve a intentarlo.';
// BUG real (13 sept, reportado por Cesar con la sesión ya caducada de
// verdad): `refreshSession()` se llamaba pero su resultado se ignoraba del
// todo. Si el refresco fallaba (sesión realmente caducada, no solo a punto
// de caducar — confirmado contra `auth.users.last_sign_in_at`, un
// re-login posterior al fallo), el código reintentaba igualmente con la
// misma sesión rota, fallaba otra vez, y acababa mostrando "falta
// permiso" — un diagnóstico falso que mandaba a revisar permisos cuando
// lo que hacía falta era volver a iniciar sesión.
export const MENSAJE_SESION_CADUCADA =
  'Tu sesión ha caducado. Sal de la app y vuelve a entrar antes de seguir guardando.';

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ErrorTimeoutRed extends Error {}

function conTimeout<T>(promesa: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new ErrorTimeoutRed('timeout de red')), ms);
    Promise.resolve(promesa).then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (err) => {
        clearTimeout(id);
        reject(err);
      }
    );
  });
}

export async function conReintentoDeSesion<
  T extends { error: { message: string } | null; count: number | null },
>(
  ejecutar: () => PromiseLike<T>,
  mensajeSinFilas: string | ((resultado: T) => string),
  esFallo: (resultado: T) => boolean = (resultado) => !resultado.count
): Promise<T> {
  let resultado: T;
  try {
    resultado = await conTimeout(ejecutar(), TIMEOUT_RED_MS);
  } catch (err) {
    if (err instanceof ErrorTimeoutRed) throw new Error(MENSAJE_SIN_RED);
    throw err;
  }
  if (resultado.error) throw new Error(resultado.error.message);
  let sesionSinConfirmar = false;
  for (let intento = 2; esFallo(resultado) && intento <= MAX_INTENTOS; intento++) {
    await esperar(ESPERA_ENTRE_INTENTOS_MS);
    try {
      const { error: errorRefresco } = await conTimeout(supabase.auth.refreshSession(), TIMEOUT_RED_MS);
      // Si el refresco de verdad falla (no un timeout de red, ya cubierto
      // abajo), la sesión está muerta de verdad — reintentar `ejecutar()`
      // con ella no va a arreglarse solo. Se corta el bucle ya: seguir
      // insistiendo solo tarda más en decir la verdad.
      sesionSinConfirmar = !!errorRefresco;
      resultado = await conTimeout(ejecutar(), TIMEOUT_RED_MS);
    } catch (err) {
      if (err instanceof ErrorTimeoutRed) throw new Error(MENSAJE_SIN_RED);
      throw err;
    }
    if (resultado.error) throw new Error(resultado.error.message);
    if (sesionSinConfirmar) break;
  }
  if (esFallo(resultado)) {
    if (sesionSinConfirmar) throw new Error(MENSAJE_SESION_CADUCADA);
    throw new Error(typeof mensajeSinFilas === 'string' ? mensajeSinFilas : mensajeSinFilas(resultado));
  }
  return resultado;
}

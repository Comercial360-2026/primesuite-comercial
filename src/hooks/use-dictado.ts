import { useCallback, useEffect, useRef, useState } from 'react';

// Dictado voz -> texto con la Web Speech API. En una visita, escribir en el
// móvil delante del cliente queda mal; dictar es lo natural.
//
// `onTexto(fragmento, { final })` se llama:
//   - con `final: false` mientras hablas — el texto PROVISIONAL que el
//     motor va reconociendo. El consumidor lo muestra en vivo pero NO lo
//     consolida (cambia y se corrige según sigues hablando). Se manda
//     también '' para limpiar lo provisional cuando ya está consolidado o
//     al reanudar.
//   - con `final: true` cuando el motor da por buena una frase — el
//     consumidor la añade de verdad al texto.
//
// CLAVE (Cesar, 2026-09-06): el motor de Chrome corta la escucha en cada
// pausa larga y dispara `onend`. Si no se reanuda, el dictado se para al
// hacer una pausa y lo provisional se pierde ("se queda en blanco"). Aquí
// se reanuda solo mientras el usuario no haya pulsado "parar", así que
// dictas seguido con pausas y todo lo dicho se va acumulando.
//
// `soportado` es false en navegadores sin la API (Firefox, algunos
// WebView) — ahí no se enseña el botón.

type ResultadoVoz = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
type ErrorVoz = { error?: string };
type Reconocedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: ResultadoVoz) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: ErrorVoz) => void) | null;
};
type CtorReconocedor = new () => Reconocedor;

function obtenerCtor(): CtorReconocedor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: CtorReconocedor;
    webkitSpeechRecognition?: CtorReconocedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictado(onTexto: (fragmento: string, opts: { final: boolean }) => void) {
  const [dictando, setDictando] = useState(false);
  // Antes este error se tragaba en silencio: el usuario hablaba, el motor
  // paraba por permiso denegado y no pasaba nada en pantalla, sin ninguna
  // pista de por qué. Se expone para que el consumidor pueda avisar.
  const [permisoDenegado, setPermisoDenegado] = useState(false);
  const refReconocedor = useRef<Reconocedor | null>(null);
  // El usuario quiere seguir dictando (no ha pulsado "parar"). Mientras sea
  // true, cada `onend` del motor reanuda la escucha.
  const quiereDictar = useRef(false);
  const soportado = obtenerCtor() != null;

  // `onTexto` cambia en cada render; se guarda en ref para que el handler
  // no quede fijado a una versión vieja del closure.
  const refOnTexto = useRef(onTexto);
  refOnTexto.current = onTexto;

  // Referencia estable a "arrancar una escucha nueva" — la usa `onend` para
  // reanudar sin depender de un closure viejo.
  const arrancarRef = useRef<() => void>(() => {});

  const arrancar = useCallback(() => {
    const Ctor = obtenerCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = 'es-ES';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let final = '';
      let provisional = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else provisional += t;
      }
      if (final.trim()) refOnTexto.current(final.trim(), { final: true });
      // Se manda SIEMPRE (aun vacío) para que el consumidor pinte lo que
      // se está diciendo ahora y lo borre en cuanto se consolida.
      refOnTexto.current(provisional.trim(), { final: false });
    };
    r.onend = () => {
      refOnTexto.current('', { final: false });
      if (quiereDictar.current) {
        // Pausa / corte del motor: reanuda con una instancia nueva, sin
        // que el usuario note nada. Pequeño respiro para no chocar con el
        // "recognition already started".
        setTimeout(() => {
          if (quiereDictar.current) arrancarRef.current();
        }, 150);
      } else {
        setDictando(false);
      }
    };
    r.onerror = (ev) => {
      // Permiso denegado / servicio no disponible: parar de verdad. El
      // resto ('no-speech', 'aborted') son normales entre frases y `onend`
      // se encarga de reanudar.
      if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
        quiereDictar.current = false;
        setDictando(false);
        setPermisoDenegado(true);
      }
    };
    refReconocedor.current = r;
    try {
      r.start();
    } catch {
      /* ya estaba iniciando: el onend anterior reanudará */
    }
    setDictando(true);
  }, []);
  arrancarRef.current = arrancar;

  const parar = useCallback(() => {
    quiereDictar.current = false;
    refReconocedor.current?.stop();
  }, []);

  const alternar = useCallback(() => {
    if (dictando) {
      parar();
      return;
    }
    if (!obtenerCtor()) return;
    setPermisoDenegado(false);
    quiereDictar.current = true;
    arrancar();
  }, [dictando, parar, arrancar]);

  useEffect(
    () => () => {
      quiereDictar.current = false;
      refReconocedor.current?.abort();
    },
    []
  );

  return { soportado, dictando, permisoDenegado, alternar, parar };
}

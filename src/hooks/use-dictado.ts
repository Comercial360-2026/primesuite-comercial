import { useCallback, useEffect, useRef, useState } from 'react';

// Dictado voz -> texto con la Web Speech API. En una visita, escribir en el
// móvil delante del cliente queda mal; dictar es lo natural.
//
// `onTexto(fragmento, { final })` se llama:
//   - con `final: false` mientras hablas — el texto PROVISIONAL que el
//     motor va reconociendo. El consumidor lo muestra en vivo pero NO lo
//     consolida (cambia y se corrige según sigues hablando). Se manda
//     también '' para limpiar lo provisional cuando ya está consolidado o
//     al parar.
//   - con `final: true` cuando el motor da por buena una frase — el
//     consumidor la añade de verdad al texto.
// Antes solo se llamaba al terminar de hablar: parecía que no hacía nada.
// `soportado` es false en navegadores sin la API (Firefox, algunos
// WebView) — ahí no se enseña el botón.

type ResultadoVoz = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
type Reconocedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: ResultadoVoz) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
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
  const refReconocedor = useRef<Reconocedor | null>(null);
  const soportado = obtenerCtor() != null;

  // `onTexto` cambia en cada render; se guarda en ref para que el handler
  // no quede fijado a una versión vieja del closure.
  const refOnTexto = useRef(onTexto);
  refOnTexto.current = onTexto;

  const parar = useCallback(() => {
    refReconocedor.current?.stop();
  }, []);

  const alternar = useCallback(() => {
    if (dictando) {
      parar();
      return;
    }
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
      setDictando(false);
    };
    r.onerror = () => {
      refOnTexto.current('', { final: false });
      setDictando(false);
    };
    refReconocedor.current = r;
    r.start();
    setDictando(true);
  }, [dictando, parar]);

  useEffect(() => () => refReconocedor.current?.abort(), []);

  return { soportado, dictando, alternar, parar };
}

import { useCallback, useEffect, useRef, useState } from 'react';

// Dictado voz -> texto con la Web Speech API. En una visita, escribir en el
// móvil delante del cliente queda mal; dictar es lo natural. `onTexto`
// recibe cada fragmento final reconocido para que quien lo use lo añada
// donde quiera. `soportado` es false en navegadores sin la API (Firefox,
// algunos WebView) — ahí no se enseña el botón.

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

export function useDictado(onTexto: (fragmento: string) => void) {
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
    r.interimResults = false;
    r.onresult = (e) => {
      let fragmento = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) fragmento += e.results[i][0].transcript;
      }
      const limpio = fragmento.trim();
      if (limpio) refOnTexto.current(limpio);
    };
    r.onend = () => setDictando(false);
    r.onerror = () => setDictando(false);
    refReconocedor.current = r;
    r.start();
    setDictando(true);
  }, [dictando, parar]);

  useEffect(() => () => refReconocedor.current?.abort(), []);

  return { soportado, dictando, alternar, parar };
}

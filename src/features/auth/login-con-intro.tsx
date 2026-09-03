import { useState } from 'react';
import { Login } from './login';
import { SplashIntro, debeVerseIntro } from './splash-intro';

// El login con la intro por encima. El login ya está montado debajo desde
// el primer frame, así que el beat 6 del storyboard ("aterriza en el
// login") es solo el desvanecido de la capa. La intro se ve una vez por
// sesión y respeta "reducir movimiento" (ver debeVerseIntro).
export function LoginConIntro() {
  const [intro, setIntro] = useState(debeVerseIntro);

  return (
    <>
      <Login />
      {intro && <SplashIntro onDone={() => setIntro(false)} />}
    </>
  );
}

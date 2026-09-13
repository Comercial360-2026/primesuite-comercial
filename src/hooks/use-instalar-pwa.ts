import { useEffect, useState } from 'react';

// Añadir PrimeNotes a la pantalla de inicio del móvil ("instalar" la PWA).
// El manifest ya está (vite.config.ts); esto es sólo el onboarding: detectar
// el móvil, ofrecer el diálogo nativo donde se puede (Android/Chrome) y dar
// instrucciones donde no (iOS: Apple no deja lanzarlo por código).

type PlataformaMovil = 'ios' | 'android' | 'otro';

// El evento `beforeinstallprompt` no está en lib.dom — se declara aquí.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CLAVE_DESCARTADO = 'primenotes:instalar-descartado';

export function plataformaMovil(): PlataformaMovil {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // El iPad moderno se anuncia como Mac: Mac + pantalla táctil = iPad.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'otro';
}

function yaInstalada(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// En iOS sólo Safari puede instalar PWAs (Chrome/Firefox iOS no).
export function esSafariIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) &&
    /safari/i.test(ua) &&
    !/crios|fxios|edgios|opios|brave/i.test(ua)
  );
}

function descartadoGuardado(): boolean {
  try {
    return localStorage.getItem(CLAVE_DESCARTADO) === '1';
  } catch {
    return false;
  }
}

export function useInstalarPwa() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalada, setInstalada] = useState(yaInstalada);
  const [descartado, setDescartado] = useState(descartadoGuardado);

  useEffect(() => {
    const alPrompt = (e: Event) => {
      // Sin esto, Chrome pinta su propia mini-infobar; queremos nuestro botón.
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const alInstalar = () => setInstalada(true);
    window.addEventListener('beforeinstallprompt', alPrompt);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alPrompt);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  function descartar() {
    setDescartado(true);
    try {
      localStorage.setItem(CLAVE_DESCARTADO, '1');
    } catch {
      /* modo privado: se volverá a ver, asumido */
    }
  }

  async function instalar() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }

  const plataforma = plataformaMovil();
  const puedeInstalarNativo = !!promptEvent;
  // Se ofrece si: móvil, no instalada, no descartada, y o bien Android tiene
  // el diálogo listo, o bien es iOS (siempre hay instrucciones que dar).
  const visible =
    !instalada &&
    !descartado &&
    ((plataforma === 'android' && puedeInstalarNativo) || plataforma === 'ios');

  return { visible, plataforma, safariIOS: esSafariIOS(), puedeInstalarNativo, instalar, descartar };
}

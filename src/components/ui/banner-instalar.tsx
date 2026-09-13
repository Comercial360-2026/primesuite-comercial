import { useInstalarPwa } from '@/hooks/use-instalar-pwa';

// Banner en la cáscara (sobre la barra de abajo). Sale UNA vez, en el móvil,
// si PrimeNotes no está ya "instalada" en la pantalla de inicio. Se descarta
// y no vuelve (localStorage). Cómo se instala vive también en /ayuda
// (concepto "instalar-app"), para quien lo cierre y luego lo quiera.
export function BannerInstalar() {
  const { visible, plataforma, safariIOS, puedeInstalarNativo, instalar, descartar } = useInstalarPwa();
  if (!visible) return null;

  return (
    <div className="banner-instalar">
      <p className="banner-instalar__texto">
        {plataforma === 'android' && puedeInstalarNativo && (
          <>Ten PrimeNotes como una app: se abre de un toque y va más fina.</>
        )}
        {plataforma === 'ios' && safariIOS && (
          <>
            Ten PrimeNotes como una app: pulsa <b>Compartir</b> y luego{' '}
            <b>«Añadir a pantalla de inicio»</b>.
          </>
        )}
        {plataforma === 'ios' && !safariIOS && (
          <>
            Para tener PrimeNotes como una app, abre esta página en <b>Safari</b> y usa{' '}
            <b>Compartir → «Añadir a pantalla de inicio»</b>.
          </>
        )}
      </p>
      <div className="banner-instalar__acciones">
        {plataforma === 'android' && puedeInstalarNativo && (
          <button type="button" className="btn btn-primary banner-instalar__btn" onClick={instalar}>
            Instalar
          </button>
        )}
        <button type="button" className="banner-instalar__cerrar" onClick={descartar}>
          {plataforma === 'ios' ? 'Entendido' : 'Ahora no'}
        </button>
      </div>
    </div>
  );
}

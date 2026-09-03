// Marca de Primion y lockup de PrimeNotes.
//
// El SVG de Primion es el oficial (src/assets/logo-primion.svg), aquí
// inline y recoloreado a `currentColor` para que herede el azul de marca
// y se pueda animar por partes. El icono —el punto + el doble chevron— es
// la forma compartida: PrimeNotes reusa ese mismo icono y pone su palabra
// al lado.
//
// La palabra "PrimeNotes" va como texto en Avenir Next (la que más se
// parece al logotipo de Primion — sans geométrica de x-alta grande, punto
// de la "i" redondo; ver comparativa que se hizo con el SVG real). Es
// fuente de sistema en Apple (destino principal); en Android/Windows cae a
// system-ui. Provisional hasta que exista un logotipo propio de PrimeNotes.
const FUENTE_MARCA = "'Avenir Next', 'Avenir', system-ui, sans-serif";

interface Props {
  /** Alto en píxeles del lockup. El ancho se ajusta solo. */
  alto?: number;
  className?: string;
}

// --- Icono compartido (punto + doble chevron), coords del SVG de Primion,
//     recentradas a una caja 0 0 52 44 para poder colocarlo suelto. ---
export function IconoMarca({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="200 24 60 64"
      width={(size * 60) / 64}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <circle cx="212.548" cy="55.972" r="12.025" />
      <path d="M227.494,24.02l-7.239,7.239,21.943,21.943c1.529,1.53,1.529,4.009,0,5.539l-21.943,21.943,7.239,7.239,31.952-31.952-31.952-31.951Z" />
    </svg>
  );
}

// --- Logo Primion completo (palabra + icono), tal cual el original. ---
export function LogoPrimion({ alto = 40, className }: Props) {
  return (
    <svg
      viewBox="0 0 283.465 111.943"
      height={alto}
      width={(alto * 283.465) / 111.943}
      fill="currentColor"
      className={className}
      role="img"
      aria-label="Primion"
    >
      <path d="M36.729,43.913c-2.979,0-5.789.961-7.999,2.739-.144-1.465-1.201-2.21-3.099-2.21h-1.61v31.758h5.045v-10.762c2.138,1.634,4.829,2.522,7.663,2.522,7.063,0,12.348-5.189,12.348-12.059s-5.309-11.988-12.348-11.988ZM36.729,63.491c-4.108,0-7.207-3.267-7.207-7.591s3.099-7.519,7.207-7.519,7.231,3.219,7.231,7.519-3.099,7.591-7.231,7.591ZM145.046,43.913c-7.039,0-12.323,5.141-12.323,11.963s5.285,12.059,12.323,12.059,12.372-5.189,12.372-12.059-5.333-11.963-12.372-11.963ZM145.046,63.491c-4.108,0-7.183-3.267-7.183-7.591s3.099-7.519,7.183-7.519,7.255,3.219,7.255,7.519-3.123,7.591-7.255,7.591ZM64.548,44.418v5.136c-1.671-.374-5.67.261-5.79,4.328v13.549h-5.045v-23.013h1.706c2.272,0,2.829,1.213,2.955,2.066,2.21-2.45,6.174-2.066,6.174-2.066ZM74.324,47.66v19.794h-1.802c-2.186,0-3.219-1.009-3.219-3.195v-19.818h1.802c2.186,0,3.219,1.033,3.219,3.219ZM74.864,38.244c0,1.685-1.366,3.051-3.051,3.051s-3.051-1.366-3.051-3.051,1.366-3.051,3.051-3.051,3.051,1.366,3.051,3.051ZM127.438,47.66v19.794h-1.802c-2.186,0-3.195-1.009-3.195-3.195v-19.818h1.802c2.186,0,3.195,1.033,3.195,3.219ZM127.99,38.244c0,1.685-1.366,3.051-3.051,3.051s-3.051-1.366-3.051-3.051,1.366-3.051,3.051-3.051,3.051,1.366,3.051,3.051ZM181.824,53.355v14.101h-1.777c-2.186,0-3.195-1.034-3.195-3.22v-10.33c0-2.666-2.162-4.853-4.853-4.853s-4.853,2.162-4.853,4.853v13.549h-5.021v-23.013h1.706c2.272,0,2.829,1.213,2.955,2.066,1.537-1.585,3.507-2.426,5.765-2.426,5.117,0,9.273,4.18,9.273,9.273ZM115.57,53.355v14.101h-1.777c-2.186,0-3.195-1.034-3.195-3.22v-10.33c0-2.666-2.162-4.853-4.853-4.853s-4.853,2.162-4.853,4.853v13.549h-1.778c-2.186,0-3.219-1.009-3.219-3.195v-10.354c0-2.666-2.186-4.853-4.853-4.853s-4.853,2.162-4.853,4.853v13.549h-4.997v-23.013h1.586c1.826,0,2.859.697,3.075,2.042,1.249-1.273,3.171-2.426,5.501-2.426s5.405,1.513,7.087,4.516c1.658-2.811,4.564-4.516,7.879-4.516,5.117,0,9.25,4.204,9.25,9.297Z" />
      <path d="M227.494,24.02l-7.239,7.239,21.943,21.943c1.529,1.53,1.529,4.009,0,5.539l-21.943,21.943,7.239,7.239,31.952-31.952-31.952-31.951Z" />
      <circle cx="212.548" cy="55.972" r="12.025" />
    </svg>
  );
}

// --- Lockup de PrimeNotes: icono compartido + palabra. ---
export function LogoPrimeNotes({ alto = 40, className }: Props) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: alto * 0.22, color: 'currentColor' }}
      role="img"
      aria-label="PrimeNotes"
    >
      <IconoMarca size={alto} />
      <span
        style={{
          fontFamily: FUENTE_MARCA,
          fontSize: alto * 0.6,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        PrimeNotes
      </span>
    </span>
  );
}

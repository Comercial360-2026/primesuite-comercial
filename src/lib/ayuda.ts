// Fuente única de la ayuda in-app. De este fichero salen, sin divergir:
//
//   1. El "?" de la cabecera de una pantalla → <BotonAyuda> abre un Modal
//      con la EntradaPantalla ("qué es / cuándo / ojo").
//   2. Las notas al pie de un campo que no se explica solo →
//      <AyudaNota concepto="…" /> muestra el `queEs` del EntradaConcepto.
//   3. La pantalla /ayuda ("Cómo funciona PrimeNotes") → recorre estos dos
//      mapas, los agrupa y deja buscar.
//
// Añadir ayuda a algo nuevo = una entrada aquí, EN EL MISMO COMMIT que el
// cambio de comportamiento. Un texto de ayuda que ya no es cierto es un bug
// (ver CLAUDE.md y docs/08_sistema_diseno.md §"Prueba de usuario").
//
// Escrito para el comercial —- la persona que visita clientes-—, no para
// quien programa: nada de jerga de producto ni de base de datos.
//
// `npm run ayuda:cobertura` lista qué pantallas con cabecera todavía no
// tienen entrada aquí.

export interface EntradaPantalla {
  /** Nombre visible en /ayuda. En frase: "Cerrar una visita". */
  titulo: string;
  /** Qué es esta pantalla, en una o dos frases. */
  queEs: string;
  /** Qué haces aquí / cuándo la usas. */
  cuando: string;
  /** Un aviso: el error que la gente comete, algo que no se puede deshacer. */
  ojo?: string;
  /** Solo la usa Dirección Comercial → no sale en el manual de un comercial. */
  soloDireccion?: boolean;
}

export interface EntradaConcepto {
  /** Nombre visible en /ayuda. En frase: "Naturaleza de un hallazgo". */
  titulo: string;
  /** Qué significa. Es también el texto que sale como <AyudaNota>. */
  queEs: string;
  /** Cuándo aplica, si no es evidente. */
  cuando?: string;
  /** Un caso concreto que lo aterriza. */
  ejemplo?: string;
  /** Solo lo maneja Dirección Comercial. */
  soloDireccion?: boolean;
}

// Clave = un id estable y legible. Se usa tal cual en `ayuda="…"` de las
// cabeceras, así que cambiar una clave obliga a cambiar la pantalla que la
// referencia (lo cazaría el compilador).
//
// El objeto `_PANTALLAS` con `satisfies` conserva las claves literales (de
// ahí sale `PantallaAyudaId`); `PANTALLAS` lo re-expone con valor uniforme
// `EntradaPantalla` para poder leer `.ojo` sin que TS estreche de más.
const _PANTALLAS = {
  yo: {
    titulo: 'Yo',
    queEs:
      'Tu pantalla personal: quién eres, cuánto ocupan tus visitas y, si diriges el equipo, los accesos de gestión.',
    cuando:
      'Para cerrar sesión, ver si tienes algo sin sincronizar, o entrar a las herramientas del equipo.',
  },
  deduplicacion: {
    titulo: 'Clientes duplicados',
    queEs:
      'La app agrupa aquí las fichas de cliente con prácticamente el mismo nombre —da igual mayúsculas, acentos o el «S.L.» / «S.A.» del final—, porque suelen ser el mismo cliente dado de alta dos veces.',
    cuando:
      'Cuando salta el aviso de duplicados. En cada grupo tocas la ficha que quieres conservar (viene marcada la que más visitas tiene) y pulsas «Fusionar en la marcada». Si alguna ficha del grupo está vacía, «Quitar sin datos» la retira sin más trámite.',
    ojo: 'Al fusionar, las visitas, oportunidades, hallazgos, contactos y ubicaciones de las otras fichas pasan a la que se queda, y las demás desaparecen de la lista de clientes. No se puede deshacer desde la app: antes de confirmar, asegúrate de que de verdad son el mismo negocio.',
    soloDireccion: true,
  },
  'cierre-visita': {
    titulo: 'Cerrar una visita',
    queEs:
      'El repaso de todo lo que has capturado en la visita —fotos, audios, notas, hallazgos, oportunidades y próximos pasos— antes de darla por terminada.',
    cuando:
      'Nada más salir del cliente. Compruebas el recuento (zona por zona si has usado el recorrido), pulsas «Consolidar visita» y confirmas.',
    ojo: 'Al cerrar, la visita queda fija y pasa a solo lectura: lo que no hayas capturado ya no se le puede añadir. Revisa bien el recuento antes de confirmar. Las oportunidades y los próximos pasos siguen vivos después: se trabajan desde el cliente, no desde la visita. Si cierras sin cobertura no pasa nada: se guarda en el móvil y se confirma sola en cuanto vuelvas a tener red.',
  },
} satisfies Record<string, EntradaPantalla>;

const _CONCEPTOS = {
  'naturaleza-hallazgo': {
    titulo: 'Naturaleza de un hallazgo',
    queEs:
      'Qué tipo de cosa has observado en el cliente: contexto (información de fondo), oportunidad (algo que podrías venderle), riesgo (algo que te puede hacer perder la cuenta), competencia (producto de otro proveedor), fortaleza (algo que juega a tu favor) o proyecto activo (una obra o cambio en marcha).',
    ejemplo:
      'Ves lectores de otra marca en las puertas → competencia. El cliente comenta que abren otra nave → oportunidad.',
  },
  'tipo-fecha-hallazgo': {
    titulo: 'Fecha relevante de un hallazgo',
    queEs:
      'Si lo que has observado tiene una fecha que conviene tener presente —un contrato que vence, una renovación, una auditoría, un presupuesto en juego, una implantación prevista—, la anotas y marcas de qué tipo es. Queda guardada en el hallazgo y sale en el informe de la visita.',
    ejemplo:
      'El cliente comenta que su contrato con el proveedor actual termina en marzo → fecha relevante = marzo, tipo = «vencimiento de contrato».',
  },
  'horizonte-decision': {
    titulo: 'Horizonte de decisión',
    queEs:
      'Tu estimación de cuándo decidirá el cliente sobre esta oportunidad: 0-3 meses, 3-6, 6-12, más de 12, o sin fecha definida. No es un compromiso; sirve para saber a qué darle prioridad y no dejar enfriar lo que está caliente.',
    ejemplo:
      'El cliente quiere cerrar antes de fin de trimestre → 0-3 meses. Está «viendo opciones para el año que viene» → 6-12 meses.',
  },
  'semaforo-cliente': {
    titulo: 'El estado del cliente',
    queEs:
      'La etiqueta que resume cómo va cada cliente: con oportunidad abierta, en seguimiento, o sin visitar. Manda la palabra; el color solo acompaña.',
  },
  'modo-recorrido': {
    titulo: 'Modo recorrido',
    queEs:
      'Una forma de hacer la visita andando por zonas del cliente (entrada, almacén, oficinas…). Todo lo que capturas queda atado a la zona en la que estás, y al cerrar lo repasas zona por zona.',
    cuando: 'Útil en clientes grandes o cuando visitas varias áreas y quieres el informe ordenado por sitio.',
  },
  sincronizacion: {
    titulo: 'Trabajar sin conexión',
    queEs:
      'Lo que capturas se guarda primero en el móvil y se sube al servidor en cuanto hay conexión, reintentándolo solo. Mientras algo siga sin subir, comprueba tu conexión y no reinstales la app en ese teléfono.',
    cuando:
      'PrimeNotes se puede usar entera sin cobertura: haces la visita con normalidad y todo sube al recuperar señal, sin pulsar nada. En «Yo» es donde compruebas si queda algo pendiente.',
    ejemplo:
      'Visitas un polígono sin cobertura, capturas 12 fotos y 3 hallazgos y cierras la visita. Al volver al coche y recuperar señal, todo sube solo en segundo plano.',
  },
} satisfies Record<string, EntradaConcepto>;

export type PantallaAyudaId = keyof typeof _PANTALLAS;
export type ConceptoAyudaId = keyof typeof _CONCEPTOS;

export const PANTALLAS: Record<PantallaAyudaId, EntradaPantalla> = _PANTALLAS;
export const CONCEPTOS: Record<ConceptoAyudaId, EntradaConcepto> = _CONCEPTOS;

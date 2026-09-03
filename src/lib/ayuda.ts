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
  hoy: {
    titulo: 'Hoy',
    queEs:
      'Tu punto de partida del día: la visita en curso o la siguiente («Ahora»), las planificadas para hoy, las atrasadas y un vistazo a las próximas.',
    cuando:
      'Al empezar la jornada y entre visita y visita. Tocar una visita te lleva a prepararla o a retomarla; «Empezar visita sin planificar» abre la lista de clientes para arrancar una sobre la marcha. Si diriges el equipo, «Solo mías / Todas» amplía la vista.',
  },
  agenda: {
    titulo: 'Agenda',
    queEs:
      'Todas tus visitas planificadas, en lista por días o en vista de mes, con las atrasadas agrupadas aparte.',
    cuando:
      'Para ver más allá de hoy, reprogramar o anular. «Planificar visita» abre un buscador de cliente para dejar una agendada; «Seleccionar» permite anular varias a la vez.',
  },
  'repaso-cliente': {
    titulo: 'Preparar la visita',
    queEs:
      'Un vistazo rápido al cliente justo antes de entrar: a qué vas, los contactos conocidos, su ecosistema, la oportunidad activa y el próximo paso pendiente.',
    cuando:
      'Al llegar al cliente, antes de darle a «Iniciar visita». Desde aquí arranca la visita en curso.',
  },
  'mis-proximos-pasos': {
    titulo: 'Mis próximos pasos',
    queEs:
      'Tus tareas pendientes de las visitas —llamar, enviar propuesta, volver a pasar—, ordenadas por urgencia: vencidas, esta semana, más adelante, y las que ya tienen una revisita en la agenda.',
    cuando:
      'Para ir cerrando lo que dejaste apuntado. La marca de verificación a la derecha de cada fila la da por hecha; tocar el texto abre el detalle.',
  },
  clientes: {
    titulo: 'Clientes',
    queEs:
      'La lista de tus cuentas. Cada fila lleva a la ficha del cliente y muestra su estado con una etiqueta: «Con oportunidad», «En seguimiento» o «Sin visitar».',
    cuando:
      'Para buscar un cliente y entrar en su ficha. Si diriges el equipo, «Solo míos / Todos» cambia entre tu cartera y la de todos, y ahí ves quién lleva cada cuenta.',
  },
  'ficha-cliente': {
    titulo: 'Ficha de cliente',
    queEs:
      'Todo lo del cliente en un sitio: sus datos, oportunidades activas, próximos pasos, su ecosistema (qué tiene instalado y de quién) y el historial de visitas.',
    cuando:
      'Antes o después de visitarlo. Desde abajo arrancas una visita ahora o la planificas para otro día; en «Más» están sus ubicaciones.',
    ojo: '«Borrar cliente» elimina la ficha y su historial y no se puede deshacer; úsalo solo con fichas creadas por error. Si son dos fichas del mismo cliente, no la borres: lo resuelve Dirección Comercial juntándolas.',
  },
  'alta-rapida-cliente': {
    titulo: 'Nuevo cliente',
    queEs:
      'Da de alta un cliente con solo el nombre. Mientras escribes, te avisa si ya hay uno igual o parecido para que no lo dupliques.',
    cuando:
      'Cuando vas a visitar a alguien que no está en la lista. Puedes guardarlo e iniciar la visita al momento, guardarlo y planificarla, o solo guardarlo. El resto de la ficha (sector, tamaño, ubicación) se rellena después.',
  },
  'gestion-ubicaciones-cliente': {
    titulo: 'Ubicaciones del cliente',
    queEs:
      'Las zonas de las instalaciones del cliente (entrada, almacén, oficinas…) que usa el modo recorrido para ordenar lo que capturas.',
    cuando:
      'Para dejarlas preparadas antes de una visita con recorrido, o para renombrarlas o borrarlas después. También se pueden crear sobre la marcha durante el recorrido.',
    ojo: 'Borrar una ubicación con fotos, audios o hallazgos asociados los deja sin zona; te avisa de cuántos antes de confirmar.',
  },
  'cierre-visita': {
    titulo: 'Cerrar una visita',
    queEs:
      'El repaso de todo lo que has capturado en la visita —fotos, audios, notas, hallazgos, oportunidades y próximos pasos— antes de darla por terminada.',
    cuando:
      'Nada más salir del cliente. Compruebas el recuento (zona por zona si has usado el recorrido), pulsas «Consolidar visita» y confirmas.',
    ojo: 'Al cerrar, la visita queda fija y pasa a solo lectura: lo que no hayas capturado ya no se le puede añadir. Revisa bien el recuento antes de confirmar. Las oportunidades y los próximos pasos siguen vivos después: se trabajan desde el cliente, no desde la visita. Si cierras sin cobertura no pasa nada: se guarda en el móvil y se confirma sola en cuanto vuelvas a tener red.',
  },
  'visita-activa': {
    titulo: 'Visita en curso',
    queEs:
      'La pantalla desde la que capturas todo mientras estás con el cliente: fotos, audios, notas, hallazgos, oportunidades y próximos pasos. Arriba tienes el objetivo con el que ibas y los contactos de la visita.',
    cuando:
      'Durante la visita. Cada botón de la rejilla «añadir a la visita» abre una captura rápida, y lo que vas metiendo se lista debajo. Al terminar, «Cerrar visita».',
    ojo: 'Todo se guarda sobre la marcha, también sin cobertura. No cierres la visita hasta haberlo capturado todo: una vez cerrada no se le añade nada.',
  },
  'visita-planificada': {
    titulo: 'Visita planificada',
    queEs:
      'Una visita que has dejado agendada para otro día: a qué cliente, cuándo y con qué objetivo.',
    cuando:
      'Para reprogramarla, cancelarla o empezarla. Si es hoy, «Iniciar visita» te lleva a la preparación; si es para más adelante, puedes empezarla igualmente pero te lo pregunta antes.',
    ojo: 'Cancelar una visita planificada la borra y no se puede deshacer.',
  },
  'visita-cerrada': {
    titulo: 'Visita cerrada',
    queEs:
      'El resumen de solo lectura de una visita ya terminada: objetivo, oportunidades, hallazgos, próximos pasos y el anexo con notas, fotos y audios. Es lo mismo que sale en el informe en PDF.',
    cuando:
      'Para consultar qué pasó en una visita, abrir una oportunidad o un hallazgo concretos, o descargar el informe y pasarlo a otras áreas.',
    ojo: '«Borrar esta visita» la elimina entera —con sus fotos, audios y notas— y no se puede deshacer.',
  },
  'detalle-captura': {
    titulo: 'Foto, audio o nota',
    queEs:
      'Una captura suelta de la visita. En las notas puedes editar el texto; en fotos y audios, el título.',
    cuando: 'Para revisar o retocar algo que capturaste, o borrarlo si te has equivocado.',
  },
  'detalle-hallazgo': {
    titulo: 'Hallazgo',
    queEs:
      'Algo que has observado en el cliente y quieres dejar registrado: su naturaleza (contexto, oportunidad, riesgo…), una nota, en qué zona estaba y, si aplica, una fecha relevante.',
    cuando:
      'Para completar o corregir un hallazgo. Se crea durante la visita, desde el botón «Hallazgo».',
  },
  'detalle-oportunidad': {
    titulo: 'Oportunidad',
    queEs:
      'Una venta posible con el cliente: su título, en qué etapa está, su prioridad, el horizonte de decisión, y qué tiene ya el cliente y qué solución le proponemos.',
    cuando:
      'Para mover la oportunidad de etapa según avanza, ajustar la previsión, o cerrarla como ganada o perdida (ahí se pide el motivo).',
  },
  'proximo-paso': {
    titulo: 'Próximo paso',
    queEs:
      'Una tarea que quedó pendiente de una visita: qué hay que hacer y, si quieres, para cuándo. Aparece en «Tareas».',
    cuando:
      'Para editarla, marcarla como hecha, o —si en realidad es volver a ver al cliente— convertirla en una visita planificada para su fecha.',
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
      'La etiqueta junto a cada cliente resume cómo va: «Con oportunidad» (tiene al menos una oportunidad abierta), «En seguimiento» (sin oportunidad abierta pero visitado en los últimos 3 meses) o «Sin visitar» (sin oportunidad y más de 3 meses sin visita, o nunca visitado). Mandan la palabra y la forma del icono; el color solo acompaña.',
    ejemplo:
      'Cierras la última oportunidad de un cliente como ganada o perdida → deja de estar «Con oportunidad» y pasa a «En seguimiento».',
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
  'interlocutor-participante': {
    titulo: 'Interlocutores y participantes',
    queEs:
      'Interlocutores = personas del cliente (con su cargo y su papel: decisor, técnico, compras…); se guardan en su ficha y sirven para las siguientes visitas. Participantes = compañeros de tu equipo en esta visita en concreto; los añade Dirección Comercial.',
  },
  'etapa-oportunidad': {
    titulo: 'Etapa de una oportunidad',
    queEs:
      'Por dónde va la venta: latente (todavía es una idea), cualificada (hay interés real y encaja), en propuesta (ya le has pasado oferta) y, al cerrar, ganada, perdida o descartada.',
  },
  'prioridad-oportunidad': {
    titulo: 'Prioridad de una oportunidad',
    queEs:
      'Cuánto foco merece: baja, media, alta o estratégica. Ordena tu lista de oportunidades y ayuda a Dirección a ver dónde está lo importante. No la confundas con el horizonte de decisión, que es el «cuándo».',
  },
} satisfies Record<string, EntradaConcepto>;

export type PantallaAyudaId = keyof typeof _PANTALLAS;
export type ConceptoAyudaId = keyof typeof _CONCEPTOS;

export const PANTALLAS: Record<PantallaAyudaId, EntradaPantalla> = _PANTALLAS;
export const CONCEPTOS: Record<ConceptoAyudaId, EntradaConcepto> = _CONCEPTOS;

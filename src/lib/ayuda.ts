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

// Los bloques en que /ayuda parte la lista. El orden de esta lista es el
// orden en que salen; dentro de cada bloque, las entradas siguen el flujo
// real de uso (no alfabético). Añadir una entrada nueva = elegirle grupo.
export type GrupoPantalla = 'dia' | 'tu' | 'cliente' | 'visita' | 'registro' | 'direccion';
export type GrupoConcepto = 'visita' | 'oportunidad' | 'planificar' | 'app';

export const GRUPOS_PANTALLA: { id: GrupoPantalla; titulo: string }[] = [
  { id: 'dia', titulo: 'El día a día' },
  { id: 'tu', titulo: 'Tú y tu espacio' },
  { id: 'cliente', titulo: 'Un cliente' },
  { id: 'visita', titulo: 'Una visita, paso a paso' },
  { id: 'registro', titulo: 'Lo que registras en una visita' },
  { id: 'direccion', titulo: 'Si diriges el equipo' },
];
export const GRUPOS_CONCEPTO: { id: GrupoConcepto; titulo: string }[] = [
  { id: 'visita', titulo: 'Durante la visita' },
  { id: 'oportunidad', titulo: 'Oportunidades y vocabulario' },
  { id: 'planificar', titulo: 'Planificar y hacer seguimiento' },
  { id: 'app', titulo: 'La app por dentro' },
];

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
  /** Bloque de /ayuda en el que aparece (ver GRUPOS_PANTALLA). */
  grupo: GrupoPantalla;
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
  /** Bloque de /ayuda en el que aparece (ver GRUPOS_CONCEPTO). */
  grupo: GrupoConcepto;
}

// Clave = un id estable y legible. Se usa tal cual en `ayuda="…"` de las
// cabeceras, así que cambiar una clave obliga a cambiar la pantalla que la
// referencia (lo cazaría el compilador).
//
// El objeto `_PANTALLAS` con `satisfies` conserva las claves literales (de
// ahí sale `PantallaAyudaId`); `PANTALLAS` lo re-expone con valor uniforme
// `EntradaPantalla` para poder leer `.ojo` sin que TS estreche de más.
const _PANTALLAS = {
  // — El día a día —
  hoy: {
    grupo: 'dia',
    titulo: 'Hoy',
    queEs:
      'Tu punto de partida del día: la visita en curso o la siguiente («Ahora»), las planificadas para hoy, las atrasadas y un vistazo a las próximas.',
    cuando:
      'Al empezar la jornada y entre visita y visita. Tocar una visita te lleva a prepararla o a retomarla; «Empezar visita sin planificar» abre la lista de clientes para arrancar una sobre la marcha. Si diriges el equipo, «Solo mías / Todas» amplía la vista.',
  },
  agenda: {
    grupo: 'dia',
    titulo: 'Agenda',
    queEs:
      'Todas tus visitas planificadas, en lista por días o en vista de mes, con las atrasadas agrupadas aparte.',
    cuando:
      'Para ver más allá de hoy, reprogramar o anular. «Planificar visita» abre un buscador de cliente para dejar una visita agendada; «Seleccionar» permite anular varias a la vez.',
  },
  clientes: {
    grupo: 'dia',
    titulo: 'Clientes',
    queEs:
      'La lista de tus cuentas (tu cartera). Cada fila lleva a la ficha del cliente y muestra su estado con una etiqueta: «Con oportunidad», «En seguimiento» o «Sin visitar».',
    cuando:
      'Para entrar en la ficha de un cliente. La lista muestra por defecto tu cartera, pero el buscador encuentra CUALQUIER cliente de la empresa — útil para cubrir a un compañero o para comprobar si ya existe antes de darlo de alta. Si diriges el equipo, «Solo míos / Todos» cambia la vista y ahí ves quién lleva cada cuenta.',
  },
  'mis-proximos-pasos': {
    grupo: 'dia',
    titulo: 'Mis próximos pasos',
    queEs:
      'Lo que quedó pendiente de las visitas —llamar, enviar propuesta, volver a pasar—, ordenado por urgencia: vencidos, esta semana, más adelante, y los que ya tienen una revisita en la agenda.',
    cuando:
      'Para ir cerrando lo que dejaste apuntado. La marca de verificación a la derecha de cada fila la da por hecha; tocar el texto abre el detalle.',
  },

  // — Tú y tu espacio —
  yo: {
    grupo: 'tu',
    titulo: 'Yo',
    queEs:
      'Tu pantalla personal: quién eres, cuánto ocupan tus visitas, «Reportar un problema» para avisar a Dirección de que algo falla, y —si diriges el equipo— los accesos de gestión y los partes que han mandado los comerciales. Al pie, la versión de la app: dila cuando reportes un fallo.',
    cuando:
      'Para cerrar sesión, ver si tienes algo sin sincronizar, contar un problema o entrar a las herramientas del equipo.',
  },
  'mi-espacio': {
    grupo: 'tu',
    titulo: 'Mi espacio',
    queEs:
      'Cuánto ocupan tus visitas y cuánto le queda al equipo del espacio común. Debajo, tus visitas ordenadas por lo que pesan (sobre todo fotos y audios).',
    cuando:
      'Cuando el equipo va justo de espacio o te piden liberar. Marcas las visitas viejas que ya no necesites en la app, descargas las que quieras conservar y las borras.',
    ojo: 'Borrar una visita aquí se la lleva con sus fotos y audios y no se puede deshacer. Descárgala antes si te importa.',
  },

  // — Un cliente —
  'alta-rapida-cliente': {
    grupo: 'cliente',
    titulo: 'Nuevo cliente',
    queEs:
      'Da de alta un cliente con solo el nombre. Mientras escribes, te avisa si ya hay uno igual o parecido para que no lo dupliques. El cliente queda a tu nombre como responsable; Dirección puede reasignarlo luego.',
    cuando:
      'Cuando vas a visitar a alguien que no está en la lista. Puedes guardarlo e iniciar la visita al momento, guardarlo y planificarla, o solo guardarlo. El resto de la ficha (sector, tamaño, ubicación) se rellena después.',
  },
  'ficha-cliente': {
    grupo: 'cliente',
    titulo: 'Ficha de cliente',
    queEs:
      'Los datos del cliente (nombre, sector, tamaño, ubicación general), sus proyectos (líneas de negocio: mantenimiento, obra nueva, postventa…), sus interlocutores (las personas de contacto, con cargo y teléfono) y su ecosistema (qué tiene instalado y de quién). Un cliente siempre tiene al menos un proyecto — si nunca has creado ninguno, es el que se llama «General».',
    cuando:
      'Si el cliente solo tiene el proyecto «General», aquí mismo ves sus oportunidades, hallazgos, próximos pasos e historial de visitas, y arrancas o planificas una visita desde abajo. Cuando hay más de un proyecto, cada uno tiene su propia ficha: entra en el que toque. «Nuevo proyecto» abre otra línea de negocio del mismo cliente. «Editar datos» rellena sector, tamaño y ubicación (salen en la cabecera de cada informe); lo puede hacer el comercial responsable o Dirección, y necesita conexión.',
    ojo: '«Borrar cliente» elimina la ficha, todos sus proyectos y su historial, y no se puede deshacer; úsalo solo con fichas creadas por error. Si son dos fichas del mismo cliente, no la borres: lo resuelve Dirección Comercial juntándolas.',
  },
  'ficha-proyecto': {
    grupo: 'cliente',
    titulo: 'Ficha de proyecto',
    queEs:
      'Una línea de negocio dentro de un cliente: sus oportunidades activas, hallazgos, próximos pasos y el historial de visitas de ESE proyecto (no de todo el cliente). Un cliente con un solo proyecto (el «General») no tiene esta pantalla aparte: su actividad se ve en la propia ficha de cliente.',
    cuando:
      'Antes o después de visitar por este proyecto. Desde abajo arrancas una visita ahora o la planificas para otro día. En «Hallazgos» solo salen los vigentes; «Ver archivados» muestra los que se dieron por pasados.',
  },

  // — Una visita, paso a paso —
  'planificar-visita': {
    grupo: 'visita',
    titulo: 'Nueva visita',
    queEs:
      'El único sitio para crear una visita: eliges el cliente, el proyecto (solo si tiene más de uno) y cuándo. «Ahora» pide solo el objetivo y arranca la visita en curso. «Otro día» pide además fecha, hora u orientación (mañana/tarde) y —si diriges el equipo— para quién; queda agendada y aparece en la Agenda y en «Hoy» ese día.',
    cuando:
      'Se abre desde el «+» de «Hoy» y de la Agenda, o al dar de alta un cliente con «Guardar y planificar visita». «Otro día» necesita conexión; «Ahora» funciona sin cobertura (se sincroniza luego).',
  },
  'visita-planificada': {
    grupo: 'visita',
    titulo: 'Visita planificada',
    queEs:
      'Una visita que has dejado agendada para otro día: a qué cliente, cuándo y con qué objetivo.',
    cuando:
      'Para reprogramarla, cancelarla o empezarla. Si es hoy, «Iniciar visita» te lleva a la preparación; si es para más adelante, puedes empezarla igualmente pero te lo pregunta antes.',
    ojo: 'Cancelar una visita planificada la borra y no se puede deshacer.',
  },
  'repaso-cliente': {
    grupo: 'visita',
    titulo: 'Preparar la visita',
    queEs:
      'Un vistazo rápido al cliente justo antes de entrar: a qué vas, los contactos conocidos, su ecosistema, la oportunidad activa y el próximo paso pendiente.',
    cuando:
      'Al llegar al cliente, antes de pulsar «Iniciar visita». Desde aquí arranca la visita en curso.',
  },
  'visita-activa': {
    grupo: 'visita',
    titulo: 'Visita en curso',
    queEs:
      'La pantalla desde la que capturas todo mientras estás con el cliente. Lo primero y en grande, «Captura lo que veas»: seis botones iguales —foto, nota, audio, hallazgo, oportunidad, próximo paso—. Debajo, el contexto: el objetivo con el que ibas (tócalo para matizarlo) y dos botones para interlocutores y equipo. Más abajo, «En esta visita», con todo lo capturado (lo tuyo y lo de tus compañeros) en una sola lista, y al final «Cerrar visita». Si estás recorriendo instalaciones, «Marcar zonas» saca una casilla para atar cada captura al sitio; si no, todo va a «General».',
    cuando:
      'Durante la visita. Cada botón de «Captura lo que veas» abre una captura rápida, y lo que vas metiendo aparece en «En esta visita» según lo capturas. En la nota puedes dictar en vez de escribir. Al terminar, «Cerrar visita», al final del todo.',
    ojo: 'Todo se guarda sobre la marcha, también sin cobertura. No cierres la visita hasta haberlo capturado todo: una vez cerrada no se le añade nada. Si un compañero la cierra mientras tú sigues, la pantalla te avisa y deja de dejarte capturar.',
  },
  'cierre-visita': {
    grupo: 'visita',
    titulo: 'Cerrar una visita',
    queEs:
      'El repaso de todo lo que has capturado en la visita —fotos, audios, notas, hallazgos, oportunidades y próximos pasos— antes de darla por terminada.',
    cuando:
      'Nada más salir del cliente. Compruebas el recuento —tocas cualquier casilla (Fotos, Notas, Próximos pasos…) para ver qué hay dentro—, lo repasas zona por zona si has anotado zonas al capturar, pulsas «Cerrar visita» y confirmas. En el resumen que sale después puedes descargar el informe —un ZIP con el PDF y las fotos y audios— (también está luego en el detalle de la visita).',
    ojo: 'Al cerrar, la visita queda fija y pasa a solo lectura: lo que no hayas capturado ya no se le puede añadir. Revisa bien el recuento antes de confirmar. Las oportunidades y los próximos pasos siguen vivos después: se trabajan desde el cliente, no desde la visita. Si cierras sin cobertura no pasa nada: se guarda en el móvil y se confirma sola en cuanto vuelvas a tener red.',
  },
  'visita-cerrada': {
    grupo: 'visita',
    titulo: 'Visita cerrada',
    queEs:
      'El resumen de solo lectura de una visita ya terminada: objetivo, oportunidades, hallazgos, próximos pasos, el anexo con notas, fotos y audios, y un mapa con las fotos que se hicieron con ubicación. Es lo mismo que sale en el informe en PDF.',
    cuando:
      'Para consultar qué pasó en una visita, abrir una oportunidad o un hallazgo concretos, o descargar el informe y pasarlo a otras áreas.',
    ojo: '«Borrar esta visita» la elimina entera —con sus fotos, audios y notas— y no se puede deshacer.',
  },

  // — Lo que registras en una visita —
  'detalle-captura': {
    grupo: 'registro',
    titulo: 'Foto, audio o nota',
    queEs:
      'Una captura suelta de la visita. En las notas puedes editar el texto; en fotos y audios, el título.',
    cuando: 'Para revisar o retocar algo que capturaste, o borrarlo si te has equivocado.',
  },
  'detalle-hallazgo': {
    grupo: 'registro',
    titulo: 'Hallazgo',
    queEs:
      'Algo que has observado en el cliente y quieres dejar registrado: su naturaleza (contexto, oportunidad, riesgo…), una nota, en qué zona estaba y, si aplica, una fecha relevante.',
    cuando:
      'Para completar o corregir un hallazgo. Se crea durante la visita, desde el botón «Hallazgo». «Archivar» lo saca de la lista de hallazgos del proyecto cuando ya no es vigente, sin borrarlo —sigue en su visita y en el informe de esa visita— y se puede desarchivar.',
    ojo: 'Archivar y borrar solo los puede hacer el autor del hallazgo o Dirección Comercial.',
  },
  'detalle-oportunidad': {
    grupo: 'registro',
    titulo: 'Oportunidad',
    queEs:
      'Una venta posible con el cliente: su título, en qué etapa está, su prioridad, el horizonte de decisión, y qué tiene ya el cliente y qué solución le proponemos.',
    cuando:
      'Para mover la oportunidad de etapa según avanza, ajustar su prioridad u horizonte, o cerrarla como ganada, perdida o descartada (al marcarla perdida o descartada se confirma y se pide un motivo). Cuando la creas «rápida» en la visita puedes venir aquí al momento a completarla («Completar ahora») o hacerlo luego desde el cliente.',
    ojo: 'Los cambios de esta pantalla no se aplican solos: se guardan con «Guardar». Si sales con algo sin guardar, la app te avisa. Los términos que asocias sí quedan al momento.',
  },
  'proximo-paso': {
    grupo: 'registro',
    titulo: 'Próximo paso',
    queEs:
      'Algo que quedó pendiente de una visita: qué hay que hacer y, si quieres, para cuándo. Aparece en «Próximos pasos».',
    cuando:
      'Para editarlo, marcarlo como hecho, o —si en realidad es volver a ver al cliente— convertirlo en una visita planificada para su fecha.',
  },

  // — Si diriges el equipo —
  'listado-comerciales': {
    grupo: 'direccion',
    titulo: 'Equipo',
    queEs:
      'El listado de comerciales: quién está activo, quién de baja y quién ha pedido recuperar su acceso.',
    cuando:
      'Para dar de alta a alguien nuevo, entrar a su ficha para editarlo o darlo de baja, o reenviar el enlace de acceso a quien lo ha perdido.',
    soloDireccion: true,
  },
  'alta-comercial': {
    grupo: 'direccion',
    titulo: 'Nuevo comercial',
    queEs:
      'Da de alta a un miembro del equipo. Recibe un correo con un enlace para poner su contraseña; no se la fijas tú.',
    cuando:
      'Al incorporar a alguien. Eliges su rol (comercial o dirección comercial) y, si quieres, su zona y de quién hereda la cartera de clientes.',
    soloDireccion: true,
  },
  'detalle-comercial': {
    grupo: 'direccion',
    titulo: 'Ficha de comercial',
    queEs:
      'Los datos de un miembro del equipo: nombre, rol y zona, más su carga de cartera y un acceso a su actividad. Desde aquí se le da de baja o se reactiva, y se traspasa su cartera de clientes a otra persona.',
    cuando:
      'Para editarlo o cuando alguien deja el equipo: al dar de baja puedes traspasar en el mismo paso sus clientes, visitas planificadas y próximos pasos a otro comercial.',
    ojo: 'Dar de baja bloquea el acceso de esa persona, pero conserva todo lo que registró. Se puede reactivar después.',
    soloDireccion: true,
  },
  'cola-vocabulario': {
    grupo: 'direccion',
    titulo: 'Vocabulario',
    queEs:
      'El catálogo de términos que los comerciales eligen al registrar hallazgos y oportunidades. «Pendientes» son los propuestos sobre la marcha y sin revisar; «Catálogo completo» es todo lo aprobado, por categorías.',
    cuando:
      'En «Pendientes» tocas un término propuesto para ver su contexto y ahí mismo lo apruebas, lo fusionas con uno del catálogo o lo descartas; con «Seleccionar» haces lo mismo en lote. Lo que los comerciales proponen sobre la marcha aparece en la categoría «Sin clasificar»; al aprobarlo eliges en qué categoría queda. En «Catálogo completo» creas categorías y términos, los ordenas a tu gusto con las flechas, y buscas cualquiera con la caja de arriba («Desplegar todo» abre el árbol entero de una vez). Cualquier término puede tener modelos dentro (p. ej. «MIFARE» con «DESFire EV2»): despliégalo con la flecha y usa «+ modelo dentro de…»; o marca un término suelto y con «Mover a…» lo metes «dentro de» otro. Al lado de cada término se ve en cuántas fichas se usa ya.',
    ojo:
      'Renombrar un término cambia cómo se ve en los hallazgos y oportunidades que ya lo usan. Los términos no se borran de verdad: «Quitar» los deja fuera del catálogo pero conserva las fichas antiguas.',
    soloDireccion: true,
  },
  'gestionar-sectores': {
    grupo: 'direccion',
    titulo: 'Sectores',
    queEs:
      'La lista de sectores que aparece en el desplegable de «Editar datos» de la ficha de cliente. Solo la ve y la toca Dirección Comercial.',
    cuando:
      'Cuando falta un sector o sobra uno. Con «+» (arriba a la derecha) añades uno nuevo. Para cambiar los que hay, pulsa «Seleccionar», marca uno o varios y elige: «Renombrar» (solo uno) cambia cómo se llama en el desplegable; «Ocultar» lo saca del desplegable sin borrarlo y «Restaurar» lo devuelve. Nada de esto cambia los clientes que ya tenían ese sector escrito.',
    soloDireccion: true,
  },
  'solicitudes-reasignacion': {
    grupo: 'direccion',
    titulo: 'Solicitudes de ayuda',
    queEs:
      'Las peticiones de comerciales que necesitan que otra persona les cubra una visita.',
    cuando: 'Para revisarlas y resolverlas.',
    soloDireccion: true,
  },
  deduplicacion: {
    grupo: 'direccion',
    titulo: 'Clientes duplicados',
    queEs:
      'La app agrupa aquí las fichas de cliente con prácticamente el mismo nombre —da igual mayúsculas, acentos o el «S.L.» / «S.A.» del final—, porque suelen ser el mismo cliente dado de alta dos veces.',
    cuando:
      'Cuando salta el aviso de duplicados. En cada grupo tocas la ficha que quieres conservar (viene marcada la que más visitas tiene) y pulsas «Fusionar en la marcada». Si alguna ficha del grupo está vacía, «Quitar sin datos» la retira sin más trámite.',
    ojo: 'Al fusionar, las visitas, oportunidades, hallazgos, contactos y ubicaciones de las otras fichas pasan a la que se queda, y las demás desaparecen de la lista de clientes. No se puede deshacer desde la app: antes de confirmar, asegúrate de que de verdad son el mismo negocio.',
    soloDireccion: true,
  },
  'consumo-comerciales': {
    grupo: 'direccion',
    titulo: 'Consumo por comercial',
    queEs:
      'Cuánto ocupa cada comercial del espacio común del equipo, y si ya se le ha avisado de que libere.',
    cuando:
      'Cuando el espacio del equipo aprieta. «Seleccionar» manda un aviso a varios a la vez para que hagan hueco.',
    soloDireccion: true,
  },
  'actividad-comerciales': {
    grupo: 'direccion',
    titulo: 'Actividad por comercial',
    queEs:
      'Cuántas visitas, hallazgos, capturas y oportunidades lleva cada comercial. Por defecto, de los últimos 30 días; con «Todo» ves el histórico completo. Al entrar en uno, ese mismo resumen pero desglosado por proyecto.',
    cuando: 'Para ver quién se está moviendo (la lista se ordena por actividad), cómo se reparte el trabajo del equipo, o en qué está centrado alguien en concreto.',
    soloDireccion: true,
  },
} satisfies Record<string, EntradaPantalla>;

const _CONCEPTOS = {
  // — Durante la visita —
  'zona-captura': {
    grupo: 'visita',
    titulo: 'Zona de la captura',
    queEs:
      'Una etiqueta libre para el sitio que estás mirando (una puerta, una barrera, un rincón). Sale al pulsar «Marcar zonas», junto a «Captura lo que veas»; mientras haya una zona escrita, todo lo que captures queda atado a ella y al cerrar la visita lo repasas zona por zona. Si no marcas ninguna, todas las capturas van juntas al grupo «General». La etiqueta es de usar y tirar —no se guarda en ninguna lista—, pero las que ya has usado en esta visita te vuelven a salir como chip para reutilizarlas.',
    cuando: 'En clientes grandes o cuando recorres varias áreas y quieres el informe ordenado por sitio. Si no vas por zonas, ni toques «Marcar zonas»: captura normal y todo va a «General».',
  },
  'naturaleza-hallazgo': {
    grupo: 'visita',
    titulo: 'Naturaleza de un hallazgo',
    queEs:
      'Qué tipo de cosa has observado en el cliente: contexto (información de fondo), señal de oportunidad (algo que podrías venderle), riesgo (algo que te puede hacer perder la cuenta), competencia (producto de otro proveedor), fortaleza (algo que juega a tu favor) o proyecto activo (una obra o cambio en marcha).',
    ejemplo:
      'Ves lectores de otra marca en las puertas → competencia. El cliente comenta que abren otra nave → señal de oportunidad.',
  },
  'tipo-fecha-hallazgo': {
    grupo: 'visita',
    titulo: 'Fecha relevante de un hallazgo',
    queEs:
      'Si lo que has observado tiene una fecha que conviene tener presente —un contrato que vence, una renovación, una auditoría, un presupuesto en juego, una implantación prevista—, la anotas y marcas de qué tipo es. Queda guardada en el hallazgo y sale en el informe de la visita.',
    ejemplo:
      'El cliente comenta que su contrato con el proveedor actual termina en marzo → fecha relevante = marzo, tipo = «vencimiento de contrato».',
  },
  'interlocutor-participante': {
    grupo: 'visita',
    titulo: 'Interlocutores y participantes',
    queEs:
      'Interlocutores = personas del cliente (con su cargo y su papel: decisor, técnico, compras…); se guardan en su ficha y sirven para las siguientes visitas. Participantes = compañeros de tu equipo en esta visita en concreto; los añade Dirección Comercial o quien lleva la visita (su responsable), y al compañero le llega un aviso en «Yo» para aceptar o rechazar. Si rechaza, queda fuera y quien lo añadió lo ve; se le puede volver a invitar (sale marcado «reinvitar»), lo mismo Dirección que el responsable. Quien puede añadir también puede «quitar» a un participante —a esa persona le llega un aviso y, si hace falta, también se la puede reinvitar—, y cualquiera puede «salir» de una visita en la que no es responsable. Si no puedes añadir tú, usa «Pedir ayuda con esta visita».',
  },

  // — Oportunidades y vocabulario —
  'etapa-oportunidad': {
    grupo: 'oportunidad',
    titulo: 'Etapa, prioridad y horizonte de una oportunidad',
    queEs:
      'Las tres cosas que sitúan una oportunidad. Etapa: por dónde va la venta —latente (todavía es una idea), cualificada (hay interés real y encaja), en propuesta (ya le has pasado oferta) y, al cerrar, ganada, perdida o descartada—. Prioridad: cuánto foco merece (baja, media, alta o estratégica); ordena tu lista y ayuda a Dirección a ver dónde está lo importante. Horizonte de decisión: cuándo crees que decidirá el cliente (0-3 meses, 3-6, 6-12, más de 12, o sin fecha); no es un compromiso, sirve para no dejar enfriar lo que está caliente.',
    ejemplo:
      'El cliente quiere cerrar antes de fin de trimestre → horizonte 0-3 meses. Le has mandado oferta → etapa «en propuesta».',
  },
  'termino-modelo': {
    grupo: 'oportunidad',
    titulo: 'Términos y modelos del vocabulario',
    queEs:
      'Un término es cómo el equipo nombra una tecnología, una solución o un fabricante (biometría, control de accesos, MIFARE…). Algunos tienen modelos dentro: «MIFARE» agrupa «DESFire EV2», «EV1»… Al etiquetar un hallazgo o una oportunidad puedes elegir el término a secas si no sabes el modelo, o el modelo concreto. Si no encuentras el tuyo, proponlo y Dirección lo revisa y lo coloca.',
    ejemplo:
      'Ves lectores MIFARE pero no sabes la versión → etiquetas «MIFARE». Lo confirmas como DESFire EV2 → etiquetas ese modelo.',
  },

  // — Planificar y hacer seguimiento —
  'franja-visita': {
    grupo: 'planificar',
    titulo: 'Mañana, tarde o sin hora fija',
    queEs:
      'Cuando planificas una visita sin hora concreta, eliges la franja: «Mañana» o «Tarde» la colocan en ese tramo del día en la agenda; «Sin hora fija» la deja en el día, sin tramo.',
  },
  'semaforo-cliente': {
    grupo: 'planificar',
    titulo: 'El estado del cliente',
    queEs:
      'La etiqueta junto a cada cliente resume cómo va: «Con oportunidad» (tiene al menos una oportunidad abierta), «En seguimiento» (sin oportunidad abierta pero visitado en los últimos 3 meses) o «Sin visitar» (sin oportunidad y más de 3 meses sin visita, o nunca visitado). Mandan la palabra y la forma del icono; el color solo acompaña.',
    ejemplo:
      'Cierras la última oportunidad de un cliente como ganada o perdida → deja de estar «Con oportunidad» y pasa a «En seguimiento».',
  },

  // — La app por dentro —
  sincronizacion: {
    grupo: 'app',
    titulo: 'Trabajar sin conexión',
    queEs:
      'Lo que capturas se guarda primero en el móvil y se sube al servidor en cuanto hay conexión, reintentándolo solo. Mientras algo siga sin subir, comprueba tu conexión y no reinstales la app en ese teléfono.',
    cuando:
      'PrimeNotes se puede usar entera sin cobertura: haces la visita con normalidad y todo sube al recuperar señal, sin pulsar nada. En «Yo» es donde compruebas si queda algo pendiente.',
    ejemplo:
      'Visitas un polígono sin cobertura, capturas 12 fotos y 3 hallazgos y cierras la visita. Al volver al coche y recuperar señal, todo sube solo en segundo plano.',
  },
  'instalar-app': {
    grupo: 'app',
    titulo: 'Tener PrimeNotes como una app en el móvil',
    queEs:
      'Puedes añadir PrimeNotes a la pantalla de inicio del móvil y usarla como una aplicación normal: se abre de un toque, a pantalla completa y va más fluida. Ocupa muy poco y se actualiza sola. La primera vez que entras te sale un aviso para hacerlo; si lo cierras, aquí tienes los pasos.',
    ejemplo:
      'iPhone (Safari): pulsa Compartir y luego «Añadir a pantalla de inicio». Android (Chrome): sale un aviso «Instalar»; si no, entra en el menú de tres puntos y elige «Instalar aplicación» o «Añadir a pantalla de inicio».',
  },
} satisfies Record<string, EntradaConcepto>;

export type PantallaAyudaId = keyof typeof _PANTALLAS;
export type ConceptoAyudaId = keyof typeof _CONCEPTOS;

export const PANTALLAS: Record<PantallaAyudaId, EntradaPantalla> = _PANTALLAS;
export const CONCEPTOS: Record<ConceptoAyudaId, EntradaConcepto> = _CONCEPTOS;

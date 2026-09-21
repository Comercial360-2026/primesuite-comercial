// Fuente única de la ayuda in-app. De este fichero salen, sin divergir:
//
//   1. El "?" de la cabecera de una pantalla → <BotonAyuda> abre un Modal
//      con la EntradaPantalla ("qué es / cuándo / ojo").
//   2. Las notas al pie de un campo que no se explica solo →
//      <AyudaNota concepto="…" /> muestra el `queEs` del EntradaConcepto.
//   3. La pantalla /ayuda ("Cómo funciona PrimeNotes") → recorre estos dos
//      mapas, los agrupa y deja buscar.
//   4. El tour guiado del primer uso (<TourGuiado>, ver
//      src/hooks/use-tour-guiado.ts) → PasoTour, más abajo.
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
  { id: 'oportunidad', titulo: 'Oportunidades y categorías' },
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
      'Al empezar la jornada y entre visita y visita. Tocar una visita te lleva a prepararla o a retomarla; «Empezar visita sin planificar» abre la lista de clientes para arrancar una sobre la marcha. Si tienes varias visitas en curso, «También en curso» las lista: cada una la abres, la cierras o la descartas ahí mismo, y el color sube cuanto más lleve abierta. Si diriges el equipo, «Solo mías / Todas» amplía la vista.',
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
    ojo: 'Borrar una visita aquí se la lleva con sus fotos y audios y no se puede deshacer. Descárgala antes si te importa. Una visita con una oportunidad abierta o con cambios de este dispositivo sin subir no se puede marcar para borrar en lote — ciérrala o espera a que sincronice. No hay atajo: tampoco se puede borrar abriendo su ficha mientras tenga una oportunidad abierta.',
  },

  // — Un cliente —
  'alta-rapida-cliente': {
    grupo: 'cliente',
    titulo: 'Nuevo cliente',
    queEs:
      'Da de alta un cliente con dos datos: su nombre y el de su primer proyecto (la línea de negocio: mantenimiento, obra nueva, postventa…). Todo cliente nace con un proyecto, y cada visita cuelga de uno. Mientras escribes el nombre, te avisa si ya hay un cliente igual o parecido para que no lo dupliques. El cliente queda a tu nombre como responsable; Dirección puede reasignarlo luego.',
    cuando:
      'Cuando vas a visitar a alguien que no está en la lista. Puedes guardarlo e iniciar la visita al momento, guardarlo y planificarla, o solo guardarlo. El resto de la ficha (sector, tamaño, ubicación) se rellena después.',
  },
  'ficha-cliente': {
    grupo: 'cliente',
    titulo: 'Ficha de cliente',
    queEs:
      'Los datos del cliente (nombre, sector, tamaño, ubicación general), sus proyectos (líneas de negocio: mantenimiento, obra nueva, postventa…), sus interlocutores (las personas de contacto, con cargo y teléfono) y su ecosistema (qué tiene instalado y de quién). Todo cliente tiene al menos un proyecto, con nombre, desde que se da de alta.',
    cuando:
      'Aquí ves los proyectos del cliente y, debajo, el historial con TODAS sus visitas (de cualquier proyecto). Para la actividad de un proyecto —oportunidades, hallazgos, próximos pasos— entra en su ficha. Desde la barra de abajo arrancas o planificas una visita: si el cliente tiene varios proyectos, te pregunta a cuál. «Nuevo proyecto» abre otra línea de negocio del mismo cliente. «Editar datos» rellena sector, tamaño y ubicación (salen en la cabecera de cada informe); lo puede hacer el comercial responsable o Dirección, y necesita conexión.',
    ojo: '«Borrar cliente» elimina la ficha, todos sus proyectos y su historial, y no se puede deshacer; úsalo solo con fichas creadas por error. Si son dos fichas del mismo cliente, no la borres: lo resuelve Dirección Comercial juntándolas.',
  },
  'ficha-proyecto': {
    grupo: 'cliente',
    titulo: 'Ficha de proyecto',
    queEs:
      'Una línea de negocio dentro de un cliente: sus oportunidades activas, hallazgos, próximos pasos, notas y el historial de visitas de ESE proyecto (no de todo el cliente). Todo proyecto tiene su ficha; el historial completo del cliente se ve en la ficha de cliente.',
    cuando:
      'Antes o después de visitar por este proyecto. Desde abajo arrancas una visita ahora o la planificas para otro día. Con el lápiz lo renombras; también puedes pausarlo, terminarlo o borrarlo (al borrar, su actividad se mueve al proyecto que elijas; el único proyecto de un cliente no se puede borrar). Terminar pide antes resolver sus visitas pendientes: moverlas a otro proyecto o cancelarlas; una visita en curso de otro comercial hay que esperar a que se cierre, y una con una oportunidad abierta no se puede cancelar hasta cerrarla. Las oportunidades abiertas del proyecto en general solo avisan, no frenan. En «Hallazgos» solo salen los vigentes; «Ver resueltos» muestra los que se dieron por pasados. Si el proyecto tiene visitas cerradas, «Liberar espacio» lleva a la pantalla para liberarlas de golpe.',
  },
  'espacio-proyecto': {
    grupo: 'cliente',
    titulo: 'Liberar espacio (proyecto)',
    queEs:
      'Las visitas cerradas de este proyecto y cuánto ocupan. Igual que "Mi espacio" pero para todas las visitas del proyecto de golpe, sea quien sea el comercial responsable de cada una.',
    cuando:
      'Cuando un proyecto lleva muchas visitas y ocupa demasiado. Marca las que quieras y elige: «Descargar» solo se trae el backup completo (fotos, audios y PDF) de cada una sin tocar nada; «Liberar» descarga y, solo si sale bien, borra la visita del todo.',
    ojo: 'No se puede deshacer. Una visita con una oportunidad abierta, con cambios de este dispositivo sin subir, o de la que no eres responsable (si no diriges el equipo) no se puede marcar. Si una descarga falla a mitad de camino, se para ahí: lo ya respaldado se libera y el resto queda intacto para intentarlo más tarde.',
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
      'Un vistazo rápido al cliente justo antes de entrar: a qué vas, los contactos conocidos, su ecosistema (lo que sabemos que tiene; las categorías sueltas van en gris), las últimas notas, la oportunidad activa y el próximo paso pendiente.',
    cuando:
      'Al llegar al cliente, antes de pulsar «Iniciar visita». Desde aquí arranca la visita en curso.',
  },
  'visita-activa': {
    grupo: 'visita',
    titulo: 'Visita en curso',
    queEs:
      'La pantalla desde la que capturas todo mientras estás con el cliente. Lo primero y en grande, «Captura lo que veas»: cuatro botones iguales —foto, audio, anotar, próximo paso—. «Anotar» es para todo lo que ves y quieres dejar dicho: escribes o dictas y se guarda como nota; si además es un hallazgo («algo que tienen») o una oportunidad («algo para venderles»), lo marcas ahí mismo. Un hallazgo puede llevar una o varias categorías del catálogo (Hardware, Software…), opcional. Debajo, el contexto: el objetivo con el que ibas (tócalo para matizarlo) y tres botones: interlocutores, equipo y el briefing de Jira (icono de ticket) —tickets reales del cliente en Jira, resumidos en críticos, incidencias activas, estado general, contexto comercial, qué espera el cliente y una recomendación; se arma con reglas a partir de los datos del ticket, no con IA, así que las partes que piden interpretación (contexto comercial, qué espera el cliente, recomendación) son más simples que una lectura real—. Más abajo, «En esta visita», con todo lo capturado (lo tuyo y lo de tus compañeros) en una sola lista, y al final «Cerrar visita». Si estás recorriendo instalaciones, «Marcar zonas» saca una casilla para atar cada captura al sitio; si no, la captura no se ata a ninguna zona.',
    cuando:
      'Durante la visita. Cada botón de «Captura lo que veas» abre una captura rápida, y lo que vas metiendo aparece en «En esta visita» según lo capturas. En «Anotar» y en el resto de campos de texto largo puedes dictar en vez de escribir (icono de micro dentro del propio campo). Al terminar, «Cerrar visita», al final del todo. Si tienes otras visitas abiertas sin cerrar, un aviso arriba las lista en un panel sin sacarte de esta: desde ahí vas, cierras o descartas cada una.',
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
    ojo: '«Borrar esta visita» la elimina entera —con sus fotos, audios y notas— y no se puede deshacer. Si tiene alguna oportunidad sin cerrar no deja borrar: hay que cerrarla primero.',
  },

  // — Lo que registras en una visita —
  'detalle-captura': {
    grupo: 'registro',
    titulo: 'Foto, audio o nota',
    queEs:
      'Una captura suelta de la visita. En las notas puedes editar el texto; en fotos y audios, el título. La zona en la que estaba se puede añadir o cambiar aquí en cualquier momento. Una nota puede marcarse además como hallazgo («algo que tienen») o como oportunidad («algo para venderles») con «Esto es»: no se pierde nada, y se puede desmarcar.',
    cuando:
      'Para revisar o retocar algo que capturaste, marcar una nota como hallazgo u oportunidad, o borrarlo si te has equivocado. Editar y borrar sigue disponible con la visita cerrada; el informe se rehace con lo último al descargarlo.',
    ojo: 'Editar, borrar y cambiar de tipo solo los puede hacer el autor de la nota o Dirección Comercial.',
  },
  'detalle-hallazgo': {
    grupo: 'registro',
    titulo: 'Hallazgo',
    queEs:
      'Algo que has observado en el cliente y quieres dejar registrado: su texto, una o varias categorías del catálogo (Hardware, Software…, o si Dirección ha activado la clasificación detallada, también un término o modelo concreto), en qué zona estaba y, si aplica, una fecha relevante.',
    cuando:
      'Para completar o corregir un hallazgo. Se crea durante la visita desde «Anotar»; la clasificación del catálogo es opcional (puedes marcar varias) y la puedes cambiar aquí después. Con «Esto es» puedes devolverlo a nota o pasarlo a oportunidad —el texto y todo lo demás se conservan; la clasificación pasa directamente a ser la de la oportunidad, o se guarda en la sombra y vuelve si lo marcas otra vez como hallazgo—. «Marcar como resuelto» lo saca de la lista de hallazgos del proyecto cuando ya no es vigente, sin borrarlo —sigue en su visita y en el informe de esa visita— y se puede volver a marcar como vigente.',
    ojo: 'Marcar como resuelto, borrar y cambiar de tipo solo los puede hacer el autor del hallazgo o Dirección Comercial. Editar y borrar sigue disponible con la visita cerrada. Si sales con algo sin guardar, la app te avisa.',
  },
  'detalle-oportunidad': {
    grupo: 'registro',
    titulo: 'Oportunidad',
    queEs:
      'Una venta posible con el cliente: una o varias categorías del catálogo (Hardware, Software…, o si Dirección ha activado la clasificación detallada, también un término o modelo concreto), una descripción, su título, en qué etapa está, su prioridad, el horizonte de decisión y en qué zona surgió.',
    cuando:
      'Para mover la oportunidad de etapa según avanza, ajustar su prioridad u horizonte, o cerrarla (se confirma antes; si ganó o perdió y por qué lo llevas en tu CRM, aquí no se pregunta). Cuando la creas desde «Anotar» en la visita (marcándola como «Oportunidad de venta») puedes venir aquí al momento a completarla («Completar ahora») o hacerlo luego desde el cliente. Con «Esto es» puedes devolverla a nota o pasarla a hallazgo, siempre que siga intacta (etapa «latente», sin seguimiento ni próximos pasos); su clasificación se conserva en el destino.',
    ojo: 'Los cambios de esta pantalla no se aplican solos: se guardan con «Guardar». Si sales con algo sin guardar, la app te avisa. La clasificación que asocias sí queda al momento. Cambiar de tipo solo lo puede hacer el autor o Dirección Comercial.',
  },
  'proximo-paso': {
    grupo: 'registro',
    titulo: 'Próximo paso',
    queEs:
      'Algo que quedó pendiente de una visita: qué hay que hacer, si quieres para cuándo, y en qué zona. Aparece en «Próximos pasos».',
    cuando:
      'Para editarlo, marcarlo como hecho, o —si en realidad es volver a ver al cliente— convertirlo en una visita planificada para su fecha.',
    ojo: 'Si sales con algo sin guardar, la app te avisa.',
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
    titulo: 'Categorías',
    queEs:
      'El catálogo de términos que los comerciales eligen al registrar hallazgos y oportunidades. «Pendientes» son los propuestos sobre la marcha y sin revisar; «Catálogo completo» es todo lo aprobado, por categorías.',
    cuando:
      'En «Pendientes» tocas un término propuesto para ver su contexto y ahí mismo lo apruebas, lo fusionas con uno del catálogo o lo descartas; con «Seleccionar» haces lo mismo en lote. Lo que los comerciales proponen sobre la marcha aparece en la categoría «Sin clasificar»; al aprobarlo eliges en qué categoría queda. En «Catálogo completo» creas categorías con el «+» de arriba, y términos y modelos con el botón «+ Añadir…» que aparece al pie de cada categoría o término desplegado (p. ej. «MIFARE» con «DESFire EV2» dentro). Con el chip «Editar» activas a la vez el checkbox de cada fila y sus flechas subir/bajar — marca una o varias para Renombrar, Mover a… o Quitar (con confirmación); marcando una categoría, para Renombrar o Borrar. El subtítulo de cada término resume cuántos modelos tiene y en cuántas fichas se usa ya. Busca cualquiera con la caja de arriba («Desplegar todo» abre el árbol entero de una vez). Arriba del todo, «Clasificación en las fichas» es un interruptor único para toda la app: «Solo categoría» deja a los comerciales marcar solo la categoría entera en Hallazgo, Oportunidad y Anotar; «Categoría, término y modelo» les deja además elegir el término o modelo concreto.',
    ojo:
      'Renombrar un término cambia cómo se ve en los hallazgos y oportunidades que ya lo usan. Los términos no se borran de verdad: «Quitar» los deja fuera del catálogo pero conserva las fichas antiguas. El interruptor de clasificación es global: afecta a todos los comerciales a la vez, no se elige por pantalla.',
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
  'detalle-actividad-comercial': {
    grupo: 'direccion',
    titulo: 'Actividad de un comercial, por proyecto',
    queEs:
      'La actividad de un comercial concreto (visitas, hallazgos, capturas, oportunidades activas), desglosada proyecto a proyecto en vez de en un solo total. Mismo periodo que la lista: últimos 30 días o «Todo».',
    cuando:
      'Para ver en qué clientes y proyectos se está centrando esa persona, no solo cuánto en total. Toca un proyecto para entrar en su ficha.',
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
  'zona-item': {
    grupo: 'visita',
    titulo: 'Zona de un hallazgo, nota, oportunidad o próximo paso',
    queEs:
      'Dónde ocurrió, dentro de las instalaciones del cliente. Toca una de las zonas ya usadas en esta visita para reutilizarla, o escribe el nombre y pulsa «Usar zona» para crear una nueva —quedará disponible para el resto de cosas que anotes en esta misma visita—. Si no eliges ninguna, queda en «General», sin zona concreta.',
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

  // — Oportunidades y categorías —
  'etapa-oportunidad': {
    grupo: 'oportunidad',
    titulo: 'Etapa, prioridad y horizonte de una oportunidad',
    queEs:
      'Las tres cosas que sitúan una oportunidad. Etapa: por dónde va la venta —idea (primer indicio, sin confirmar), interés (ya has visto interés real y encaja), en propuesta (ya le has pasado oferta) y, al cerrar, cerrada—. Si ganó o perdió y por qué lo llevas en tu CRM; aquí solo importa si sigue abierta o no. Prioridad: cuánto foco merece (baja, media, alta o estratégica); ordena tu lista y ayuda a Dirección a ver dónde está lo importante. Horizonte de decisión: cuándo crees que decidirá el cliente (0-3 meses, 3-6, 6-12, más de 12, o sin fecha); no es un compromiso, sirve para no dejar enfriar lo que está caliente.',
    ejemplo:
      'El cliente quiere cerrar antes de fin de trimestre → horizonte 0-3 meses. Le has mandado oferta → etapa «en propuesta».',
  },
  'termino-modelo': {
    grupo: 'oportunidad',
    titulo: 'Términos y modelos del catálogo',
    queEs:
      'Un término es cómo el equipo nombra una tecnología, una solución o un fabricante (biometría, control de accesos, MIFARE…). Algunos tienen modelos dentro: «MIFARE» agrupa «DESFire EV2», «EV1»… Al clasificar un hallazgo, una oportunidad o una nota puedes elegir la categoría entera, el término a secas si no sabes el modelo, o el modelo concreto. Si no encuentras el tuyo, proponlo y Dirección lo revisa y lo coloca.',
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
      'Lo que capturas se guarda primero en el móvil y se sube al servidor en cuanto hay conexión, reintentándolo solo. No reinstales la app en ese teléfono mientras algo siga sin subir: perderías lo que aún no ha llegado al servidor.',
    cuando:
      'PrimeNotes se puede usar entera sin cobertura: haces la visita con normalidad y todo sube al recuperar señal, sin pulsar nada. En «Yo» es donde compruebas si queda algo pendiente. Si un elemento sigue marcado como «sin sincronizar» teniendo ya conexión, no es un problema de cobertura: el motivo real sale escrito debajo de cada uno, y ahí mismo puedes reintentarlo o descartarlo.',
    ejemplo:
      'Visitas un polígono sin cobertura, capturas 12 fotos y 3 hallazgos y cierras la visita. Al volver al coche y recuperar señal, todo sube solo en segundo plano.',
  },
  dictado: {
    grupo: 'app',
    titulo: 'Dictar en vez de escribir',
    queEs:
      'Cualquier campo de texto largo (Anotar, la nota de un hallazgo, la descripción de una oportunidad, un próximo paso, el objetivo de una visita, el resumen al cerrarla, el título de una foto o audio, reportar un problema…) tiene un icono de micro dentro del propio campo — abajo a la derecha en un texto de varias líneas, a la derecha en uno de una línea. Tócalo para dictar; se ve un punto rojo mientras escucha y se para tocando otra vez. No está en campos de un valor exacto y corto (nombre de cliente, zona, categoría nueva, buscadores): ahí escribir es más fiable que dictar.',
    cuando:
      'Cuando escribir en el móvil es incómodo —delante del cliente, con las manos ocupadas mirando un equipo—. Si el navegador deniega el permiso de micrófono, el propio campo lo avisa.',
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

export interface PasoTour {
  /** Debe coincidir con el `data-tour="…"` del elemento real que señala. */
  id: string;
  /** 1-3 palabras. Es un tour, no el manual: no repite el título de PANTALLAS. */
  titulo: string;
  /** Una frase. Si hace falta más, la respuesta ya está en /ayuda. */
  texto: string;
}

// Tour de bienvenida — 4 pasos, uno por pestaña del menú de abajo. Se
// dispara una sola vez tras el primer login (useTourGuiado en
// layout-shell.tsx) y se puede repetir desde Yo → "Ver guía rápida".
// Mismo contenido para cualquier rol: el menú de abajo es igual para
// comercial y Dirección Comercial.
export const TOUR_NAVEGACION: PasoTour[] = [
  {
    id: 'nav-hoy',
    titulo: 'Hoy',
    texto: 'Tu punto de partida: la visita en curso o la siguiente, y lo planificado para hoy.',
  },
  {
    id: 'nav-clientes',
    titulo: 'Clientes',
    texto: 'Tu cartera. Entra en un cliente para arrancar o planificar una visita.',
  },
  {
    id: 'nav-tareas',
    titulo: 'Pasos',
    texto: 'Lo que quedó pendiente de tus visitas: llamar, enviar propuesta, volver a pasar.',
  },
  {
    id: 'nav-yo',
    titulo: 'Yo',
    texto: 'Tu espacio: si algo no ha sincronizado, el manual completo, y cerrar sesión.',
  },
];

// Paso extra solo para Dirección Comercial — se dispara la primera vez que
// entra en "Yo" y señala el bloque de gestión que un comercial no tiene.
// Localstorage propio (independiente de TOUR_NAVEGACION): un comercial que
// asciende a Dirección lo ve la primera vez que entra con el rol nuevo.
export const TOUR_DIRECCION: PasoTour[] = [
  {
    id: 'direccion-equipo',
    titulo: 'Dirección del equipo',
    texto: 'Aquí gestionas al equipo, revisas categorías propuestas y ves la actividad de todos.',
  },
];

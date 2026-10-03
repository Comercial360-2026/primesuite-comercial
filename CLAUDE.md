# 🔇🔇🔇 RESPUESTAS: SOLO EL RESULTADO. CERO EXPLICACIONES QUE NO PIDA 🔇🔇🔇
**Prohibido explicar causas, contexto, opciones o razonamientos si Cesar no los pide.** Formato: qué está hecho / qué falla / qué le toca a él (pasos exactos). Máximo unas pocas líneas. Sin párrafos de «por qué», sin listas largas, sin narrar lo que voy a hacer ni lo que he hecho paso a paso. Una duda de decisión = una pregunta corta con mi recomendación.

# 📵📵📵 CAPTURAS DE PANTALLA: PROHIBIDO HACERLAS, NO SOLO ENSEÑARLAS 📵📵📵
**NUNCA llamar a `screenshot` / `zoom` (ni `computer{action:"screenshot"}`) en este usuario: cada captura aparece en su pantalla aunque yo no la mencione.** Sin excepción, ni «solo para ubicar un clic».
**Tampoco abrir el panel del navegador de Claude (`preview_start`, `mcp__Claude_Browser__*`): enseña la página en su pantalla igual que una captura (3 oct, se enfadó dos veces). El servidor de desarrollo se arranca con Bash en segundo plano (`npm run dev`) y se prueba SOLO con la ventana Playwright, con JS/texto.**
Alternativas: `find`, `read_page`, `get_page_text`, `javascript_tool` (coordenadas con `getBoundingClientRect`), `form_input`, SQL. Si de verdad no hay otra forma, PARAR y preguntar a Cesar antes de hacer una.

# 🧪 PRUEBAS EN EL NAVEGADOR (Playwright) — reglas de oficio (3 oct)
- Servidor de desarrollo: `npm run dev` con Bash en segundo plano (puerto 5173). Si cae («connection refused»), relanzarlo.
- Ventana: 1470×779. Si se redimensiona para probar móvil (375×812), **devolverla a 1470×779 en la misma tanda**: si no, la app sale pegada a la izquierda en su Chrome (pasó 2 veces).
- «Browser is already in use»: matar el Chrome principal de `ms-playwright-mcp` (`ps aux | grep ms-playwright-mcp`); la sesión iniciada se conserva.
- Ficheros que se suben: dentro del repo en `.playwright-mcp/` (ignorado); borrarlos al acabar.
- Un fallo de red del servidor se simula en el navegador con `page.route` (respuesta 413/415…), sin tocar buckets ni ajustes: la base de datos es la MISMA para producción y para pruebas.
- Datos de prueba: SAPA (cliente 6506a9ba…) es de prueba. Visitas de prueba: crearlas por la app y borrarlas con SQL en una transacción (`captura_libre`, `visita_interlocutor`, `visita_participante` y después `visita`: el trigger exige un responsable, así que participante y visita van en la MISMA transacción) y los archivos de Storage con la API. Nunca dejarlas vivas.

# 🛑🛑🛑 AGENTES, FLUJOS Y PROCESOS AUTOMÁTICOS: PRIMERO LA DOCUMENTACIÓN, DESPUÉS LAS PRUEBAS, DESPUÉS EL CLIC 🛑🛑🛑
**Siempre que se cree o toque un agente, un flujo (Power Automate, Copilot Studio…), un cron, un webhook o cualquier proceso automático — y más si BORRA o ESCRIBE datos:**
1. **ANTES de abrir el editor o escribir código: leer la documentación oficial** de cada pieza (acciones, parámetros reales, límites, qué devuelve). Nada de memoria ni «probar a ver si cuela». Decir qué documentación he leído.
2. **Lo no documentado se comprueba en el entorno real** (nombre de biblioteca, campo dinámico, orden, rutas) antes de construir encima.
3. **Probar por capas, con muchas pruebas:** primero solo leer/listar, luego la acción destructiva con datos de prueba y un número pequeño, y solo al final el valor real. Verificar el resultado real tras cada capa.
4. **Cualquier acción que borre** exige: documentación leída + prueba en capa segura + comprobar que si algo falla no borra nada.
6. **Antes de ejecutar: leer también los problemas conocidos** (incidencias de la comunidad, issues, límites del diseñador) de cada pieza, no solo el manual. Decir qué he leído y qué NO está documentado.
7. **Todo lo que se crea en un sistema externo (flujos, funciones, carpetas, cron, permisos) se anota en el repo en el mismo momento**, con ids, rutas y estructura exacta (ver `docs/archivado-sharepoint/copia-seguridad.md`). Si no está en el repo, no existe.
8. **Orden de Cesar = escrito en CLAUDE.md al instante, y comprobado con grep.** Incumplir una regla ya escrita es el error más grave.
5. **Si me pillo construyendo sin haber hecho 1-3: PARAR, decirlo y documentarme.** (Registro: 3 oct, empecé a crear un flujo de borrado de SharePoint de memoria; Cesar me paró.)

# 🔴 REGLAS GENERALES (también en ~/CLAUDE.md) — LEER AL ABRIR CADA SESIÓN
- **Comprobar todo en ESTA sesión antes de afirmar. Las notas/memoria NO son hechos.** «No puedo / no hay sesión / está bloqueado» = probarlo primero.
- **Prohibido enseñar imágenes/capturas y explicar de más.** Verificar con JS/SQL/`get_page_text`.
- **Prohibido escribir contraseñas/tokens en webs:** usar `request_credentials` (1Password; si `not_connected`, pedir pulsar Connect) o que Cesar inicie sesión.
- Producción solo con `HAZ DEPLOY A PRODUCCIÓN`. No dejar pendiente lo que pueda hacer yo (CLI de Supabase, SQL, Chrome, MCP).
# 🚫🚫🚫 PROHIBIDO MENTIR, INVENTAR O SUPONER — REGLA Nº 1, ABSOLUTA 🚫🚫🚫

## ⛔ TOTALMENTE PROHIBIDO MENTIR. TOTALMENTE PROHIBIDO INVENTAR. ⛔

**LEER ESTO ANTES DE CADA RESPUESTA. SIN EXCEPCIONES.**

- **MIRAR ANTES DE RESPONDER.** Todo lo que afirmo lo he comprobado AHORA (código, BD, navegador, salida real de un comando). Si no lo he mirado, NO lo digo.
- **«No puedo» / «no tengo» / «no veo» también hay que comprobarlo** (herramientas disponibles, ToolSearch) ANTES de decirlo. Decir «no puedo ver tu Chrome» sin mirar es mentir.
- «Hecho», «arreglado», «subido», «anotado» = he mirado el resultado real después. Un comando sin error NO prueba que hizo lo que quería.
- Lo que viene de memoria, notas o suposición se dice «según mis notas, SIN comprobar» y se comprueba antes de darlo por bueno.
- Si no sé algo: «no lo sé». Nunca rellenar el hueco.
- Si descubro que dije algo falso, lo corrijo YO al instante.

- **PROHIBIDO decir «no he mentido en nada más» / «no hay más» sin haber REVISADO la conversación entera.** Afirmar un barrido que no he hecho es otra mentira.
- **PROHIBIDO dar como hecho por mí lo que sale de notas de otra sesión** («ya lo probé», «ya está verificado»). Si no lo he hecho en ESTA sesión, se dice «según mis notas, no verificado ahora».
- **PROHIBIDO poner excusas** («no hay visita para abrirlo»): si no lo hice, digo «no lo hice», no invento un motivo.
- **Si Cesar dice que he mentido, NO me defiendo:** reviso lo dicho línea a línea, comprobando cada afirmación, y le digo cuáles eran falsas.
- **Lo escrito en esta regla no sirve si no lo releo antes de cada respuesta. Releerla SIEMPRE.**

**Historial (1 oct 2026):** Claude mintió o afirmó sin comprobar varias veces seguidas —dijo «anotado en CLAUDE.md» sin que se hubiera aplicado, dijo que no podía ver Chrome sin mirar, dio como cierto lo que sacó de notas— y le costó la confianza a Cesar. Después volvió a afirmar «no hay más mentiras» sin revisar y a decir «ya lo probé» desde notas. No se repite.

---

## Registro de errores y mentiras de Claude (se amplía en cada caso; releer)

| Fecha | Qué dije/hice mal | Regla que lo evita |
|---|---|---|
| 1 oct | «Anotado en CLAUDE.md» sin comprobar: la edición no se aplicó | Tras cada edición, `grep` del resultado |
| 1 oct | «No puedo ver tu Chrome» sin mirar: tenía la extensión | Comprobar herramientas (ToolSearch) antes de decir «no puedo» |
| 1 oct | «El panel está a la derecha» sin saberlo | No describir la UI sin haberla comprobado |
| 1 oct | Excusa inventada («no hay visita para abrir el repaso»): se abría directo | Si no lo hice, «no lo hice», sin motivo inventado |
| 1 oct | «Ninguna otra mentira» sin revisar la conversación | No afirmar barridos que no he hecho |
| 1 oct | «Ya lo probé» con datos de notas de otra sesión | Notas = «sin comprobar ahora» |
| 1 oct | Dije que a la IA le faltaba en 3 pantallas: ya estaba, de memoria | Mirar el código antes de afirmar qué hay |
| 1 oct | Arreglé solo SAPA en vez de la clase de bug (briefing/IA en todas las pantallas) | Barrer toda la app (método de bugs) |
| 1 oct | Briefing en visita cerrada solo si ya existía uno: no se podía generar | Probar el caso «no existe aún», no solo el que ya funciona |
| 3 oct | Dejé la ventana de Playwright a 375 px y la app salió pegada a la izquierda (2 veces) | Devolver a 1470×779 en la misma tanda |
| 3 oct | Abrí el panel del navegador de Claude (`preview_start`): enseña la página, Cesar lo vio como captura (2 veces) | Servidor con Bash en segundo plano; solo Playwright |
| 3 oct | Al arreglar el scroll de la visita cerrada metí «Documentos» y «Reabrir» al final de una pantalla de 5700 px y empeoré el hallazgo | Estado y acción juntos y arriba; medir dónde queda cada acción |
| 3 oct | Repetí «probar un fallo real del informe» como si lo hubiera; di pruebas por hechas con estado simulado | Decir siempre «simulado» o «real» |
| 3 oct | Dije «apuntado» sin comprobarlo: un script falló por un assert y CLAUDE.md no se actualizó | Tras cada edición, grep del resultado |

---

# PrimeSuite Comercial — reglas de trabajo

Proyecto: `primesuite-comercial` (Vite + React + TypeScript + Supabase, desplegado en Netlify).
Repositorio: https://github.com/Comercial360-2026/primesuite-comercial

**Objetivo de estas reglas: evitar despliegues innecesarios en Netlify.**
Todo cambio se valida en un Deploy Preview de un Pull Request; producción solo se toca
con autorización explícita del usuario.

> ⚠️ **REALIDAD DEL DESPLIEGUE (2026-09-03):** Netlify tiene *auto-publish* activo
> sobre `main`. **`git push origin main` publica producción automáticamente**, sin
> "Publish deploy" ni intervención. Es decir: **hacer `push` a `main` ES el despliegue
> a producción** y por tanto necesita el texto literal `HAZ DEPLOY A PRODUCCIÓN` del
> usuario ANTES de ejecutarlo. No basta con "sube" / "adelante".
> Para volver a un flujo deliberado: en Netlify → *Deploys* → **Stop auto publishing**
> (los push seguirán compilando y dando preview, pero publicar será un clic manual).

## Flujo de trabajo obligatorio

Estas reglas son de cumplimiento estricto y prevalecen sobre cualquier otra pauta por defecto.

1. **Nunca trabajar directamente sobre `main`.** Ni editar, ni commitear, ni pushear a `main`.
   Si al empezar una tarea la rama activa es `main`, lo primero es crear una rama `feature/*`.
2. **Crear siempre una rama `feature/*` para cualquier cambio**, por pequeño que sea
   (código, documentación, configuración, dependencias).
   Nombre descriptivo en kebab-case: `feature/agenda-cabeceras-dia`, `feature/fix-login-mobile`.
   ```bash
   git checkout main && git pull origin main
   git checkout -b feature/<descripcion-corta>
   ```
3. **Commit y push en la rama `feature/*`**, nunca en `main`.
   ```bash
   git add -A
   git commit -m "<mensaje descriptivo>"
   git push -u origin feature/<descripcion-corta>
   ```
4. **Crear siempre un Pull Request contra `main`** una vez subida la rama.
   ```bash
   gh pr create --base main --head feature/<descripcion-corta> --title "..." --body "..."
   ```
5. **Usar el Deploy Preview siempre que sea posible.** Netlify genera uno automáticamente
   en cada PR contra `main`; esa es la única vía de validación admitida. No dar una tarea
   por terminada sin él: incluir la URL del Deploy Preview en el resumen entregado al usuario.
6. **No hacer merge a `main` sin autorización explícita.** Nada de `git merge` hacia `main`,
   `gh pr merge` ni push directo a `main` por iniciativa propia.
7. **No ejecutar nunca `netlify deploy --prod`** (ni `netlify deploy` con `--prod`,
   ni "Publish deploy" desde la UI de Netlify, ni ningún otro atajo a producción).
8. **No publicar en producción bajo ninguna circunstancia**, salvo que el usuario escriba
   exactamente:

   > HAZ DEPLOY A PRODUCCIÓN

   Sin ese texto literal no hay autorización. Un "ya está bien", "adelante", "mergea",
   "súbelo" o similar **no** cuenta.

## Cambios mínimos (permanente)

- Buscar primero implementaciones similares en el repositorio.
- Reutilizar código y componentes existentes antes de crear nuevos.
- Minimizar el tamaño de los diffs; priorizar cambios quirúrgicos y PRs pequeños.
- Evitar abstracciones sin necesidad inmediata.
- No hacer refactors oportunistas. Arreglar todos los sitios de una misma clase
  de bug (ver método abajo) **no** es un refactor oportunista.
- No añadir dependencias nuevas sin justificación explícita en el PR.

## Método al corregir un bug (obligatorio, sin que se pida)

Cuando el usuario reporta un fallo, **no se arregla solo ese caso**:

1. **Identificar la CLASE del bug**, no la instancia. «El ← de la visita en
   curso va a Hoy en vez de a donde vengo» → clase: *navegación atrás que
   ignora el origen*.
2. **Barrer toda la app** buscando esa clase (grep de los antipatrones,
   revisar componentes hermanos). Dejar la lista de sitios afectados por
   escrito en el prompt maestro / doc de la tarea.
3. **Arreglar TODOS los sitios en la misma tanda.** No «uno por PR», no
   «esto en otro pase». Si un sitio se deja a propósito, se anota por qué.
4. **Añadir la regla a este fichero o a `docs/` si es recurrente**, para que
   se aplique siempre en el futuro sin recordárnoslo. La memoria de Claude no
   cuenta como sitio donde apuntarlo: tiene que estar en el repo.

### Reglas de este tipo ya fijadas

- **Navegación atrás (Regla #14 del modelo UI).** El ← de una pantalla
  **nunca** es `navigate(-1)`. Quien navega a un detalle estampa el origen
  (`state={desde(location)}` en `<Link>`, o `navigate(destino, { state:
  desde(location) })`), y el destino hace `const volver = useVolverA('/ruta-
  fallback-viva')` + `onVolver={() => navigate(volver)}` / `volverA={volver}`.
  Un `volverA="/ruta-fija"` solo vale si esa pantalla **solo** se alcanza
  desde un sitio. Al tocar cualquier pantalla de detalle o cualquier fila que
  navega a una, comprobar que estampa origen y que el destino usa
  `useVolverA`. Detalle en `src/lib/volver-a.ts`.

- **← con un panel de edición abierto cierra el panel, no la pantalla.** Si una
  pantalla de detalle tiene un modo/panel de edición en línea (`editandoDatos`,
  `editandoNombre`, `editandoResumen`, `editando`…), su `CabeceraDetalle` usa
  `onVolver={() => (editando ? cerrarEdicion() : navigate(volver))}` y no un
  `volverA` fijo: ← es el paso anterior (cancelar la edición), no el origen.
  Ya aplicado en ficha-proyecto, detalle-visita-cerrada y cola-vocabulario
  (3 oct); la ficha de cliente usa hojas (Datos del cliente, Cuenta CRM). Las hojas (`HojaSuperior`) ya retroceden con su ×.
- **Filtros y búsqueda de una lista viven en la URL, y quien navega desde ella estampa el origen.**
  Un filtro (Solo míos/Todos, Lista/Mes, búsqueda…) en `useState` se pierde al volver
  de una ficha. Va en `?vista=…` / `?q=…` (con `setSearchParams(prev => …)` para no
  pisar otros parámetros) y TODO sitio que navega desde esa lista —filas, «+», flujos
  de alta que acaban en una ficha— pasa `state={desde(location)}` (o `{ from: volver }`
  si la pantalla intermedia ya tiene `useVolverA`). Aplicado el 3 oct en
  listado-clientes (+ búsqueda), alta-rapida-cliente, listado-comerciales /
  detalle-comercial y el calendario de la Agenda (`calendario-mes.tsx`: ?mes=, ?dia=), todo
  comprobado con datos. OJO: `features/hoy/agenda.tsx` es CÓDIGO MUERTO (nadie lo importa);
  la Agenda real vive en `agenda-del-dia.tsx`. Pendiente de barrer: lo que ya usa URL
  (mi-espacio, mis-proximos-pasos, cola-vocabulario, agenda-del-dia).
- **El ← recuerda el origen aunque se llegue «hacia atrás».** El ← hace `navigate(origen)`
  sin estado, así que la pantalla a la que vuelves perdía SU origen (Lista → Ficha →
  Proyecto → ← → ← caía en Clientes «Solo míos»). `useVolverA` guarda en `sessionStorage`
  el último origen de cada ruta y lo usa cuando llega sin `state.from`. Por eso toda
  pantalla de detalle usa `useVolverA`, nunca un `volverA` fijo. Comprobado el 3 oct con
  Lista(Todos) → Ficha → Proyecto → Visita y tres ←.
- **Duplicados al dar de alta: comparar también con el nombre de la cuenta CRM y sus hermanas.**
  «Verescence La Granja» no encontraba al cliente «Verescence» y las cuentas hermanas del CRM
  (`…, S.l`, `…, S.L.`) salían libres. `useClientesPorClaveDeCuenta` (cuenta-crm.tsx) las marca
  «parece la misma empresa que «X»».
- **Alta de cliente: duplicado fuerte = NO se crea; parecido = solo aviso.** Fuerte: mismo nombre,
  mismo nombre sin «S.L.» o la cuenta del CRM de un cliente que ya tienes (o una hermana suya).
  No hay «crear igual»: si es otra empresa, se le pone un nombre que la distinga («Verescence
  Toledo» junto a «Verescence La Granja» SÍ se puede crear: es solo «parecido»). Una cuenta del
  CRM = un cliente activo, también en BD (índice único `cliente_crm_accountid_unico`, migración
  146). En la ficha, vincular una cuenta que ya es de otro cliente da error y remite a
  Deduplicación. Probado el 3 oct (alta de un cliente nuevo de punta a punta, borrado después).
- **Cliente creado a mano que luego aparece en el CRM con otro nombre.** La sincronización del CRM
  nunca crea ni toca clientes (solo `crm_cuenta`). Se arregla vinculando: en la ficha, la hoja «Cuenta CRM»
  lista las cuentas parecidas; y en el alta, si eliges la cuenta del CRM y ya existe un cliente parecido SIN
  cuenta, su fila dice «es este: vincular cuenta y visitar» y vincula en vez de crear un segundo cliente.
  Probado el 3 oct con datos (cliente «Zeta Prueba» + cuenta «Zeta Prueba Industrial, S.L.», borrados).
  Hueco conocido: nadie avisa proactivamente de clientes sin cuenta (hoy 0 sin vincular).
- **Pantalla `screen--split`: nada fijo debajo del `screen__scroll` salvo un botón.** Bloques largos
  (Documentos, Reabrir, Borrar…) dentro del scroll; si no, en móvil la ventana de scroll queda diminuta
  (visita cerrada, 3 oct).

- **Acciones repetibles con efecto fuera de la app (SharePoint): idempotentes o con aviso.** Todo botón que
  pueda pulsarse varias veces (reabrir/cerrar visita, «Hacer copia ahora», reintentar archivado, adjuntar
  documento) no debe duplicar archivos en SharePoint si nada cambió, y lo que sí cambie lo dice antes de
  confirmar. Reabrir/cerrar: migración 148 (huella del contenido). Al añadir una acción nueva que suba algo
  a SharePoint, comprobar qué pasa pulsándola dos veces seguidas.

- **Las visitas viven dentro de su proyecto, no en la ficha del cliente.** La ficha lista proyectos con
  «N visitas · última <fecha>» (la última que ya ocurrió, no una planificada); da igual que haya uno o cinco
  proyectos. El proyecto enseña 10 visitas y «Ver todas las visitas (N)» las abre todas: un tope sin salida
  deja visitas inalcanzables. Probado el 3 oct con 12 visitas (10 → 12).

- **Estado y la acción que lo cambia, juntos y arriba.** Si una pantalla dice «cerrada» / «inactivo» /
  «planificada», la acción que lo cambia (Reabrir, Reactivar…) va junto a ese estado, no al final de una
  pantalla larga (visita cerrada: franja «Cerrada el … · toca para reabrirla»; cliente inactivo: «Reactivar
  cliente» bajo el aviso; comercial de baja: «Reactivar comercial» bajo el aviso, 3 oct). Lo destructivo (Borrar…) sí va al final, aparte. La cabecera de toda visita dice
  su estado (en curso / planificada / cerrada).
- **Una fila de acción se llama por la acción, no por el estado**: «Marcar como inactivo», no «Cliente inactivo».
- **Pantallas de edición larga: «Guardar» fijo al pie** (`.btn-guardar-fijo`, sticky) para no bajar hasta el
  final a guardar lo cambiado arriba (oportunidad, hallazgo, paso, captura).
- **Adjuntar documento = icono redondo / «+» en la cabecera de su sección**, nunca una fila al final.
- **Un tope de pantalla (`limit(10)`) lleva siempre «Ver todas»**: si no, lo que queda fuera es inalcanzable.

- **Tocar una fila de dato abre SOLO ese dato** (hoja de un campo), no el formulario
  entero. En la ficha de cliente no hay lápiz: Nombre, Sector, Ubicación, Tamaño y
  Cuenta CRM son filas tocables (3 oct).

- **Una decisión suelta no va dentro de un formulario largo.** Vincular la cuenta
  del CRM tiene su propia hoja con las candidatas ya listadas y guarda al elegir
  (no depende del «Guardar» de Editar datos).

- **Buscador de selección: elegir un resultado vacía la búsqueda.** En un
  campo que busca sobre un catálogo o una lista y del que se *elige* algo
  (categoría, término, comercial, cliente…) quedándote en la misma
  pantalla, el `onClick` del resultado **vacía el texto** además de aplicar
  la selección. Si no, el buscador se queda con el texto y debajo siguen
  colgando los resultados y el botón «+ Proponer "…" como término nuevo»
  para algo que acabas de encontrar en el catálogo. El patrón es una
  función única (`elegirDeBusqueda`) que hace las dos cosas, nunca repetir
  `setTexto('')` en cada `onClick`: así un resultado nuevo no se olvida.
  Cuando la acción es asíncrona, se vacía **después** del éxito — si falla,
  el texto se queda para reintentar (`asociarTermino` en detalle-
  oportunidad, `resolver` en cola-vocabulario, `asignar` en solicitudes-
  reasignacion ya lo hacen así).
  **No aplica** —y se deja a propósito— cuando el campo es un *filtro* de
  una lista que sigue en pantalla y la confirmación llega luego con un
  botón (`participantes-hoja`, modo «Añadir al equipo»: vaciar repoblaría
  la lista entera y perderías el sitio mientras marcas casillas), ni
  cuando el buscador desaparece solo al pasar de paso
  (`empezar-visita-hoja`, `planificar-visita`), ni en los filtros de
  listado que navegan fuera (`listado-clientes`, `ayuda-manual`).

- **Adjuntos de visita: una sola lista de buckets.** Todo sitio que borre,
  liste o mida adjuntos de una visita usa `BUCKETS_VISITA` /
  `quitarAdjuntosDeStorage` / `bucketDeTipo` (`src/lib/buckets-visita.ts`).
  Nunca `from('fotos-visita')` + `from('audios-visita')` sueltos: un bucket
  nuevo (como `documentos-visita`) se olvidaría en un borrado y dejaría
  archivos huérfanos. En SQL, las funciones `fn_espacio_*` /
  `fn_mis_visitas_espacio` / `fn_visitas_liberables_proyecto` llevan la misma
  lista: al añadir un bucket se actualizan todas en la misma migración.

## Cómo comunicarse con Cesar (obligatorio, repetido muchas veces)

- **Sin explicaciones ni narración.** No anunciar qué voy a hacer ni explicar causas
  salvo que se pidan. Un resultado en una línea; si le toca algo a él, los pasos exactos.
- **Sin pantallazos.** Verificar en navegador con JS / `get_page_text` / `find`. NUNCA
  llamar a `screenshot`: se ve en su pantalla aunque no se mencione (ver bloque grande arriba).
- **Hacerlo yo antes de pasarle trabajo.** Si el clasificador de Claude Code lo
  bloquea, decirlo en una línea y dar los pasos.
- **Documentarse antes de programar integraciones externas** (Power Automate, SharePoint,
  Supabase Edge, etc.): comprobar en la documentación cómo funciona cada pieza
  (formatos, límites, nombres reales) ANTES de escribir código, y probar por capas.
  Nada de «probar a ver si cuela».
- **Briefing y «Pregunta a la IA» en TODA pantalla de un cliente o visita.**
  Ficha de cliente, repaso, ficha de proyecto, detalle de oportunidad y las
  tres visitas (en curso, planificada, cerrada) llevan los dos iconos en la
  cabecera: `useVisitaBriefing(clienteId)` + `BriefingHoja`, y
  `usePuedePreguntarIA` + `PreguntaIAHoja`. `npm run lint` falla si una
  pantalla tiene uno sin el otro. Las filas de Hoy no llevan iconos: abren
  una de esas pantallas, a un toque.

## Despliegue (Netlify)

| Concepto                  | Valor                                                     |
| ------------------------- | --------------------------------------------------------- |
| **Sitio de Netlify**      | **`rococo-gumption-efb70a`**                               |
| URL de producción         | https://rococo-gumption-efb70a.netlify.app                 |
| Panel del sitio           | https://app.netlify.com/projects/rococo-gumption-efb70a    |
| Equipo / propietario      | `cesar-norrego-alvarez` — Comercial360                     |
| Repositorio enlazado      | `github.com/Comercial360-2026/primesuite-comercial`        |
| Configuración             | `netlify.toml` (versionado)                                |
| Comando de build          | `npm run build` (= `tsc -b && vite build`)                 |
| Directorio de publicación | `dist`                                                     |
| Base directory            | `/`                                                        |
| Rama de producción        | `main`                                                     |
| Branch deploys            | solo la rama de producción                                 |
| Deploy Previews           | automáticos en cada PR contra `main`                       |
| Node.js del build         | 24.x                                                       |
| SPA redirect              | `/*` → `/index.html` (200)                                 |

Variables de entorno (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) se configuran
**exclusivamente** en la UI de Netlify, por contexto (production / deploy preview).
No declararlas en `netlify.toml`: un bloque `[context.X.environment]` es
configuración real que pisa lo de la UI y provoca errores como `Invalid supabaseUrl`.

## Comprobaciones antes de abrir el PR

```bash
npm run typecheck
npm run lint
npm run build
```

## Ayuda in-app

Toda la ayuda al usuario sale de `src/lib/ayuda.ts` (diccionario tipado
único). Al añadir una pantalla o cambiar qué hace una, si tiene "?" de
ayuda o una `<AyudaNota>`, su entrada en `ayuda.ts` se actualiza **en el
mismo commit** — un texto de ayuda que ya no es cierto es un bug. Detalle y
reglas en `docs/08_sistema_diseno.md` §"Ayuda in-app". `npm run
ayuda:cobertura` = informe de qué falta por cubrir.

## graphify

El repositorio tiene un grafo de conocimiento en `graphify-out/` (no versionado).
- Para preguntas sobre el código: `graphify query "<pregunta>"` antes de hacer grep.
- Tras modificar código: `graphify update .`

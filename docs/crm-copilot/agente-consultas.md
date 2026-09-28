# Agente «Consultas comerciales CB» — cómo está montado (para replicarlo)

Agente de Copilot Studio que responde preguntas concretas sobre UN cliente
(CRM, pedidos/licitaciones, Jira, Confluence), breve y con la fuente.
Distinto del agente de briefing (`Briefing Comercial de Clientes`).

Estado: **sin publicar** (27-09-2026). Lo usará el botón «Pregunta a la IA» de
PrimeSuite vía Direct Line, igual que el briefing.

## 1. Datos del agente

| Concepto | Valor |
|---|---|
| Entorno | `Default-9680142b-e519-4506-8d12-c0704c2fafb4` (primion Technology GmbH) |
| Id del agente | `b31d45bd-dbb9-f111-aaae-7ced8d963860` |
| Editor | **clásico** (`/bots/<id>/…`). El editor nuevo (`/agents/<id>`) NO admite flujos de Power Automate como herramienta |
| Modelo | Claude Sonnet 4.6 (Sonnet 5 solo aparece en el editor nuevo) |
| Búsqueda web | desactivada |
| Credenciales de TODAS las herramientas | «Credenciales proporcionadas por el fabricante» (cuenta de Cesar). Sin esto, cada llamada pide consentimiento al usuario y por Direct Line se bloquea |
| Instrucciones | `docs/crm-copilot/instrucciones-agente-consultas-2026-09-27.txt` |

## 2. Herramientas (todas de solo lectura sobre los datos de origen)

| Herramienta | Conector / acción | Configuración fija | Lo rellena la IA |
|---|---|---|---|
| CRM | Excel Online (Business) · *List rows present in a table* | Location = SharePoint Site Dept DIG Departamento comercial - Spain · Library = Documents · File = `/General/PrimeNotes/PrimeNotes - CRM/PrimeNotes_CRM.xlsx` · **Order By = `modifiedon desc` · Top Count = 50** (si se dejan a la IA, el agente PREGUNTA al usuario y por Direct Line se queda colgado) | Table, Filter Query, Select Query |
| Licitaciones - contenido de una carpeta | SharePoint · *List folder* | Site = `https://primion.sharepoint.com/sites/ProjDIGSeguimientoProyectosDigitek` | File Identifier (raíz: `%252fShared%2bDocuments%252fGeneral%252fB%2b-%2bLicitaciones%2by%2bpedidos`) |
| Leer documento de Licitaciones | Flujo Power Automate «Consultas CB - Leer documento» (ver §3) | — | ruta |
| Obtener lista de incidencias | Jira · *Get list of issues* | Jira instance = `https://primion.atlassian.net` | JQL |
| Obtener páginas | Confluence · *Get pages* | Website = primion | — |
| Obtener incidencia por clave (V2) | Jira · *Get issue by key (V2)* | Jira instance fija | Issue Key |
| Obtener contenido y metadatos de la página | Confluence · *Get page content and metadata* | Website = primion | Space, Page |
| Buscar en Licitaciones | Flujo «Consultas CB - Buscar en Licitaciones» (§3b) | — | texto |
| Buscar en Jira | Jira · *Get list of issues* (conector directo, no flujo) | Jira instance fija (https://primion.atlassian.net) | JQL Query |

La descripción de cada herramienta es lo que lee el orquestador para decidir
cuándo usarla: escribirla en español, diciendo qué devuelve y cómo llamarla.

## 3. Flujo «Consultas CB - Leer documento» (texto de cualquier documento)

Power Automate, entorno Default, id `80bab652-9f82-45c3-b351-f04707bfd63f`.

Por qué hace falta: el modelo del agente no lee binarios (PDF/Word) que le
devuelve un conector; hay que sacar el texto antes.

Pasos:
1. **Disparador** «When an agent calls the flow», entrada de texto `ruta`
   (ruta completa en el sitio: `/Shared Documents/General/B - Licitaciones y pedidos/…`).
2. **SharePoint · Get file content using path** — sitio Proyectos Digitek, File Path = `ruta`.
3. **OneDrive for Business · Create file** — carpeta `/`, nombre
   `_tmp_consultas_@{guid()}_@{last(split(triggerBody()?['text'], '/'))}`, contenido `body('Get_file_content_using_path')`.
4. **OneDrive for Business · Convert file using path** — ruta `@{body('Create_file')?['Path']}`, tipo PDF.
   Convierte Word (también .doc), Excel, PowerPoint, .msg/.eml, html, rtf. Con PDF falla (normal).
5. **AI Builder · Recognize text in image or document** — Image =
   `@if(equals(outputs('Convert_file_using_path')?['statusCode'], 200), body('Convert_file_using_path'), body('Get_file_content_using_path'))`;
   run after del paso 4: correcto, fallido y omitido.
6. **SharePoint · Send an HTTP request to SharePoint** — sitio
   `https://primion-my.sharepoint.com/personal/cesar_borrego_primion_eu`, POST
   `_api/web/GetFileByServerRelativePath(decodedurl='/personal/cesar_borrego_primion_eu/Documents/@{replace(body('Create_file')?['Name'], '''', '''''')}')/deleteObject()`
   → borrado **definitivo** de la copia (no pasa por la papelera). Run after del 5: todo.
7. **Respond to the agent** — salida `texto` = `fullText` del paso 5 **recortado a 12.000 caracteres** (si no, con varias herramientas a la vez salta `ContextTokenLimitExceeded`); si no hay texto, «No se pudo leer el documento…». Run after del 6: todo.

Todos los pasos con **Secure inputs / Secure outputs**: el historial de
ejecuciones no guarda contenido.

Para que Copilot Studio vea el flujo hubo que meterlo en una solución
(Power Automate › Soluciones › *Common Data Services Default Solution* ›
Agregar existente › Flujo de nube › *Fuera de Dataverse*).

Medido (27-09): PDF 7 págs 46 s; Word 27 págs, Excel, .msg: todos legibles.
No lee zip/rar/7z (pendiente de decidir cómo).

### Lo que NO funcionó (no repetir)
- Pasar el PDF al modelo directamente (conector «Obtener contenido de archivo»): no lo lee.
- `…/content?format=pdf` de SharePoint/Graph (vía «Send an HTTP request to SharePoint» o
  «Office 365 Groups · Send an HTTP request V2»): responde 302 y ningún conector sigue la redirección.
- Word Online · Convert Word Document to PDF: solo .docx moderno; falla con .doc antiguo.
- «Nuevo flujo» desde Copilot Studio abre un entorno equivocado: crear el flujo en make.powerautomate.com.

## 3b. Flujo «Consultas CB - Buscar en Licitaciones»

Id `0b2c9b54-27b3-446b-9fc1-1b20f18d7c73`. Disparador de agente (`texto`) → «Send an HTTP request to SharePoint» GET en Proyectos Digitek:
`_api/search/query?querytext='@{encodeUriComponent(concat(replace(texto,'''',''''''), ' path:"https://primion.sharepoint.com/sites/ProjDIGSeguimientoProyectosDigitek/Shared Documents/General/B - Licitaciones y pedidos"'))}'&selectproperties='Path,Title,LastModifiedTime,FileType,IsDocument'&rowlimit=20&trimduplicates=false`
→ «Respond to the agent» `resultados` = filas del resultado en texto, quitando el prefijo `https://primion.sharepoint.com/sites/ProjDIGSeguimientoProyectosDigitek` del Path (así el Path sirve tal cual para «Leer documento»). Busca por nombre y contenido (índice de SharePoint). Probado: 1 llamada, 20 resultados, 2 s.

## 3c. Historial: flujo «Consultas CB - Buscar en Jira» descartado, resuelto con conector directo

Id del flujo (Power Automate, entorno Default): `7115924f-609b-449f-8bd1-d5069d274e98` —
**apagado (Turn off), ya no se usa.** Queda para referencia de lo que NO funcionó.

Diagnóstico original: la herramienta directa «Obtener lista de incidencias» (Jira ·
*Get list of issues*) devuelve issues completos y con varias herramientas a la vez
dispara `ContextTokenLimitExceeded` en Anthropic — esa fue la causa real de los
timeouts de >500 s en preguntas con referencia de oferta (no el CRM, que responde
en ~6 s).

**Primer intento (27-09 tarde): flujo intermedio que resume con Data Operation
Select.** Trigger (`jql`) → Jira *Get list of issues* → *Select* (`take(...,20)`,
mapeado a `"clave | estado | prioridad | fecha | resumen"`) → *Respond to the
agent*. Verificado que el flujo en sí funciona (`Run` manual en Power Automate:
`Succeeded`, 7 s, misma conexión Jira que las herramientas directas). Pero **como
herramienta del agente fallaba siempre con `AuthenticationNotConfigured`**,
probado repetidas veces con sesión nueva, por Direct Line real y tras publicar dos
veces — mientras CRM y Confluence respondían bien en el mismo turno. Hipótesis:
Copilot Studio no propaga bien, para un flujo custom que usa un conector
no-Microsoft con OAuth delegado (Jira) invocado sin sesión interactiva, el token
de esa conexión — a diferencia de SharePoint (Licitaciones, Leer documento), cuyo
token de aplicación sí es válido en ese contexto. **Descartado**: se eliminó la
herramienta del agente y se apagó el flujo.

**Solución aplicada (27-09 tarde-noche): conector Jira directo, sin flujo
intermedio.** Se añadió de nuevo `Get list of issues` como herramienta («Buscar en
Jira», ver tabla §2), con «Jira instance» fija (`https://primion.atlassian.net`,
Valor personalizado) y `JQL Query` a rellenar por IA. Este conector **no expone un
selector de campos de salida ni `maxResults`** en Copilot Studio (solo aparecen
`JQL Query` y `Next page token` al añadir entradas) — sigue devolviendo el JSON
completo de cada issue. La palanca real, verificada, es **acotar el JQL**:
- Probado `updated >= -1d ORDER BY updated DESC` → responde bien, sin error de
  auth ni de contexto (listó incidencias reales con fuente).
- Probado buscar por la palabra suelta «prueba» con `updated >= -30d` →
  `ContextTokenLimitExceeded` — una palabra genérica de texto libre coincide con
  demasiadas incidencias.
- Conclusión: el conector funciona correctamente siempre que el JQL sea
  específico (proyecto/cliente, no solo texto suelto) y el rango de fechas corto.
  Las instrucciones del agente (§ FUENTES, punto 3) ya piden acotar por proyecto o
  cliente y `updated >= -90d` por defecto, ampliando en pasos si no hay resultados.

## 4. Formatos en «B - Licitaciones y pedidos» (32.364 docs, 27-09)

pdf 84 % · msg 6 % · docx/doc 5 % · xlsx/xls 3 % · eml 1 % · resto ~1 % (zip 99, rar 8, 7z 4, html, txt, pptx…).

## 4b. Pruebas (27-09)

- Buscador solo: OK (20 resultados).
- Pregunta mixta (oferta CRM + contrato + incidencias Jira) sin id de cuenta: eligió CRM + buscador + Jira, sin errores; CRM devolvió 3 cuentas homónimas y no eligió (correcto: desde PrimeSuite irá siempre el id).
- Lecciones: fijar Order By/Top en la herramienta Excel; recortar el texto de documentos; en el editor de instrucciones, « /» abre el menú de herramientas.

## 5. Seguridad

- Cuenta compartida: quien use el agente ve lo que ve Cesar. Por eso el control
  va en PrimeSuite: solo responsable/participante del cliente, consulta
  registrada por usuario y tope de consumo propio.
- El agente no se ve fuera de Copilot Studio mientras no se publique; publicado,
  solo entra por Direct Line con el secreto guardado en Supabase y «acceso protegido».
- El panel «Probar» pide «Permitir» (consentimiento de conexiones) en cada sesión
  de prueba; es del panel, no de Direct Line.

## 5b. Clase de bug: preguntas de CONTENIDO de documento se cuelgan 8 min (27-09 noche)

Confirmado con datos reales de `consulta_ia`: en un mismo día, 4 de 7
preguntas se colgaron los 8 minutos completos sin ninguna respuesta del
agente (ni error, ni `turn.complete`) — las 4 pedían el CONTENIDO de un
documento ("dime su contenido de REF-…", "dame el datasheet del ml10"); las
de CRM/Jira (metadatos, no documentos) respondieron en 50-75 s. El worker
`procesar-consultas` funcionaba bien (pg_cron cada minuto, sin errores) — el
agente en Copilot Studio era el que nunca cerraba el turno.

Causas más probables: "Buscar en Licitaciones" reintentando variantes de
nombre sin límite (§2), y preguntas sin cliente claro (un datasheet de
producto) forzando el nombre del cliente en la búsqueda sin encontrar nada.

Fix aplicado (instrucciones, § Licitaciones y § EFICIENCIA):
- Tope de 2 reintentos de variante en "Buscar en Licitaciones" (antes
  indefinido); si no hay nada, responde "No consta" y para.
- Preguntas de producto/documentación técnica sin cliente: buscar por el
  producto directamente, sin forzar el nombre del cliente.
- Presupuesto total de 6 llamadas a herramientas por pregunta; al llegarlo,
  responder YA con lo que haya. Nunca dejar el turno sin cerrar.

**Actualización (27-09, más tarde): la causa real NO era el prompt — ver
§5c.** El tope de reintentos y el presupuesto de 6 llamadas quedan aplicados
(son buenas prácticas de todas formas), pero por sí solos NO explican los
colgados: la causa real es que el propio flujo de Licitaciones falla al
invocarse desde el agente (§5c). No repetir el diagnóstico "hay que afinar
más el prompt" para este síntoma sin antes comprobar §5c.

Lado app: se añadió poder cancelar una pregunta en marcha (estado
`cancelada`, no cuenta para el tope diario) para que el comercial no se
quede bloqueado sin poder preguntar nada más mientras espera — ver
`fn_cancelar_consulta_ia` (migración 127) y el botón en `pregunta-ia-hoja.tsx`.

## 5c. Causa real de los colgados: los DOS flujos de Licitaciones fallan como herramienta del agente (27-09 noche)

**Diagnóstico, no suposición.** Probado en vivo en el panel «Probar» de
Copilot Studio con preguntas de auto-reporte (ver método abajo):

| Herramienta | Tipo | Resultado |
|---|---|---|
| Enumerar las filas de una tabla (CRM) | Conector directo | Completado, 5,5 s |
| Mostrar lista de carpetas (List folder, Licitaciones) | Conector directo | Completado, 0,87 s |
| **Buscar en Licitaciones** | **Flujo** | **Falla al instante: `Mensaje de error: La autenticación no está configurada para este bot. Código de error: AuthenticationNotConfigured`** |
| **Leer documento de Licitaciones** | **Flujo** | **Mismo error, instantáneo** |

Es decir: el agente **elige bien la herramienta** (el enrutado del prompt
funciona) — el fallo es que **cualquier herramienta que sea un flujo de
Power Automate** falla al invocarse desde el agente, mientras que los
conectores directos (Excel, List folder) van perfectos. Por Direct Line esto
no sale como error limpio: el agente se queda reintentando en silencio hasta
el corte de 8 min de `procesar-consultas` — de ahí el síntoma original.

**Comprobado que NO es la causa:**
- El flujo en sí (ejecutado directamente, o su historial de ejecuciones en
  Power Automate) funciona bien: 4/4 ejecuciones de "Buscar en Licitaciones"
  con éxito el mismo día, 0,8-2 s cada una, 0 % de error. La conexión de
  SharePoint (`cesar.borrego@primion.eu`) está sana.
- No es un enlace de herramienta obsoleto: se eliminó y se volvió a añadir
  «Buscar en Licitaciones» como herramienta nueva (mismo flujo, misma
  descripción) y **siguió fallando igual**. Descartado que sea "refrescar la
  herramienta" sin más.
- No es específico de una pregunta o un flujo concreto: falla igual de
  instantáneo con «Leer documento de Licitaciones», que no se había tocado.

**Lo que esto apunta:** algo a nivel de Copilot Studio (no de Power
Automate, no del prompt) le impide invocar CUALQUIER flujo como herramienta
de este agente ahora mismo — un consentimiento/token de "invocar flujos en
nombre del agente" caducado o roto a nivel de agente/entorno, o una
incidencia puntual de la plataforma. Es la misma familia de fallo que ya
diagnosticasteis con el flujo de Jira (§3c, mismo código de error exacto),
pero aquella vez la hipótesis fue "es cosa de los conectores no-Microsoft
con OAuth delegado" — **esta vez le pasa también a un flujo 100 % SharePoint
(Microsoft)**, así que esa hipótesis original queda **descartada**: no es
del tipo de conector, es de cómo Copilot Studio invoca flujos en general.

**Pendiente — requiere acción de Cesar, no se puede arreglar desde aquí:**
1. ~~Revisar aviso de conexión/consentimiento a nivel de agente~~ — **hecho,
   ver §5d: es de licencia, no de conexión.**
2. Solución de fondo, ya con precedente (Jira): sustituir «Buscar en
   Licitaciones» por un conector directo — la búsqueda es una sola llamada
   HTTP a la API de búsqueda de SharePoint (ver query en §3b), candidata a
   moverse a un conector directo "Enviar una solicitud HTTP a SharePoint"
   sin flujo de por medio, igual que ya funciona "Mostrar lista de
   carpetas". «Leer documento» es más difícil de hacer directo (necesita el
   paso de OCR de AI Builder, §3), así que probablemente se quede como
   flujo hasta que se resuelva §5d o se rehaga sin flujo.

## 5d. Causa raíz encontrada: licencia, no conexión (27-09 noche)

En «Información general» del agente, junto al nombre, hay un aviso
**"Agent status: 4 Warnings"** con botón **Review** — no estaba mirado hasta
ahora. Uno de los 4 avisos, categoría **Licensing**:

> "This agent uses premium features. You'll need an upgraded license to
> publish it." — botón asociado: **Go premium**.

Esto encaja con TODO lo visto en §5c: los flujos de Power Automate como
herramienta de un agente generativo son una **característica premium** de
Copilot Studio/Power Platform. Sin la licencia adecuada, Copilot Studio no
puede completar la autenticación para invocar el flujo **como herramienta**
— aunque el mismo flujo, ejecutado directamente (por su trigger, o a mano
en Power Automate), no necesita esa licencia y por eso funciona perfecto
(§5c). Es exactamente el mismo aviso que probablemente ya se disparó con el
flujo de Jira (§3c) y que entonces se interpretó como "cosa del conector
no-Microsoft" — la explicación real y más simple es esta: **falta licencia
premium, no importa qué conector use el flujo.**

El botón "Go premium" no lleva a ningún sitio accionable desde aquí (ni
compra ni redirige a un flujo de asignación) — probablemente porque hace
falta rol de administrador de Power Platform / Microsoft 365 para
gestionar licencias, que esta sesión no tiene ni puede suplir. **Esto no se
arregla con código ni con configuración del agente**: es una decisión de
compra/asignación de licencia que solo puede tomar quien administra el
tenant de Microsoft 365 de Primion (revisar en admin.powerplatform.com →
Recursos → Capacidad, o con el proveedor de licencias de Microsoft).

**Mientras no haya licencia premium**, la única vía que funciona de verdad
es la del punto 2 de arriba: sacar «Buscar en Licitaciones» del flujo y
convertirla en conector directo (no premium, ya demostrado con "Mostrar
lista de carpetas"). «Leer documento» seguiría necesitando flujo (por el
OCR) y por tanto seguiría fallando hasta que haya licencia o se rehaga sin
Power Automate.

**Método de diagnóstico reutilizable** (para el próximo "se cuelga y no sé
por qué" con este agente o cualquier otro de Copilot Studio): en el panel
«Probar», lanzar una pregunta con el MISMO formato que manda la app
(`Cliente: <nombre de prueba> (id de cuenta <uuid falso>). Pregunta: ...`)
pero pidiendo explícitamente que NO lea/muestre contenido real y que
autoinforme: *"Responde solo: HERRAMIENTAS_EN_ORDEN=<...>; Fuente: prueba
tecnica."* — así se ve en segundos, con las tarjetas de herramienta reales
del panel, qué intenta llamar y si falla, sin gastar tiempo ni exponer datos
de clientes (usar un cliente de prueba tipo "ZZ Prueba Briefing", nunca uno
real).

## 5e. Solución encontrada: «Agent Flow» nativo esquiva el bloqueo de licencia (28-09)

**Descubierto y verificado en vivo:** Copilot Studio tiene, además de los
flujos clásicos de Power Automate (§3, §3b — los que fallan con
`AuthenticationNotConfigured` por licencia, §5d), un tipo de flujo distinto:
**«Agent Flow»**, dentro de la sección **«Flujos de trabajo»** del propio
agente (no en make.powerautomate.com). Es el motor de workflow nativo de
Copilot Studio, no un flujo de Power Automate clásico aunque puede llamar a
los mismos conectores.

Prueba hecha: Agent Flow con un paso directo de conector HTTP a SharePoint
(la misma llamada de búsqueda de §3b) ejecutado desde el panel de prueba del
propio flujo → **completado sin `AuthenticationNotConfigured` ni ningún
aviso de licencia.** Es decir: el bloqueo de §5d es específico de "flujo
clásico de Power Automate usado como herramienta de un agente generativo",
no de "cualquier automatización que no sea un conector nativo". Un Agent
Flow no lo dispara.

**Conclusión:** no hace falta esperar a una licencia premium. La vía a
construir es:
- «Buscar en Licitaciones» → Agent Flow con el mismo paso HTTP de §3b
  (pendiente: solucionar un `InvalidClientQueryException` de sintaxis en la
  query con `path:"…"` entre comillas — es un problema de escapado del
  literal, no de permisos ni de licencia; según lo probado hasta ahora
  conviene pasar la query completa ya percent-encoded sin comillas literales
  en el cuerpo, y seguir probando desde ahí).
- «Leer documento de Licitaciones» → Agent Flow, ver §5f para en qué orden
  hacer la extracción de texto.

Ambos Agent Flow, una vez terminados, se añaden como herramienta del agente
exactamente igual que un flujo clásico (mismo mecanismo de "flujo → añadir
como herramienta"); solo cambia dónde se construyen.

## 5f. Extracción nativa de texto (sin IA) — qué es Microsoft-nativo y qué no (28-09)

Cesar pidió priorizar todo lo que sea de Microsoft antes que ir a
terceros, y verificarlo por documentación oficial en vez de a golpe de clic.
Motivo de fondo: el 84 % de los 32.364 documentos de Licitaciones son PDF
(§4) — la mayoría nacidos digitales (texto embebido, no escaneados), así
que para la mayoría de preguntas **no hace falta IA/OCR en absoluto**, solo
extracción de texto determinista. El flujo actual (§3, paso 5) manda TODO
por AI Builder (OCR de pago) incluso cuando el documento ya tiene texto
nativo — eso es gasto y lentitud innecesarios que hay que corregir en el
Agent Flow nuevo.

Verificado por búsqueda en documentación/artículos oficiales y de la
comunidad de Power Platform (no probado aún a golpe de clic en el tenant):

| Necesidad | Conector | ¿Microsoft 1ª parte? | ¿Premium? | Resultado |
|---|---|---|---|---|
| Leer texto ya embebido de un **Word** (.docx) | Word Online (Business) | Sí | Sí (premium) | **No sirve de todas formas**: sus únicas acciones son *Convert Word Document to PDF*, *Create document*, *Populate template* — no existe ninguna acción "extraer texto" ni en la versión gratis ni en la premium |
| Bajar el binario de un archivo (SharePoint/OneDrive) | SharePoint · *Get file content* | Sí | No (estándar) | Ya usado en §3 paso 2; límite práctico ~70-80 MB (base64) |
| Extraer texto de un **PDF** nativo (sin OCR) | **PDF Tools (Tachytelic)** | No es 1ª parte, pero SÍ es un conector certificado del catálogo oficial de Microsoft Learn/Power Platform | **No** — gratis, sin cuenta externa, sin API key, sin límite de uso | Candidato fuerte para sustituir el paso 5 (AI Builder) cuando el documento es PDF: si el PDF tiene texto embebido, este conector lo saca sin IA y sin coste |
| Extraer texto de **Word/Excel/PowerPoint** nativo (sin OCR) | — | — | — | **No se ha encontrado ningún conector Microsoft de 1ª parte** que lo haga. Terceros como Encodian sí lo hacen pero son premium y piden cuenta/conexión propia (coste y alta sin verificar) — no adoptar sin decírselo antes a Cesar |
| Convertir Office → PDF para poder pasarlo por PDF Tools | OneDrive for Business · *Convert file* (ya usado en §3 paso 4) | Sí | No (estándar) | Ya verificado que funciona (Word moderno, Excel, PowerPoint; falla con .doc antiguo) — es la pieza que faltaba: convertir primero, luego extraer con PDF Tools, sin tocar AI Builder para nada salvo que el resultado esté vacío |
| Reconocer texto de un **escaneo** (imagen, PDF sin texto embebido) | AI Builder · *Recognize text in image or document* | Sí | **Sí (premium, gasta créditos de AI Builder)** | Se mantiene, pero SOLO como último recurso cuando el paso anterior no saca texto (documento realmente escaneado) |

**Arquitectura resultante para «Leer documento» (Agent Flow nuevo),
extracción-primero en vez de IA-primero:**
1. Get file content (SharePoint, ya existe).
2. Si es PDF → **PDF Tools: extraer texto** directo. Si el texto extraído
   sale vacío/insignificante (indicio de PDF escaneado sin capa de texto) →
   paso 4 (OCR).
3. Si es Word/Excel/PowerPoint → Convert file a PDF (ya existente, paso 4
   del flujo actual) → PDF Tools: extraer texto, mismo criterio de vacío que
   arriba.
4. Solo si el paso 2/3 no da texto aprovechable → AI Builder OCR (como
   ahora), como fallback, no como paso obligatorio.
5. Respond to the agent con el texto (mismo recorte a 12.000 caracteres de
   §3 paso 7).

Pendiente de verificar en el tenant real (no solo en documentación): que
"PDF Tools (Tachytelic)" aparece disponible para añadir como conector en
este entorno de Power Platform, y probar el paso 2/3 con un PDF nativo real
de Licitaciones y con uno escaneado para confirmar el criterio de "vacío ⇒
OCR".

## 6. Receta para replicarlo en otro agente

1. Crear el agente en el editor clásico; desactivar web; elegir modelo.
2. Añadir cada herramienta de §2: fijar valores constantes (sitio, libro,
   instancia) como «Valor personalizado», dejar a la IA solo lo variable, poner
   descripción en español y «Credenciales proporcionadas por el fabricante».
3. Si hay que leer documentos: importar/copiar el flujo de §3 y meterlo en una
   solución antes de añadirlo.
4. Pegar las instrucciones (enrutado por fuente + formato breve + «Fuente:»).
5. Probar en el panel con preguntas que solo devuelvan métricas (no leer datos
   de clientes), y medir tiempos.

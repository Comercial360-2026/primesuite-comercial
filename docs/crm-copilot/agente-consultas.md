# Agente «Consultas comerciales CB» — cómo está montado (para replicarlo)

Agente de Copilot Studio que responde preguntas concretas sobre UN cliente
(CRM, pedidos/licitaciones, Jira, Confluence), breve y con la fuente.
Distinto del agente de briefing (`Briefing Comercial de Clientes`).

Estado: **publicado** (28/9/2026, según «Agent status» del propio Copilot
Studio — sigue con 4 warnings, entre ellos el de licencia premium de §5d, que
no impiden publicar la versión actual sin los Agent Flow nuevos). Lo usará el
botón «Pregunta a la IA» de PrimeSuite vía Direct Line, igual que el
briefing.

## 1. Datos del agente

| Concepto | Valor |
|---|---|
| Entorno | `Default-9680142b-e519-4506-8d12-c0704c2fafb4` (primion Technology GmbH) |
| Id del agente | `b31d45bd-dbb9-f111-aaae-7ced8d963860` |
| Editor | **clásico** (`/bots/<id>/…`). El editor nuevo (`/agents/<id>`) NO admite flujos de Power Automate como herramienta |
| Modelo | Claude Sonnet 4.6 (Sonnet 5 solo aparece en el editor nuevo) |
| Búsqueda web | desactivada |
| Credenciales de TODAS las herramientas | «Credenciales proporcionadas por el fabricante» (cuenta de Cesar). Sin esto, cada llamada pide consentimiento al usuario y por Direct Line se bloquea |
| Instrucciones | `docs/crm-copilot/instrucciones-agente-consultas-2026-10-09.txt` (vigentes desde el 9 oct; las anteriores: `…-2026-09-27.txt`) |

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

## 5g. Bloqueado: crear un Agent Flow nuevo redirige a un entorno inaccesible (28-09)

**Diagnóstico, no suposición.** Al intentar construir el Agent Flow de §5e/§5f
(«Buscar en Licitaciones» nativo) desde cero:

1. Dentro del agente, `Herramientas` → `Agregar herramienta` → `Agregar nuevo
   Flujos de trabajo` abre un diálogo que dice «Esta página se abre en la
   experiencia clásica» con el enlace correcto (mismo entorno
   `Default-9680142b-e519-4506-8d12-c0704c2fafb4`, mismo `botId`).
2. Al abrir ese enlace (en pestaña nueva o navegando la misma pestaña a esa
   URL completa `/agent-flows/new?...`), la aplicación **redirige sola** a
   `environments/e4b6abcc-cd8e-e80d-8471-fee53f085157/...` — un entorno
   **distinto** al de la URL pedida — y ahí carga `Se produjo un error`
   (pantalla genérica, sin detalle salvo un Id. de sesión). Repetido 3 veces,
   mismo resultado exacto cada vez.
3. Comprobado en el selector «Cambiar entorno» del propio Copilot Studio:
   Cesar solo tiene **un** entorno disponible, `primion Technology GmbH
   (Default-9680142b-…)` — «Todos los entornos» aparece con **(0)**. Es decir,
   el entorno `e4b6abcc-…` al que redirige la creación de Agent Flow **no es
   un entorno al que Cesar tenga acceso en absoluto**, lo que explica el
   error inmediato (el `botId` tampoco existe ahí).
4. Probado también entrar por `make.powerautomate.com` (el dominio de los
   flujos clásicos) buscando una sección "Agent flows": no existe ahí un
   punto de entrada — `make.powerautomate.com/environments/<env>/agentflows`
   da 404; el `Create` de Power Automate solo ofrece los tipos de flujo
   clásico (Automated/Instant/Scheduled/Desktop/Process mining), ninguno es
   un Agent Flow. Confirma que el Agent Flow **solo se crea desde dentro del
   agente** en Copilot Studio (como dice §5e) — no hay vía alternativa por
   Power Automate.

**Conclusión:** no es un problema de licencia (eso ya se resolvió/rodeó con
Agent Flow, §5d/§5e) ni de las instrucciones del agente — es un **bug o mala
configuración de Microsoft** en el redirect de creación de Agent Flow para
este agente/entorno, que manda a un entorno que la cuenta de Cesar no tiene
provisionado. No se puede arreglar desde código ni desde la configuración del
agente.

**Pendiente — requiere acción de Cesar:**
- Reintentar en un momento distinto (podría ser un fallo transitorio de la
  plataforma) o desde el navegador normal de Cesar (no descartado del todo,
  aunque aquí se probó con su sesión real vía Claude en Chrome).
- Si persiste: abrir ticket de soporte de Power Platform/Copilot Studio
  citando el error y el Id. de sesión (cambia en cada intento, apuntar el de
  la próxima repro), y mencionar el entorno `e4b6abcc-cd8e-e80d-8471-fee53f085157`
  al que redirige indebidamente.
- Alternativa mientras tanto: seguir con los flujos clásicos de Power
  Automate (los que ya existen, §3/§3b) aunque fallen por licencia
  (§5c/§5d) — es decir, el bloqueo de licencia sigue vigente hasta que se
  resuelva este bug de redirect, porque el camino que lo esquivaba (Agent
  Flow) ahora mismo no se puede ni crear.

## 5h. Alternativa que evita el bug de §5g por completo: Conocimiento (Knowledge) con URL dinámica por cliente (28-09)

**Idea de Cesar, verificada por documentación oficial de Microsoft Learn**
(no probada aún a golpe de clic en el tenant): en vez de arreglar el Agent
Flow bloqueado, sustituir «Buscar en Licitaciones» + «Leer documento de
Licitaciones» **enteros** por una fuente de **Conocimiento (Knowledge)** de
tipo SharePoint. Copilot Studio ya extrae texto de PDF/Word/Excel él solo
(sin flujo, sin OCR manual) y responde/resume directamente sobre el
contenido — es RAG nativo.

**Por qué no vale apuntar a toda la carpeta «B - Licitaciones y pedidos»**
(32.364 documentos, §4): cada fuente de Knowledge de tipo SharePoint tiene
tope de **1.000 archivos, 50 carpetas y 10 niveles de subcarpetas**
([Microsoft Learn — Add SharePoint as a knowledge source](https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-add-sharepoint),
[quotas](https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-quotas)).
32.364 >> 1.000: la carpeta entera no cabe en una sola fuente, ni de lejos.
Tamaño por archivo: 7 MB sin licencia M365 Copilot, 200 MB con ella y
«Tenant graph grounding» activado — pendiente de comprobar qué licencia
tiene el tenant de Primion.

**La solución que sí encaja con «ya tenemos el cliente antes de preguntar»**
(igual que CRM/Jira ya hacen): Microsoft Learn documenta soporte de
**variables en la URL de la fuente SharePoint** — defines UNA fuente con
`.../B - Licitaciones y pedidos/{CarpetaCliente}` y en tiempo de ejecución
Copilot Studio resuelve `{CarpetaCliente}` (desde una entrada de topic, un
valor de PrimeSuite vía Direct Line, o un Agent Flow/conector) y el agente
solo busca dentro de esa carpeta concreta — muy por debajo de 1.000
archivos. Esto **no pasa por ningún flujo de Power Automate ni Agent Flow**:
el bug de §5g deja de importar.

Palanca adicional, combinable: cada fuente SharePoint admite un **filtro de
búsqueda** por `Modified on` (`on or after <fecha>`) configurable en
Ajustes avanzados de la fuente — sirve para lo que proponía Cesar de
«priorizar el último año»: si no hay resultado, sin este filtro se puede
tener una segunda fuente/lógica de topic que amplíe el rango, aunque esto no
es automático (Copilot Studio no «amplía sola»; hay que modelarlo con un
topic que pruebe la fuente acotada y si no hay respuesta, repita sin
filtro o con rango mayor).

Otras ventajas de esta vía frente a los Agent Flow:
- Resincroniza sola cada 4-6 h al detectar cambios en SharePoint — no hace
  falta tarea programada ni «Buscar en Licitaciones» para refrescar nada
  ([Microsoft Q&A — sync frequency](https://learn.microsoft.com/en-us/answers/questions/5583232/copilot-studio-chatbot-auto-sync-issue-for-sharepo)).
- Cada respuesta trae de serie la cita con el enlace al documento de
  origen — cubre gratis el «si necesita más, que lo abra» sin construir
  nada aparte.
- Respeta permisos: si el usuario autenticado no tiene acceso al
  documento, el agente responde "no response" en vez de filtrar mal —
  relevante para la nota de seguridad de §5 (cuenta compartida vs.
  consulta registrada por usuario en PrimeSuite).

**Pendiente de verificar en el tenant real, no en documentación:**
1. Si el nombre/id de cuenta que ya manda PrimeSuite en la pregunta se
   puede traducir a la ruta EXACTA de la carpeta del cliente dentro de
   «B - Licitaciones y pedidos» (¿coincide el nombre de carpeta con el
   nombre de cuenta del CRM, o hace falta una tabla de equivalencia o una
   búsqueda previa por nombre, como ya hace «Buscar en Licitaciones» hoy?).
   Si NO coinciden 1:1, sigue haciendo falta una búsqueda de metadatos
   (SharePoint Search API, §3b) como paso previo para resolver la carpeta,
   solo que ahora esa búsqueda alimentaría la variable de Knowledge en vez
   de devolver texto al modelo directamente.
2. Si el tenant de Primion tiene licencia M365 Copilot (afecta al límite de
   tamaño de archivo: 7 MB vs 200 MB — con PDFs de escaneos grandes puede
   importar).
3. Comportamiento real de los 1.000 archivos/50 carpetas cuando se usa
   variable: si el tope se cuenta sobre la carpeta ya resuelta (poco
   probable que un cliente tenga miles de documentos) o sobre todo lo que
   cuelga bajo la URL base antes de resolver la variable.
4. Probar con un cliente de prueba real: ¿resume bien un PDF nativo?
   ¿Qué pasa con un escaneado (sin texto embebido) — Knowledge hace su
   propia extracción, no está claro si intenta OCR o simplemente no
   encuentra nada?

**Si esto funciona, sustituye enteros** «Buscar en Licitaciones» (§3b/§5e)
y «Leer documento de Licitaciones» (§3/§5f) — no hace falta terminarlos ni
esperar a que Microsoft arregle el bug de §5g.

## 5i. La acción HTTP genérica de SharePoint TAMBIÉN está bloqueada — y alternativa validada sin ella (28-09)

**Diagnóstico, no suposición.** Al intentar rodear el bug de §5g construyendo
«Buscar en Licitaciones (directo)» con la acción de conector **«Enviar una
solicitud HTTP a SharePoint»** (la misma familia que ya usa «Mostrar lista de
carpetas», que SÍ funciona):

- Herramienta creada, guardada, con «Credenciales proporcionadas por el
  fabricante» ya seleccionado por defecto (comprobado explícitamente, no es
  un descuido de configuración).
- Probada en el panel «Probar»: **falla al instante con el mismo
  `AuthenticationNotConfigured`** de los flujos clásicos (§5c/§5d).
- Repetido el mismo turno con «Mostrar lista de carpetas» (la acción que
  siempre ha funcionado): **sigue funcionando perfecto**, 1,3 s, misma
  conexión, mismo agente, misma sesión. Descarta que sea un problema de
  sesión/conexión general.

**Conclusión:** el bloqueo de licencia premium NO es "flujo vs. conector
directo" como se pensaba en §5g punto 2 — es más fino: **la acción genérica
"Enviar una solicitud HTTP a SharePoint" (que puede llamar a cualquier API
REST) está tratada como función premium, igual que los flujos**, mientras
que acciones concretas y acotadas del conector (Mostrar lista de carpetas,
Obtener listas) no lo están. Coherente con el aviso que la propia Microsoft
muestra al añadirla: "esta acción puede ejecutar cualquier API REST... alto
riesgo". Comprobado también que el conector estándar de SharePoint **no
tiene ninguna acción de "Search"/"Query"** (ni en español ni en inglés) —
por eso la única forma de llamar a `_api/search/query` era ese HTTP
genérico, ahora bloqueado.

**Alternativa encontrada y validada en vivo, sin usar ninguna acción
bloqueada:** la carpeta raíz de "B - Licitaciones y pedidos" solo tiene
**143 elementos directos** (no 32.364 — esos son los documentos repartidos
dentro). Eso cabe de sobra en una sola llamada a "Mostrar lista de carpetas"
(la que ya funciona), y el propio modelo puede buscar coincidencias por
nombre de cliente sobre esos 143 nombres sin necesidad de ningún buscador
dedicado — recursivamente (llamando otra vez a la misma herramienta) si el
cliente estuviera dentro de una carpeta contenedora (p. ej. "2022-
Licitaciones").

Probado en el panel, dos casos reales:
- Cliente con carpeta exacta en la raíz ("GESALAGA"): resuelto en **1 sola
  llamada, 1,3 s**, Path exacto devuelto.
- Cliente con nombre ambiguo repartido en varias carpetas ("El Corte
  Inglés"): encontró **4 carpetas candidatas** por coincidencia parcial
  (mayúsculas/tildes distintas incluso) y pidió aclaración en vez de
  adivinar — mismo patrón ya usado con cuentas homónimas del CRM (§4b).

**Esto sustituye a «Buscar en Licitaciones» por completo, sin flujo, sin
HTTP genérico y sin esperar a que Microsoft resuelva §5g ni §5d.** Solo usa
"Mostrar lista de carpetas", que nunca ha fallado. Combinado con §5h
(Knowledge con la carpeta resuelta), la cadena completa quedaría: 1)
resolver carpeta con "Mostrar lista de carpetas" (recursivo si hace falta),
2) esa ruta alimenta la fuente de Knowledge (variable en la URL, §5h), 3)
Knowledge responde/resume. Ningún paso pasa por un flujo de Power Automate
ni por la acción HTTP bloqueada.

**Pendiente de verificar:** el paso 2 (meter la ruta resuelta del paso 1 en
la variable de la fuente de Knowledge dentro de la misma conversación) no
se ha probado todavía — requiere wiring de variables/topic en Copilot
Studio que no se ha construido en esta sesión.

**Limpieza pendiente:** la herramienta «Buscar en Licitaciones (directo)»
creada en esta sesión no funciona (bloqueada) — o se deja documentada como
"no usar" o se elimina de Herramientas para no confundir en el futuro.

## 5j. Construido el tema "Resumir carpeta de Licitaciones" — bloqueado por autenticación de Knowledge (28-09)

Siguiendo el diseño de §5h/§5i, se construyó en vivo:

- **Variable `RutaCarpeta`** como entrada del tema (Topic input, "Rellenar
  dinámicamente con la mejor opción" = la rellena el orquestador).
- **Tema "Resumir carpeta de Licitaciones"**, desencadenador "El agente
  elige" con una descripción que le dice explícitamente que llame primero a
  "Mostrar lista de carpetas" para resolver la ruta y luego a este tema
  pasando esa ruta como `RutaCarpeta`.
- Nodo **"Crear respuestas generativas"** dentro del tema: Entrada =
  `System.LastMessage.Text` (la pregunta real del usuario), «Buscar solo en
  los orígenes seleccionados» activado, «Permitir que la IA use su
  conocimiento general» desactivado.
- **Fuente de Knowledge SharePoint con variable**: confirmado que el campo
  de URL de una fuente SharePoint es por-línea (una URL o una variable por
  línea, `Shift+Enter` separa varias) — **no admite mezclar texto fijo +
  variable en la misma línea** pese a lo que sugiere la documentación de
  Microsoft Learn sobre "Use variables as URLs" (esa mezcla dio un error
  `MixedVariableHost`). Solución aplicada: la fuente usa **solo** la
  variable `{Topic.RutaCarpeta}`, y esa variable debe contener la URL
  absoluta completa (`https://primion.sharepoint.com/sites/...` + el `Path`
  que devuelve "Mostrar lista de carpetas") — la concatenación la hace el
  propio modelo al rellenar la entrada del tema, no Copilot Studio.

**Bloqueo encontrado al guardar, antes de poder probarlo:** Copilot Studio
avisa en rojo bajo el nodo:

> "Uno o más orígenes necesitan que su agente inicie sesión con Microsoft
> Entra ID o se autentique con Microsoft. SharePoint no admite OAuth 2
> genérico. Cambie el método de autenticación (no los ámbitos) en
> Configuración > Seguridad > Autenticación."

Coincide con lo que ya documenta Microsoft Learn (§5h): Knowledge con
SharePoint necesita el modo de autenticación del AGENTE completo configurado
como "Authenticate with Microsoft" (o una autenticación manual con Entra ID
— nunca "OAuth genérico", que es lo que usan hoy las herramientas de
conector con "credenciales proporcionadas por el fabricante").

**Por qué no lo he cambiado sin preguntar:** esto no es una opción de esta
fuente de Knowledge — es un cambio en `Configuración > Seguridad >
Autenticación` que afecta a TODO el agente, incluida la cuenta compartida
con la que hoy entra Direct Line desde PrimeSuite (§5: "cuenta compartida,
quien use el agente ve lo que ve Cesar"). Cambiarlo sin verificar puede
romper la integración actual con PrimeSuite. Antes de tocarlo hace falta
decidir:

1. Si "Authenticate with Microsoft" es compatible con el uso por Direct
   Line con secreto guardado en Supabase (probablemente NO lo es sin
   rehacer el flujo de autenticación end-to-end, ver "Advanced
   authentication scenarios" en la doc de Microsoft Learn de §5h).
2. Si hay una vía de autenticación manual con Entra ID (app registration
   con scopes `Sites.Read.All`/`Files.Read.All`, sin sesión interactiva por
   usuario) que sí sea compatible con Direct Line — mencionada en la misma
   doc de Microsoft Learn, no probada aquí.

**Estado:** el tema queda construido pero no guardado/probado hasta
resolver esto. No es un callejón sin salida — es una decisión de
arquitectura de autenticación que le corresponde a Cesar antes de seguir.

## 5k. Solución completa validada, sin IT, sin Knowledge, sin Agent Flow (28-09)

**Verificado en vivo con un PDF real, extremo a extremo.** Cesar no puede
pedir nada a IT (ni crear una app de Entra ID, ni cambiar el método de
autenticación del agente, §5j). Se buscó una vía que no tocara nada de eso:
usar solo acciones estándar del conector SharePoint, igual que "Mostrar
lista de carpetas" (§5i), que nunca ha necesitado licencia ni admin.

**Herramienta añadida: "Obtener contenido de archivo mediante ruta de
acceso"** (SharePoint · *Get file content using path* — la MISMA acción que
usaba el flujo original en §3 paso 2, ahora expuesta directa como
herramienta, sin flujo de por medio). Aviso para el futuro: existe una
acción hermana "Get file content" (sin "using path") que pide un selector
de archivo fijo y **no admite relleno dinámico por IA** — es la que NO hay
que usar; la de "using path" sí tiene un campo `File Path` de texto simple
con "Rellenar dinámicamente con IA" disponible, igual que
`list_folder_id` en "Mostrar lista de carpetas".

Configuración: Site Address fijo (mismo sitio de Proyectos Digitek),
`File Path` con instrucciones para que la IA pase la ruta **tal cual** la
devuelve "Mostrar lista de carpetas" en su campo `Path`.

**Prueba en vivo (28-09, panel «Probar»), con datos reales:**
1. "Mostrar lista de carpetas" → carpeta GESALAGA: completado, 3 documentos
   PDF encontrados.
2. "Obtener contenido de archivo mediante ruta de acceso" sobre el primer
   PDF (`.../GESALAGA/230310 REF-27093-0-Gesalaga Okelan SLU-OF Equipo
   Control de Presencia.pdf`, 481.471 bytes): **completado sin error**, con
   **contenido extraído del PDF (5 páginas)** — sin OCR, sin AI Builder, sin
   ningún conector de pago.

**Hallazgo colateral importante:** el agente, al ver que tenía el
contenido, **se negó a resumirlo** citando que "según la política operativa
configurada para este agente, no está autorizado a leer ni resumir el
contenido de documentos de Licitaciones" — es una instrucción ya presente
en el prompt del agente (probablemente de cuando "Leer documento" no
funcionaba y se quiso evitar que el agente prometiera algo que no podía
cumplir). **Hay que revisar y actualizar las instrucciones del agente** para
permitir explícitamente usar esta cadena (Mostrar lista de carpetas →
Obtener contenido de archivo mediante ruta de acceso) para responder
preguntas de contenido — si no, el agente seguirá autobloqueándose aunque
la herramienta funcione.

**Esto reemplaza toda la arquitectura de §3/§5e/§5f/§5g/§5h/§5j.** Ya no
hace falta: Agent Flow (bloqueado por Microsoft, §5g), Knowledge con
SharePoint (bloqueado por autenticación, necesita IT, §5j), ni PDF Tools de
terceros (§5f) — la extracción de texto del PDF ya viene incluida en la
respuesta de "Get file content using path" sin pasos adicionales. Toda la
cadena usa exclusivamente acciones estándar del conector SharePoint que
nunca han necesitado licencia premium ni intervención de un administrador.

**Actualización (28-09, mismo día): instrucciones corregidas y probado
extremo a extremo con éxito.** Se quitó del prompt la regla que bloqueaba
leer contenido (residuo de cuando esto no funcionaba) y se sustituyó por
instrucciones para usar «Obtener contenido de archivo mediante ruta de
acceso» cuando hace falta un dato de dentro de un documento. Prueba real en
el panel «Probar», con el mismo formato de mensaje que manda PrimeSuite
("Cliente: X (id de cuenta id). Pregunta: ..."): el agente resolvió la
carpeta, leyó el PDF real y respondió con el contenido correcto (importes,
condiciones, fechas, alcance de la oferta) citando la fuente en el formato
exigido por las instrucciones ("Fuente: Licitaciones · <archivo>
(<fecha>)"). Cadena de herramientas usada, confirmada por el propio agente:
Mostrar lista de carpetas (raíz) → Mostrar lista de carpetas (carpeta del
cliente) → Obtener contenido de archivo mediante ruta de acceso. **Funciona
de extremo a extremo, sin IT, sin licencia premium, sin Knowledge.**

**Actualización (28-09, mismo día): probado también con Word y Excel,
funciona igual de bien, sin conversión previa.**
- **Excel** (`Hoja de resumen de oferta.xlsx`, en la raíz de Licitaciones):
  completado con éxito, contenido "perfectamente aprovechable" — celdas de
  la hoja con campos como importe total, SLA, si es cliente nuevo, etc.
- **Word** (`NDA_Servicios cirsa.docx`, en `CIRSA/`): completado con éxito,
  "texto completamente aprovechable" — se leyó íntegro un Acuerdo de
  Confidencialidad (NDA) entre el cliente y Primion Digitek.

Es decir: **"Get file content using path" extrae texto directamente de
PDF, Word y Excel sin ningún paso de conversión** — no hace falta el
"Convert file" a PDF de §5f. Eso simplifica aún más la arquitectura: un
único paso (Mostrar lista de carpetas → Obtener contenido de archivo
mediante ruta de acceso) cubre los tres formatos más comunes de
Licitaciones (PDF 84%, Word/Excel 8% combinado, §4).

**Limpieza ya hecha (28-09):** eliminados la fuente de Knowledge «Carpeta
cliente en Licitaciones» (§5h/§5j, bloqueada por autenticación, nunca
llegó a usarse) y el tema «Resumir carpeta de Licitaciones» (§5j, dependía
de esa fuente) — ya no hacían falta.

**Publicado (28-09).** Confirmado por Cesar y publicado sin "Forzar la
versión más reciente" (no aplica, no se usa Teams). Los avisos previos al
publicar eran los ya conocidos y esperados (§2, §5: sin autenticación de
usuario final, herramientas con credenciales del autor) — nada nuevo.
**A partir de ahora, los comerciales que pregunten por el contenido de un
documento de Licitaciones por Direct Line reciben la respuesta real, no el
mensaje de "no puedo leer documentos".**

**Pendiente, sin bloqueos:**
1. PDF/escaneo sin texto embebido: no probado a propósito (no se ha
   localizado uno en las pruebas de hoy). Mitigado en las instrucciones del
   agente: si "Obtener contenido de archivo" no devuelve texto aprovechable,
   debe decir "No se pudo leer el documento" en vez de inventar — pendiente
   de confirmar ese comportamiento con un caso real cuando aparezca.

## 5l. Hallazgo crítico: los flujos rotos "contaminan" el turno entero — desactivados (28-09)

**Diagnóstico, no suposición, verificado con 3 repeticiones antes y después
del cambio.** Probando la cadena de dos preguntas (§5k) con una pregunta más
ambigua ("¿qué equipo se ofertó en la REF-27093-0 y qué garantía tiene?",
que toca a la vez CRM/Oportunidades y Licitaciones/documento), apareció un
fallo nuevo y preocupante: **el conector del CRM ("Enumerar las filas de
una tabla"), que llevaba toda la sesión funcionando perfecto, falló con el
mismo `AuthenticationNotConfigured`** de los flujos bloqueados — 3 de 3
veces con esa pregunta exacta.

Aislado el problema:
- El CRM solo (pregunta simple, sin mención a Licitaciones): **5 de 5
  llamadas con éxito**, mismo turno, misma sesión.
- La pregunta ambigua siempre acababa con el agente intentando también
  **"Consultas CB - Buscar en Licitaciones"** (el flujo clásico bloqueado
  por licencia, §5c/§5d/§5g) en el mismo turno — y ahí es donde fallaba,
  arrastrando también al CRM.

**Conclusión: cuando el orquestador intenta invocar, en el MISMO turno, un
flujo bloqueado por falta de licencia premium, el error de autenticación no
se queda solo en esa llamada — contamina el resto de llamadas a conectores
de ese turno**, aunque esos conectores (como el CRM) no tengan ningún
problema por sí solos. Antes esto no se veía porque las preguntas de CRM
puro nunca disparaban también el flujo de Licitaciones; ahora, con las
instrucciones ya corregidas para leer contenido (§5k), el agente combina
fuentes con más naturalidad en preguntas de tipo "qué se ofertó/vendió",
exponiendo el bug en un caso nuevo. No es una regresión introducida hoy: es
el mismo bug de licencia de siempre, disparado ahora con más frecuencia.

**Arreglo aplicado y verificado:** desactivadas (no eliminadas, por si
algún día se quieren reactivar) las dos herramientas de tipo Flujo:
"Consultas CB - Buscar en Licitaciones" y "Consultas CB - Leer documento"
— ninguna de las dos funciona igualmente (§5g/§5j), y ahora que "Mostrar
lista de carpetas" + "Obtener contenido de archivo mediante ruta de
acceso" cubren todo lo que hacían, no hacen falta. **Repetida la misma
pregunta que fallaba 3/3 veces: ahora responde perfecto**, con el detalle
completo (equipo, características, garantía, plazo, precio) y la fuente
citada bien, sin tocar el CRM para nada en esta pregunta (fue directa a
Licitaciones, correcto).

**Publicado (28-09, 13:07)** con las dos herramientas de flujo
desactivadas. Confirmado por el propio Copilot Studio ("¡Su agente se ha
publicado!").

## 5m. Formatos ilegibles (zip/rar/7z, pptx con poco texto): enlace directo en vez de "no se pudo leer" (28-09 tarde)

Con la solución de §5k ya en producción, quedaba sin resolver qué pasa
cuando "Obtener contenido de archivo mediante ruta de acceso" no puede
sacar texto útil: comprimidos (zip/rar/7z, que no tienen texto que extraer)
y algunos PowerPoint (contenido basado en imágenes, casi sin texto real).
Antes, la instrucción existente ya cubría esto sin alucinar ("No se pudo
leer el documento"), pero dejaba al comercial sin nada más que hacer.

**Idea del usuario:** si no se puede leer, dar un enlace para que el
comercial abra el documento él mismo cuando quiera, en vez de solo decir
que no se pudo. Verificado antes de tocar instrucciones que un enlace
simple —sin el token especial de "vínculo para compartir" de Microsoft—
ya es suficiente: `Site Address + Path codificado en URL` (espacios como
`%20`) dispara la descarga/apertura del archivo para un usuario con sesión
iniciada. Probado navegando directamente a
`https://primion.sharepoint.com/sites/ProjDIGSeguimientoProyectosDigitek/Shared%20Documents/...zip`
— SharePoint lo procesó como descarga sin que hiciera falta abrir ni mirar
el contenido.

**Cambio en instrucciones** (mismo bloque de §5k, sección 2 Licitaciones):
se añadió, a continuación de "Máximo 1-2 documentos por pregunta.": *"Si
no se puede leer (zip/rar/7z, PDF escaneado sin texto, u otro formato sin
texto aprovechable): no digas solo que no se pudo leer, da también un
enlace para que el comercial lo abra él mismo. Constrúyelo así: Site
Address + "/" + ese mismo Path, con los espacios codificados como %20
(ej.: .../Shared%20Documents/General/<cliente>/<archivo>.ext)."*

**Probado en real con los dos ficheros que pasó el usuario** (sin mirar su
contenido, solo verificando el comportamiento):
- `.zip` (`17. Certificados prestacion servicios.zip`, carpeta
  CEDEX/2025-Licitaciones): el agente reconoce que no puede leer un zip y
  da el enlace: *"Sí, la respuesta incluye el enlace... Fuente: Licitaciones
  (enlace construido según ruta proporcionada)."* Enlace verificado
  (inspeccionando el `href`, sin abrirlo): dominio, sitio y ruta correctos,
  con los espacios y el guion codificados bien.
- `.pptx` (`ONDUSPAN.pptx`, carpeta 2023-PEDIDOS-SALES ORDER): el agente sí
  intenta leerlo (el conector no distingue por extensión, solo por si
  devuelve texto aprovechable), detecta que solo salió texto residual
  mínimo, lo dice explícitamente ("habitual en presentaciones PowerPoint
  con contenido basado en imágenes o diseño gráfico") y da el enlace igual.
  Enlace también verificado correcto.

**Publicado (28-09, 14:19)** con este cambio. Confirmado por Copilot
Studio ("¡Su agente se ha publicado!").

**Pendiente / fuera de esta tanda:**
- `.msg` (correos de Outlook): sin probar — no se localizó ninguna muestra
  real y las dos vías de búsqueda automática (flujo clásico y HTTP
  genérico) siguen bloqueadas por licencia (§5c/§5i). Haría falta una ruta
  de ejemplo del usuario o resolver el bloqueo de búsqueda para probarlo.
- Imágenes incrustadas dentro de un documento: explícitamente aparcado por
  el usuario para el final, no se ha tocado.
- Mejorar la búsqueda en sí (que no dependa de "Mostrar lista de carpetas"
  + coincidencia de nombre): sigue bloqueado por el bug de Agent Flow
  (§5g), no resuelto en esta sesión.

## 5n. Búsqueda inconsistente por referencia de oferta: causa y mapa completo de carpetas (28-09 noche)

**Síntoma real (Cesar, en producción):** preguntar "¿qué contiene la oferta
REF-34469-H4P3?" sobre SAPA respondió *"No hay carpeta de SAPA en
Licitaciones con el documento adjunto"*, pero el documento SÍ existe (Cesar
lo encontró a mano en la carpeta `p260129`). Preguntar en cambio "¿existe
algún pedido de SAPA?" **sí** encontró la carpeta correcta
(`2026-PEDIDOS-JOBS/P260130 - SAPA OPERACIONES, S.L`) con sus documentos.

**Causa confirmada con la traza del panel de pruebas** (mismas dos
preguntas, reproducidas ahí): para la pregunta por referencia el agente
hizo **una sola** llamada a "Mostrar lista de carpetas" sobre la **raíz**
de B-Licitaciones, vio las +80 carpetas de categoría/año y, como ninguna se
llama literalmente "SAPA", se rindió sin bajar ningún nivel más. Para la
pregunta general sí bajó dos niveles (raíz → `2026-PEDIDOS-JOBS`) y
encontró la carpeta. No es un problema de permisos ni de licencia (§5d):
es que la profundidad de búsqueda que elige el modelo varía según cómo se
formula la pregunta, y no hay ninguna regla en las instrucciones que le
obligue a bajar de nivel antes de concluir "no existe".

**Mapa completo de B - Licitaciones y pedidos**, obtenido pidiéndole al
propio agente (herramienta "Mostrar lista de carpetas", raíz + un nivel
dentro de cada categoría) que lo reconstruyera él mismo — sin leer ningún
documento, solo nombres de carpeta:

| Carpeta de 1er nivel (por año) | Patrón de subcarpeta | Prefijo |
|---|---|---|
| `AAAA-Licitaciones` | solo el nombre del cliente, sin código | — |
| `AAAA-PEDIDOS-JOBS` | `P<código> - NOMBRE CLIENTE` | `P260NNN` = proyecto/job (pedido de instalación) |
| `AAAA-PEDIDOS MANTENIMIENTO` | `CM-AAAA-NNN - NOMBRE CLIENTE` (legado: `MT22...`, `MS22...`) | `CM-AAAA-NNN` = contrato de mantenimiento |
| `AAAA-PEDIDOS-SALES ORDERS` | `SO2600NNN - NOMBRE CLIENTE` | `SO2600NNN` = sales order (material/suministro) |
| `AAAA-PEDIDOS-REPARACIONES` | `CS-AAAA-NNN - NOMBRE CLIENTE` | `CS-AAAA-NNN` = caso de soporte/reparación |
| Carpetas de cliente concreto (sin año) | PDFs de oferta directos, con fecha y REF en el nombre | ej. `GESALAGA`, `CIRSA`, `INETUM - AEAT` |
| Otras | `SeguimientoSemanal`, `Solvencia (Cartas Licitaciones)`, `C - Deuda y albaranes pendientes`, `AA DOCUMENTACION LICITACIONES` | — |

Un mismo cliente puede tener carpetas en **varias** categorías a la vez
(SAPA: `P260130` en JOBS, `CM-2026-054`/`CM-2026-221` en MANTENIMIENTO,
`SO2600360` en SALES ORDERS) — "la carpeta de SAPA" no es una sola.

**Aplicado y publicado (28-09 noche):** pegada la nota del mapa al final de
las instrucciones del agente (7241/8000 caracteres) y publicado.

**Primera versión insuficiente — reproducido con la MISMA pregunta
(REF-34469-H4P3) tras publicar:** el agente ya no se rinde en la raíz —
esta vez SÍ entró en la categoría "2026 - Licitaciones" (mejora real) —
pero solo comprobó esa, no "2026-PEDIDOS-JOBS", y aun así afirmó sin
matices *"No se ha encontrado carpeta ni documento de SAPA en
Licitaciones"* — una afirmación falsa: la carpeta `P260130 - SAPA
OPERACIONES, S.L` sí existe (es la misma que encontró él mismo en la
pregunta "¿existe pedido de SAPA?"), simplemente está en la categoría
`PEDIDOS-JOBS`, no en `Licitaciones`. Cesar lo detectó porque no cuadraba
con lo que ya sabíamos.

**Causa:** mi primera redacción decía "entra en la categoría SEGÚN EL TIPO
DE PREGUNTA", lo que deja al modelo elegir UNA sola categoría (aquí:
"Licitaciones", por tratarse de una "oferta") y no le impide declarar "no
hay carpeta en Licitaciones" en general habiendo mirado solo esa. El campo
`Tipo` que el propio CRM ya devuelve para esa oferta (`Tipo: Proyecto`)
apuntaba directamente a `PEDIDOS-JOBS`, y no se usó para elegir la
categoría.

**Corrección aplicada (28-09 noche, mismo bloque):** se añadió una segunda
nota inmediatamente después de la primera, forzando explícitamente: (1)
usar el campo `Tipo` del CRM para elegir la categoría más probable
(Proyecto→PEDIDOS-JOBS, Mantenimiento→PEDIDOS MANTENIMIENTO, material o
suministro→PEDIDOS-SALES ORDERS, soporte→PEDIDOS-REPARACIONES) y
comprobarla ADEMÁS de Licitaciones antes de concluir nada; (2) nunca decir
"no hay carpeta en Licitaciones" sin matizar — decir exactamente qué
categorías se comprobaron y cuáles no, si el presupuesto de llamadas no
llegó a cubrirlas todas. Publicado.

**Reprobado con la misma pregunta (REF-34469-H4P3) tras la corrección:**
mejora parcial. El agente sigue sin entrar en `2026-PEDIDOS-JOBS` pese al
`Tipo: Proyecto` del CRM (solo miró raíz + `2026-Licitaciones`, igual que
antes) — la regla de "usa el campo Tipo para elegir la categoría" no se
siguió al pie de la letra. Pero la SEGUNDA parte de la corrección sí
funcionó: ya no hace la afirmación general falsa "no hay carpeta en
Licitaciones" — ahora dice exactamente qué miró: *"revisado en raíz y en
«2026 - Licitaciones»; tampoco existe carpeta 'SAPA' allí"* y la fuente
dice *"Licitaciones: revisado raíz y 2026-Licitaciones — sin carpeta
SAPA"*. Es decir: ya no miente por omisión, pero sigue sin ser exhaustivo.
**Pendiente real, sin resolver:** conseguir que siga la regla de elegir
categoría por `Tipo` de forma consistente — probablemente hace falta algo
más fuerte que una instrucción en prosa (p. ej. forzarlo con un ejemplo
concreto en las instrucciones, o aceptar que esto es variabilidad normal
del modelo y que la transparencia lograda ya es la mejora real y suficiente
por ahora).

**Causa de fondo, la real (28-09 noche, confirmada leyendo §5c/§5l de este
mismo documento):** no es un problema de instrucciones — es que la
herramienta que haría búsqueda de texto real sobre Licitaciones ("Buscar en
Licitaciones", flujo de Power Automate) está **desactivada a propósito**
desde el mismo 28-09 (13:07, §5l) por el bloqueo de licencia premium de
Microsoft (`AuthenticationNotConfigured`, §5c) — contaminaba también las
llamadas al CRM en el mismo turno. Hoy el agente solo puede **navegar
carpetas por nombre** ("Mostrar lista de carpetas"), nunca buscar texto
libre. Como las ofertas (`REF-NNNNN`) no son carpetas — son *archivos*
dentro de una carpeta de proyecto con código (`P260129`, sin relación
visible con el número de REF) — el agente no puede saber en qué carpeta
está una REF sin abrir carpetas una a una, algo que no cabe en el
presupuesto de 6 llamadas si hubiera que mirar entre las ~120 de todos los
clientes.

**La corrección real (Cesar, 28-09 noche):** el cliente de la pregunta ya
viene fijado desde PrimeSuite (`Cliente: <nombre> (id de cuenta <id>)`) —
el agente NO tiene que buscar entre las carpetas de todos los clientes,
solo entre las (normalmente 1-3) del cliente ya acotado, repartidas en las
5 categorías del mapa de §5n. Eso sí cabe de sobra en el presupuesto de
llamadas. Se consolidaron las dos notas anteriores de §5n en una sola,
sustituyendo la regla de "elige una categoría por el Tipo del CRM" (que no
se seguía de forma fiable) por: *comprueba las 5 categorías buscando
carpetas con el nombre del cliente ya fijado; si una oferta no aparece
como carpeta propia, puede ser un documento dentro de la carpeta del
cliente — abre las que coincidan y mira dentro; di siempre qué categorías
comprobaste.* Publicado (28-09, ~18:10). **Sin reprobar todavía** con la
pregunta REF-34469 tras este último cambio — pendiente de una sesión
futura, y sigue existiendo el límite estructural de fondo: sin la licencia
premium para reactivar la búsqueda de texto real, el agente depende de
listar carpetas por nombre, nunca será 100 % fiable para una REF que no
esté en una carpeta con el nombre del cliente en su ruta directa.

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

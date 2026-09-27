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
| CRM | Excel Online (Business) · *List rows present in a table* | Location = SharePoint Site Dept DIG Departamento comercial - Spain · Library = Documents · File = `/General/PrimeNotes/PrimeNotes - CRM/PrimeNotes_CRM.xlsx` | Table, Filter Query, Order By, Top Count, Select Query |
| Licitaciones - contenido de una carpeta | SharePoint · *List folder* | Site = `https://primion.sharepoint.com/sites/ProjDIGSeguimientoProyectosDigitek` | File Identifier (raíz: `%252fShared%2bDocuments%252fGeneral%252fB%2b-%2bLicitaciones%2by%2bpedidos`) |
| Leer documento de Licitaciones | Flujo Power Automate «Consultas CB - Leer documento» (ver §3) | — | ruta |
| Obtener lista de incidencias | Jira · *Get list of issues* | Jira instance = `https://primion.atlassian.net` | JQL |
| Obtener páginas | Confluence · *Get pages* | Website = primion | — |
| Pendiente | Jira · *Obtener incidencia por clave (V2)* · Confluence · *Obtener contenido y metadatos de la página* · flujo «Buscar en Licitaciones» (búsqueda SharePoint) | | |

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
7. **Respond to the agent** — salida `texto` = `fullText` del paso 5; run after del 6: todo.

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

## 4. Formatos en «B - Licitaciones y pedidos» (32.364 docs, 27-09)

pdf 84 % · msg 6 % · docx/doc 5 % · xlsx/xls 3 % · eml 1 % · resto ~1 % (zip 99, rar 8, 7z 4, html, txt, pptx…).

## 5. Seguridad

- Cuenta compartida: quien use el agente ve lo que ve Cesar. Por eso el control
  va en PrimeSuite: solo responsable/participante del cliente, consulta
  registrada por usuario y tope de consumo propio.
- El agente no se ve fuera de Copilot Studio mientras no se publique; publicado,
  solo entra por Direct Line con el secreto guardado en Supabase y «acceso protegido».
- El panel «Probar» pide «Permitir» (consentimiento de conexiones) en cada sesión
  de prueba; es del panel, no de Direct Line.

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

# Guía para crear agentes de Copilot Studio (lecciones medidas, 9 oct 2026)

Léela ANTES de crear o tocar un agente (regla de CLAUDE.md: documentación → capas → clic). Todo lo de aquí está medido o sacado de learn.microsoft.com; lo no comprobado lleva «sin comprobar».

## 1. Elegir el motor (lo que más pesa en la velocidad)
- Hay dos motores: **estándar** (agentes clásicos; se crean en Inicio › *Otras formas de crear* › *Agente Estándar*) y **GitHub Copilot** (el editor nuevo, `/agents/<id>`; consume créditos). Docs: `harnesses-overview`, `guidance/choose-harness`.
- GitHub Copilot razona paso a paso, explora y reintenta caminos solo: para tareas simples añade latencia y créditos «sin mejorar el resultado» (palabras de Microsoft). Medido: el briefing (lectura + redacción) tardó 304 s con ese motor; el motor estándar redacta un briefing largo en ~91 s y una consulta con lectura en 17-25 s.
- Regla: **tarea acotada y repetible (lectura de fuentes conocidas, redacción) = motor estándar.** GitHub Copilot solo para trabajo largo, abierto o con archivos.
- No consta en la documentación que un agente se pueda convertir de un motor a otro: se rehace.

## 2. Cómo se crea un agente estándar (UI, 9 oct)
1. Inicio › *Otras formas de crear* › *Agente Estándar* › nombre › Crear.
2. Configuración › IA generativa › Orquestación = **Sí** (si no, responde «no sé muy bien cómo ayudarle»).
3. Modelo y instrucciones están en la página *Información general* (≤ 8.000 caracteres). Modelos estándar disponibles: GPT-5.x, Claude Sonnet 4.6, Opus 4.6/4.7/4.8 (Sonnet 5 solo en el editor nuevo).
4. Poner el agente en el repo en el mismo momento: id, entorno, modelo, herramientas, instrucciones (copia en `docs/crm-copilot/`).
- **Un agente sin herramientas ni conocimiento NO responde** (cae en «No se encontró información…»): ni siquiera con instrucciones. Para redactar sin datos propios, usar un agente que ya tenga herramientas (el de Consultas) o darle una herramienta/tema mínimo. Documentación sin respuesta clara.

## 3. Herramientas (docs `add-tools-custom-agent`)
- La **descripción** de cada herramienta es lo que decide cuándo se usa: en español, qué devuelve y cómo llamarla.
- Entradas: por defecto «Rellenar con IA». Lo que no cambia (sitio, biblioteca, archivo, instancia) → **Valor personalizado**. Si se deja a la IA, el agente pregunta al usuario y por Direct Line se cuelga.
- Credenciales: «proporcionadas por el fabricante» (si no, pide consentimiento en cada llamada).
- Hasta 128 herramientas, **recomendado 25-30**. Con varias elegidas en un turno, las llama **en secuencia** (no hay paralelismo dentro de un agente).
- Bloqueado en este tenant (sin premium, sin IT): flujos de Power Automate como herramienta, Agent Flow, «HTTP a SharePoint», Knowledge de SharePoint (`agente-consultas.md` §5c-§5j). Funcionan: Excel «Enumerar filas», SharePoint «Mostrar lista de carpetas» y «Obtener contenido de archivo mediante ruta», Jira «Get list of issues» (JQL acotado), Confluence.

## 4. Velocidad: dónde se va el tiempo
- Cada vuelta del modelo entre herramientas cuesta 10-20 s; las herramientas en sí 0,3-7 s. Menos vueltas = más rápido.
- **Paralelismo = varias conversaciones de Direct Line desde nuestro worker** (código), cada una con una sola fuente; no dentro del agente.
- Los workers (`procesar-consultas`, `procesar-briefings`) sondean dentro de la ejecución (cada 4 s, hasta 110 s): sin eso la respuesta se recogía como mucho 1 vez/min (+hasta 60 s). Edge Functions: 150 s de reloj (plan gratuito) / 400 s (de pago), 2 s de CPU.
- Direct Line: endpoint **europeo**; actividad ≤ 256K caracteres (recomendado < 150K); se lee con `GET activities?watermark=`; fin de respuesta = `turn.complete` o primer mensaje largo/JSON.
- **Cuotas por ENTORNO de Dataverse, no por agente**: mensajes generativos 50-100 RPM / 1.000-2.000 RPH según plan. Crear un agente por usuario NO multiplica capacidad (descartado). Pendiente de medir: cuántos «mensajes generativos» cuenta una conversación.

## 5. Probar sin enseñar datos de clientes
- Cliente de prueba **SAPA** (id de cuenta en `cliente.crm_accountid`; datos de prueba) o cuenta inventada ZZ. El panel «Probar» limita el mensaje a **2.000 caracteres** (Direct Line no).
- El autoinforme («responde solo HERRAMIENTAS_EN_ORDEN=…») NO sirve en el agente de briefing: lo trata como inyección.
- Medir por la cola real (`consulta_ia`, `briefing_visita`: `pedido_en`, `iniciado_en`, `terminado_en`) es más fiable que cronometrar la interfaz. Para cronometrar la interfaz: sesión nueva cada vez y esperar a que aparezca «El bot dijo» (un hueco de texto sin cambios no es el final).
- Al volcar texto de la página no imprimir el contenido de las respuestas: solo longitudes, tiempos y nombres de herramienta.
- El panel muestra «Completado en X s» por herramienta.

## 6. Antes de dar por bueno un agente
- Publicar solo con la configuración probada; anotar fecha y qué cambió.
- Instrucciones: ≤ 8.000 caracteres; sin reglas heredadas que bloqueen lo que ahora sí funciona (pasó con «no leas documentos», §5k); incluir «nunca dejes el turno sin cerrar» y un tope de llamadas por pregunta.
- Un flujo roto como herramienta contamina el turno entero (§5l): desactivar lo que no funcione.

## 7. Workers de Direct Line (lecciones del 9 oct)
- La llamada del cron (pg_net) NO debe durar: un sondeo de 110 s dentro de la petición dejó las siguientes llamadas esperando (`DNS time 60000 ms`). El worker responde ya y sigue con `EdgeRuntime.waitUntil` (docs de Supabase: background tasks).
- Con `?watermark=` Direct Line devuelve solo actividades NUEVAS: acumular el texto entre sondeos. `turn.complete` no siempre llega: pedir una marca final explícita al agente (`FIN-LECTURA`) y/o aceptar «Fuente:».
- Al añadir una clave foránea hacia una tabla que otras consultas embeben (`tabla:columna(...)`), PostgREST puede volverse ambiguo («more than one relationship»): usar la FK explícita (`visita!briefing_visita_visita_id_fkey`). Probar el worker en cuanto se aplique la migración.
- Instrucciones largas (> 8.000 car.) o específicas de una tarea: mandarlas DENTRO del mensaje (Direct Line admite 256K) y versionarlas en el repo.
- Medir por la cola real: `briefing_tarea` guarda iniciado/terminado de cada fuente.

## 8. Modelo y latencia (investigado el 9 oct)
- Tiempo de generación ∝ tokens de SALIDA (la entrada solo retrasa el primer token): medido ≈54 car./s con Sonnet 4.6 y entradas de 6K a 17K.
- Categorías de Microsoft (`authoring-select-agent-model`): General = latencia mínima; Deep = máxima. Para redactar/resumir, modelo General. En una prueba de panel con los mismos hechos, GPT-5.5 Chat tardó ≈15 s y Sonnet 4.6 ≈76 s (calidad sin comparar).
- Para que un agente SIN herramientas ni conocimiento conteste: Configuración › IA generativa › **Permitir respuestas sin fundamentación = Activado** (si no, cae en «No se encontró información…»).
- Acortar la salida: límites de párrafos/frases por sección (no de palabras); trocear en partes que se escriben en paralelo.
- Un agente usable desde el worker necesita publicarse y tener un canal Direct Line: su secreto lo guarda Cesar en Supabase (nosotros no manejamos secretos).

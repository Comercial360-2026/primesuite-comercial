# Briefing rápido — plan (9 oct 2026). SIN EMPEZAR: se hace en sesión nueva

Objetivo: el briefing a demanda (hoy 6-8 min, medido 25-26 sep, no remedido) debe bajar a un par de minutos, y las consultas libres seguir en ~20 s. Restricciones ya decididas por Cesar (no volver a preguntarlas):
- Datos del CRM dentro del entorno Microsoft; en Supabase solo cuentas y contactos (decidido, ya está).
- SIN licencia premium ni conectores premium; sin pedir nada a IT.
- Flujo de Power Automate clásico / Agent Flow / «HTTP a SharePoint» como HERRAMIENTA del agente: BLOQUEADO (`docs/crm-copilot/agente-consultas.md` §5d, §5g). Un flujo con su propio disparador (cron/archivo modificado) SÍ funciona (el de «CRM a Excel» corre cada día). Herramientas estándar acotadas (Excel «Enumerar filas», SharePoint «Obtener contenido de archivo mediante ruta», «Mostrar lista de carpetas», Jira, Confluence) SÍ funcionan.
- Listas de SharePoint: se pudieron crear (hubo una «PrimeNotes CRM Accounts», vacía). Un archivo por cuenta es más simple y no choca con el umbral de 5.000.

## Hipótesis (sin medir)
El tiempo se va en llamadas encadenadas a herramientas (CRM 3.700 cuentas/11.000 oportunidades/16.600 ofertas, Jira, Confluence, Licitaciones) con razonamiento entre cada una, más escribir ~10.000 caracteres.

## Plan
0. Medir con una visita real: tiempo por herramienta y de redacción (método «autoinforme» del §5d, cliente ZZ, sin leer datos de clientes reales).
1. Digest por cuenta: tras la carga diaria del CRM, un flujo con su propio disparador escribe un archivo pequeño por cuenta (oportunidades abiertas, ofertas recientes, contactos, fechas) en la carpeta del CRM. El agente lo lee con UNA llamada estándar («Obtener contenido de archivo mediante ruta») en vez de filtrar tablas.
2. Agente redactor: instrucciones nuevas que lean el digest primero y usen Jira/Confluence/Licitaciones solo para lo fresco (JQL acotado, Top fijo).
3. Escritura en paralelo (2-3 conversaciones con 3 secciones cada una, el worker las junta) si la medición dice que la redacción pesa.
4. UX: ficha instantánea sin IA con el digest; arranque temprano del briefing (al abrir la ficha del cliente, al buscarlo para iniciar visita, 7:00 con la agenda del día); secciones que van apareciendo; reutilizar si el digest no cambió.
5. Calidad y operación: conjunto de 5-6 clientes de prueba con respuesta conocida (en septiembre el agente inventó ids); «datos del CRM al <fecha>» en el briefing y aviso si pasan >2 días (la carga depende de un PC con VPN); cuenta de servicio o 2.º propietario (hoy todo va con las credenciales de Cesar); tiempos por fase guardados en cada briefing.

## Riesgos conocidos
- Quien pulsa «Briefing» suele no haber planificado la visita: el nocturno no basta; por eso el arranque temprano y el digest.
- Direct Line: usar siempre el endpoint europeo; fin de respuesta = primer mensaje que empieza por «{» o ≥1.500 caracteres (`procesar-briefings`).
- Documentarse ANTES (regla de agentes/flujos de CLAUDE.md): leer docs oficiales de cada pieza y los problemas conocidos; probar por capas.

## Paso 0 — medición (9 oct 2026) y arquitectura elegida
Agente de briefing: id `4376a248-b036-4d56-a916-5abe08c2850c`, editor NUEVO, motor «GitHub Copilot» (modelo Claude Sonnet 5), 4 herramientas (CRM Excel, Licitaciones List folder, Jira, Confluence). Supervisar (3-9 oct): 6 sesiones, 5,8 min de media; briefing de la BD (4 oct): 356 s, 10.657 car.
- Prueba en «Probar» con cuenta falsa: ~12 llamadas de exploración (Get sources, ListAllRootFolders 404 ×2, Get drives, listar raíces/carpetas, Get tables) ANTES de leer el CRM, aunque sitio/biblioteca/archivo están fijados. El motor razona paso a paso y reintenta caminos solo.
- Agente de Consultas (id `b31d45bd-…`, motor ESTÁNDAR, mismas herramientas), SAPA: CRM completo (oportunidades+ofertas+contactos) ≈ 78 s; Licitaciones ≈ 21 s. Jira y Confluence: NO medidos (dos envíos fallaron con «No se pudo enviar» al lanzarlos seguidos).
- Documentación leída: learn.microsoft.com → harnesses-overview, guidance/choose-harness, add-tools-custom-agent, conversational-agents-performance-improvement, advanced-generative-actions (varias herramientas elegidas = se llaman EN SECUENCIA); Anthropic: multi-agent-research-system (paralelismo = subagentes independientes). NO documentado: convertir un agente de motor; si el motor estándar paraleliza llamadas.
- Arquitectura elegida (por razonamiento, SIN construir aún): el worker `procesar-briefings` (código, no IA) lanza en paralelo N conversaciones Direct Line contra agentes de motor estándar con UNA fuente cada una (CRM por tabla, Licitaciones, Jira, Confluence) y después UNA redacción sin herramientas. Tiempo esperado ≈ fuente más lenta + redacción (~1,5-2,5 min) frente a ~6 min. Pendiente medir Jira/Confluence uno a uno y la concurrencia de Direct Line (hoy MAX_EN_MARCHA=2).

## Revisión del diseño (9 oct, tarde) — palancas ordenadas por ganancia/esfuerzo
Datos reales de la cola (SQL): `consulta_ia` (agente estándar, Direct Line) 13 listas, media 65 s (23-123 s) frente a ~20 s en el panel «Probar»; `briefing_visita` 1 lista: espera de arranque 31 s + 356 s. Los workers (`procesar-consultas`, `procesar-briefings`) hacen UNA pasada por minuto (pg_cron `* * * * *`), sin sondeo interno: recoger la respuesta añade hasta 60 s.
Documentado: Direct Line 3.0 (Get Activities con watermark; actividad ≤256K caracteres, recomendado <150K → los datos caben en el mensaje); Edge Functions: 150 s (free) / 400 s (paid) de reloj, 2 s de CPU por petición (la espera async no cuenta), 256 MB.
1. Sondeo dentro del worker (cada ~3 s hasta ~100 s) y arranque inmediato: quita hasta 60 s a CADA briefing y consulta. Solo código nuestro.
2. Briefing en motor ESTÁNDAR (el de Consultas ya existe y sirve de lector): lectura por fuente en paralelo desde el worker (CRM por tabla, Licitaciones, Jira, Confluence); contactos desde Supabase por SQL (0 s). Plazo por fuente: si no llega, el briefing sale sin ella y lo dice.
3. Un solo agente nuevo: redactor SIN herramientas (recibe los hechos en el mensaje), con las secciones de lectura rápida primero (resumen, preparación de visita); troceable en 2-3 redactores en paralelo.
4. Confluence fuera de la ruta crítica salvo que aporte (medir utilidad). Digest de Licitaciones/CRM por flujo con disparador propio: solo si 1-3 no bastan.
5. Ya existe `briefings-nocturnos` (cron 20:00): ampliar con arranque temprano (ficha/agenda) sin esperar a la visita.

## Un agente por comercial — DESCARTADO (9 oct)
Sugerido por Cesar para evitar consultas paralelas lentas. Razones (documentadas, learn.microsoft.com/…/requirements-quotas): las cuotas se aplican POR ENTORNO de Dataverse, no por agente (mensajes generativos: 50-100 RPM / 1.000-2.000 RPH según plan), así que N agentes comparten la misma cuota y no ganan capacidad; cada conversación de Direct Line ya es independiente (no hay contención entre comerciales dentro de un agente); y cada copia exigiría repetir a mano instrucciones, herramientas, conexiones y publicación. La única serialización real es NUESTRA cola: `MAX_EN_MARCHA` (2 en briefings, 3 en consultas) y la pasada de 1 min. Pendiente de medir: cuántos «mensajes generativos» cuenta una conversación (afecta al diseño en paralelo: 5 conversaciones por briefing).

## Medición con el sondeo desplegado (9 oct, SAPA, cola real)
- Consulta (agente estándar): agente 17 s, total 30 s (13 s de espera de cron por insertarla con SQL; la app lanza el worker al momento). Antes: 65 s de media.
- Briefing (agente GitHub Copilot): agente 304 s, total 361 s, 11.017 caracteres (57 s de espera de cron por SQL). Conclusión medida: el sondeo quita ≤60 s; los ~300 s son del agente. Siguiente: probar el mismo trabajo en motor estándar.

## Agente «Redactor Briefing CB» (creado 9 oct, SIN publicar)
Copilot Studio, entorno Default-9680142b-e519-4506-8d12-c0704c2fafb4, editor clásico/motor ESTÁNDAR (Inicio › Otras formas de crear › Agente Estándar). Id `d184e3c0-8ec3-f111-a05c-7ced8d963860`. Objetivo: redactar el briefing a partir de hechos que recibe en el mensaje, SIN herramientas. Estado de configuración: (se completa abajo según se haga).

### Estado del «Redactor Briefing CB» y control de velocidad de redacción (9 oct)
- Configurado: modelo Claude Sonnet 4.6, orquestación generativa = Sí (guardada), instrucciones de `docs/crm-copilot/instrucciones-redactor-briefing-2026-10-09.txt` (5.427 de 8.000 car.). La pantalla «Probar» limita el mensaje a 2.000 caracteres (Direct Line: 256K).
- PROBLEMA SIN RESOLVER: sin herramientas ni conocimiento NO responde (cae en «No se encontró información…» / «no sé muy bien cómo ayudarle»), aunque la orquestación sea generativa. La documentación (advanced-generative-actions) no explica cómo contestar solo con instrucciones. No usarlo hasta resolverlo; opciones: darle un tema/herramienta mínima o usar el agente de Consultas como redactor. Agente creado y no publicado: borrar si se descarta.
- CONTROL decisivo (agente estándar de Consultas, sin herramientas, hechos ZZ, panel): primera respuesta a los 12 s y briefing largo (~9-13.000 car.) completo a los ~91 s. El agente de briefing (motor GitHub Copilot) tardó 304 s en hacer lectura + redacción. Confirma que el motor es el factor principal; redactar en estándar ≈ 90 s en un solo redactor, ~30-45 s con 2-3 redactores en paralelo.

## Camino rápido construido y probado (9 oct, SAPA, cola real) — interruptor `ajustes_app.briefing_rapido_activo` (APAGADO)
Código: `supabase/functions/procesar-briefings/{index,rapido,prompt-redactor}.ts`; tabla `briefing_tarea` (migración 155, aplicada). Lecturas en paralelo con el agente de Consultas + redacción con el prompt DENTRO del mensaje (copia en `docs/crm-copilot/instrucciones-redactor-briefing-2026-10-09.txt`; cambiar las dos a la vez).
Resultado: total 261 s (antes 361 s). Lecturas en paralelo: ofertas 69 s, licitaciones 65 s, oportunidades 34 s, Jira 26 s (la más lenta marca el paso); redacción 181 s (cuello de botella ahora). Salida: 10.549 car., 9 secciones, empieza por «Datos del CRM al …», sin marcas internas. Calidad del contenido SIN revisar por una persona.
Lecciones (ya en la guía): (1) un sondeo largo en la llamada del cron bloquea las siguientes llamadas de pg_net → el worker responde ya y sigue con `EdgeRuntime.waitUntil`; (2) con watermark Direct Line devuelve solo lo nuevo → acumular; `turn.complete` no es fiable → marca explícita `FIN-LECTURA` o «Fuente:»; (3) una FK nueva hacia `briefing_visita` hizo ambiguo el embed `visita:visita_id(...)` y rompió el worker (también el camino antiguo, ~20 min en producción sin pendientes procesados): usar `visita!briefing_visita_visita_id_fkey`.
Siguiente para bajar la redacción: 2-3 redactores en paralelo por bloques de secciones y/o redactor dedicado con modelo más rápido (arreglar «Redactor Briefing CB»).

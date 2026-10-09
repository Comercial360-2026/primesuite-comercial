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

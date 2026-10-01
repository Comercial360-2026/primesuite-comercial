> **REVISIÓN 2 oct 2026 — dos fases (migración 132).** El archivado ya no ocurre de golpe a los
> 30 días. **Fase 1 (al cerrar):** cada 10 min el worker copia a SharePoint lo de las visitas
> cerradas (fotos, audios y documentos); `confirmar-archivado-sharepoint` solo comprueba el
> tamaño y anota `ruta_sharepoint` + `copiada_sharepoint_en`; el original NO se toca y
> `ubicacion_archivo` sigue en `supabase`. **Fase 2 (a los 30 días del cierre y ≥1 día tras
> copiar):** se borra el original (solo fotos y audios: la app aún no abre documentos
> archivados) y `ubicacion_archivo` pasa a `sharepoint`. Una visita reabierta no se libera.
> Ya no se exige `estado_subida='completado'` (la app no lo marcaba: no se habría archivado
> ninguna captura real); basta `storage_path` no nulo. `procesar-archivado-sharepoint`
> acepta `{ "visita_id": … }` para procesar solo una visita (pruebas / reintento manual).
> Probado con ZZ contra SharePoint real: copia (foto, audio, documento con su nombre
> original), idempotencia, reapertura, liberación y captura tardía.
>
> **Salvaguardas (migración 133, probadas):** (1) `archivado_config.liberar_activo` — la fase 2
> NO borra originales mientras esté en `false`; ponerlo a `true` SOLO cuando la app con soporte de
> capturas archivadas (PR #16) esté en producción: `update archivado_config set liberar_activo = true;`
> (2) tope de 5 intentos de copia por archivo (`intentos_archivado`); al llegar al 5.º queda
> `error_archivado` visible para Dirección. Reintento manual: `update captura_libre set
> intentos_archivado = 0, error_archivado = null where …`. Probado también con documentos de 12 y
> 24 MB (copia exacta en SharePoint).
>
> **Pendiente anotado (no hecho):** cierre automático por inactividad; subir `informe.html`
> a la carpeta de la visita al copiar; estado de la copia visible en la app; qué hacer al
> borrar una captura/visita/cliente ya copiados (`docs/pendiente-borrado-sharepoint.md`);
> abrir documentos archivados en la app y liberar sus originales.

# Archivado automático de fotos/audios a SharePoint — diseño cerrado

Estado: **diseño cerrado, sin código todavío implementado** (sesión 2026-09-28,
continuación en sesión nueva el mismo día). Nivel de rigor: **Crítico**
(datos reales de clientes, migración y borrado automáticos en producción).

Motivación: el plan gratuito de Supabase tiene límite de espacio; lo que
realmente pesa son las fotos/audios de visitas, no el texto. SharePoint es
licencia corporativa ya pagada, sin problema de espacio. "Meter Rovo" quedó
cancelado, no se retoma.

## Idea central (hot/cold storage)

- **Nunca se borra la fila** de Supabase (`visita`, `nota`, `hallazgo`,
  `oportunidad`, `proximo_paso`, ni la fila de `captura_libre`) — solo migra
  el **binario**.
- Solo migran fotos/audios de **visitas individuales** cerradas hace más de
  **30 días** (periodo de enfriamiento; propuesto anoche, sin objeción,
  dado por cerrado). Si el proyecto sigue con visitas nuevas, la visita ya
  cerrada de hace 30 días se enfría igual — el enfriamiento es por visita,
  no por proyecto.
- La fila de `captura_libre` no desaparece: cambia de dónde apunta.

## Estructura de carpetas en SharePoint

**Cliente primero, no comercial primero** (decisión confirmada 28-09,
revirtiendo una propuesta de comercial-primero que se coló en esta misma
sesión): si se reasigna la cartera de un cliente a otro comercial, con
cliente-primero no hay nada que mover ni huérfanos que arrastrar.

```
PrimeNotes - Comerciales/<id cliente> - <nombre cliente>/<id proyecto> - <nombre proyecto>/visita-<AAAA-MM-DD>/
```

- Sitio: **PrimeNotes - CRM** (`DeptDIGDepartamentocomercial-Spain`). La
  carpeta raíz `PrimeNotes - Comerciales` **ya existe**, confirmado por
  Cesar — no hay que crearla.
- Licitaciones (`ProjDIGSeguimientoProyectosDigitek`) queda descartado del
  todo: es una carpeta de búsqueda de personas, sin relación con esto.
- Usar siempre el **id** (uuid), nunca solo el nombre — evita duplicar
  carpetas por clientes con nombre repetido, y sobrevive a que el cliente
  cambie de nombre después.

## Autenticación contra SharePoint: Power Automate, no Entra ID

**No hay Entra ID / app registration en este tenant.** Confirmado por
Cesar. En vez de bloquear el diseño en eso, se usa **Power Automate con la
licencia personal de Microsoft 365 de Cesar** — mismo patrón que ya usáis
para otras integraciones (carga de CRM, Direct Line):

- El conector **"SharePoint — Crear archivo"** es estándar, no premium —
  no debería chocar con el bloqueo de licencia premium que ya afecta a la
  búsqueda de texto en Licitaciones (ver
  `docs/crm-copilot/agente-consultas.md` §5c/§5l/§5n).
- El flujo corre con la identidad delegada de la cuenta que lo crea, sin
  depender de que un PC de escritorio esté encendido.

**Riesgo anotado, no resuelto por diseño — punto único de fallo:** todo el
archivado depende de la cuenta personal de Cesar. Si cambia de contraseña,
pierde acceso, o Microsoft pide reautenticar el flujo, el archivado se para
**en silencio** sin una pantalla de estado que lo detecte. Mitigación
obligatoria en la implementación: pantalla de estado (mismo patrón que
`briefings-uso.tsx` / consultas) que avise si lleva N días sin migrar nada
pendiente.

**Sin verificar todavía** (se confirma al construir el flujo, no bloquea el
diseño): límite de ejecuciones/día del plan de Power Automate de Cesar,
tamaño máximo de archivo del conector estándar.

## Esquema de datos — nuevas columnas en `captura_libre`

Verificado el esquema real en producción (`umrjzvpbcpzzqmkjahhn`, tabla
`captura_libre`, no hay tablas "fotos"/"audios" separadas — `tipo`
distingue foto/audio, hoy con `storage_path` + `storage_path_thumbnail`
apuntando a los buckets `fotos-visita`/`audios-visita`).

Columnas nuevas propuestas:

| Columna | Tipo | Uso |
|---|---|---|
| `ubicacion` | `text not null default 'supabase'` (check `in ('supabase','sharepoint')`) | Dónde vive el binario AHORA. |
| `ruta_sharepoint` | `text null` | Ruta del archivo original dentro del site de SharePoint. |
| `ruta_sharepoint_thumbnail` | `text null` | Ruta de la miniatura, si la hay. |
| `intento_archivado_en` | `timestamptz null` | Cuándo el cron marcó esta fila como "en proceso". Si pasan >15 min sin confirmación, se reintenta. |
| `error_archivado` | `text null` | Último error, para la pantalla de estado. Se limpia al reintentar. |

`storage_path`/`storage_path_thumbnail` se limpian (`null`) al confirmar
`ubicacion = 'sharepoint'` — ya no apuntan a nada, evita confusión y libera
el nombre para la limpieza de espacio ya existente
(`fn_visitas_liberables_proyecto`, migración 116).

## Flujo de archivado (cron)

Mismo patrón ya usado en `procesar-briefings`/`procesar-consultas`
(pg_cron + pg_net, cola con reintentos):

1. **Cron diario** selecciona capturas de visitas cerradas hace >30 días,
   con `ubicacion = 'supabase'` y (`intento_archivado_en is null` OR
   `intento_archivado_en < now() - interval '15 minutes'`).
2. Las marca `intento_archivado_en = now()` (evita que dos pasadas del
   cron cojan la misma fila a la vez).
3. Edge Function `procesar-archivado-sharepoint`: agrupa por visita, genera
   una `signed URL` corta de Supabase Storage por archivo (para que Power
   Automate pueda leer el binario sin credenciales propias de Supabase), y
   llama al webhook HTTP de Power Automate con:
   ```json
   {
     "secreto": "...",
     "visita_id": "...",
     "cliente_id": "...", "cliente_nombre": "...",
     "proyecto_id": "...", "proyecto_nombre": "...",
     "fecha_visita": "...",
     "archivos": [
       { "captura_id": "...", "tipo": "foto|audio", "nombre_archivo": "...", "url_origen": "...", "es_thumbnail": false }
     ]
   }
   ```
4. Power Automate descarga cada archivo desde `url_origen` y lo sube a la
   ruta cliente-primero. Al terminar, llama de vuelta a la Edge Function
   `confirmar-archivado-sharepoint` (con el mismo secreto) con el resultado
   por archivo — **no es una respuesta síncrona en la misma llamada**,
   porque archivos grandes (audios) pueden tardar más que el timeout de una
   Edge Function.
5. **Regla no negociable: no se borra el original hasta tener confirmación
   de éxito.** Si Power Automate no confirma (falla, timeout, red cortada a
   medias), la fila se queda con `ubicacion = 'supabase'` y
   `intento_archivado_en` vencido — el cron la vuelve a intentar en la
   siguiente pasada. Nunca "subida a medias + borrado igual".
6. `confirmar-archivado-sharepoint`, por cada archivo confirmado: pone
   `ubicacion = 'sharepoint'`, guarda las rutas, **borra el original de
   Supabase Storage con la Storage API** (nunca `DELETE FROM
   storage.objects` por SQL — Supabase lo bloquea siempre, ver migración
   120, incidente ya sufrido con `limpiar-backups-visita`).
   Por cada archivo con error: guarda `error_archivado`, limpia
   `intento_archivado_en` para reintento en la siguiente pasada.

## Flujo de lectura (cómo ve el comercial una foto ya archivada)

**Decisión: opción A — enlace generado al vuelo, con caducidad corta.**
Se descartó guardar un enlace anónimo permanente en la fila de
`captura_libre`: con datos de clientes reales en nivel Crítico, un enlace
público fijo guardado en BD sería un dato sensible expuesto sin control de
revocación si la BD se filtrara alguna vez (backup mal protegido, fuga).

- Nueva Edge Function `obtener-url-archivo-sharepoint(captura_id)`:
  verifica el mismo permiso con el que hoy se puede ver la visita, y si
  `ubicacion = 'sharepoint'`, llama a otro flujo de Power Automate
  (trigger HTTP, "generar enlace temporal") pasándole `ruta_sharepoint` y
  devuelve una URL con expiración corta — mismo patrón que las
  `createSignedUrl` que ya genera hoy `detalle-visita-cerrada.tsx` para
  Supabase Storage.
- Si `ubicacion = 'supabase'`: comportamiento actual, sin cambios.
- Coste: una llamada HTTP extra al abrir una visita ya archivada (no en el
  uso diario, solo a partir del día 30). Cachear la URL en memoria durante
  la sesión para no repetir la llamada al pasar de foto en foto dentro de
  la misma visita.

## Regenerar el PDF del proyecto

**Ya existe la generación bajo demanda** — el botón "Descargar resumen" en
[ficha-proyecto.tsx:559-582](../../src/features/proyectos/ficha-proyecto.tsx)
llama a `descargarInforme('proyecto', proyectoId)` la primera vez.

Limitación real hoy: una vez generado (`informeListo`), el botón pasa a
"Descargar el resumen otra vez" y solo re-descarga el PDF ya cacheado, sin
regenerar. Con el archivado, el PDF puede quedar con fotos/rutas
desactualizadas tras una migración a SharePoint.

**Cambio necesario (no un botón nuevo, se reutiliza el existente):** cuando
ya hay `informeListo`, añadir la opción de forzar una regeneración fresca
del mismo botón, en vez de limitarse a re-descargar el caché. El PDF
siempre se regenera completo desde cero (texto vivo de Supabase + fotos ya
migradas, trayéndolas de donde estén) — nunca se reimporta ni se parte de
uno anterior.

## Visibilidad del archivado para el comercial

**Decisión (28-09): tiene que estar, no queda invisible del todo.**

Cuando una visita tiene capturas con `ubicacion = 'sharepoint'`, mostrar un
indicador discreto — "Archivado en SharePoint" — con un enlace "Abrir
carpeta" que lleve directo a la carpeta real
(`.../visita-<fecha>/` del cliente/proyecto) para quien tenga acceso a ese
SharePoint. El resto del comportamiento sigue siendo transparente: las
fotos se ven igual en el visor, esto es solo un dato extra, no un cambio en
cómo se consumen.

Sitios candidatos para el indicador: ficha de proyecto (nivel proyecto,
puede enlazar a la carpeta del proyecto) y detalle de visita cerrada (nivel
visita, enlaza a la carpeta de esa visita en concreto). Se define el
detalle exacto al implementar.

## Fusión de clientes duplicados

**Riesgo ya anotado, sin resolver todavía — decidir en la implementación,
no en este diseño:** si se fusionan dos clientes que ya tienen carpetas de
SharePoint creadas (con archivos migrados bajo el id del cliente
absorbido), las dos carpetas no se fusionan solas. Dos caminos:

- Mover físicamente el contenido de la carpeta vieja a la nueva vía Power
  Automate — más correcto, más trabajo.
- Dejar la carpeta vieja tal cual (solo afecta a organización dentro de
  SharePoint, no rompe la app: la ruta guardada en `ruta_sharepoint` sigue
  siendo válida) y que las visitas nuevas del cliente fusionado usen ya el
  id nuevo — más simple, cabos sueltos solo visibles navegando SharePoint
  a mano.

Sin decidir cuál de las dos — bajo volumen esperado (fusiones no son
frecuentes), se puede empezar con la segunda y revisar si molesta en la
práctica.

## Riesgos — resumen

| Riesgo | Estado |
|---|---|
| Duplicados de cliente generan 2 carpetas | Resuelto por diseño (usar id) |
| Comercial que se va deja carpetas huérfanas | No aplica (cliente-primero) |
| Reintentos duplican archivos en SharePoint | Resuelto por diseño (ruta fija por id, idempotente) |
| Subida a medias por fallo de red | Resuelto por diseño (no se borra el original sin confirmación) |
| Borrado de `storage.objects` por SQL directo falla | Conocido de antes (migración 120) — usar Storage API |
| Fusión de clientes no fusiona carpetas | Sin resolver — decisión pospuesta a la implementación |
| Límites de Power Automate si sube todo de golpe | Mitigado por diseño (cola con reintentos, no todo junto) |
| Cuenta personal de Cesar como punto único de fallo | Mitigable, no eliminable — pantalla de estado obligatoria |
| Enlaces de lectura expuestos si se filtra la BD | Resuelto por diseño (enlace temporal al vuelo, no guardado) |

## Pendiente antes de escribir migraciones/Edge Functions

1. Crear el flujo de Power Automate (subida) y el flujo de generación de
   enlace temporal (lectura) en la cuenta de Cesar — fuera de este repo.
2. Confirmar límite de tamaño/ejecuciones del conector con el plan real de
   Power Automate de Cesar.
3. Migración SQL exacta (columnas de la tabla de arriba) + Edge Functions
   (`procesar-archivado-sharepoint`, `confirmar-archivado-sharepoint`,
   `obtener-url-archivo-sharepoint`) + cron.
4. Cambios en `ficha-proyecto.tsx` (forzar regeneración de PDF) y
   `detalle-visita-cerrada.tsx` (indicador + enlace, lectura vía la nueva
   Edge Function cuando `ubicacion = 'sharepoint'`).
5. Gate del auditor-de-disciplina antes de aplicar la migración en
   producción (nivel Crítico, dato real de clientes).

Relacionado: `docs/crm-copilot/agente-consultas.md` (mismo sitio de
SharePoint, mapa de carpetas de Licitaciones descartado para esto).

# Prompt maestro 08 — PDF de proyecto (cronología de sus visitas)

## Qué

Informe PDF de UN proyecto: portada con estado y resumen consolidado, y una
cronología con un bloque por cada visita **cerrada**, de la más antigua a la
más reciente. El «qué ha pasado en este proyecto» de un vistazo.

## Decisiones (todas cerradas con Cesar)

- **Agregado + por visita.** Portada + «01 Resumen del proyecto» (KPIs:
  visitas cerradas, oportunidades abiertas, ganadas, próximos pasos
  pendientes; + valor estimado abierto) + tablas de nivel proyecto
  (oportunidades abiertas, próximos pasos pendientes) + «Cronología de
  visitas» con bloque por visita (Resumen, Objetivo, Oportunidades,
  Hallazgos, Próximos pasos, línea de adjuntos).
- **Solo visitas cerradas** (`estado_captura in ('consolidada','cerrada')`).
  Las que siguen en curso se cuentan en un aviso de portada, no se incluyen:
  sin cierre no tienen resumen.
- **PDF suelto, sin fotos ni audios embebidos.** Cada visita indica «N
  fotos · M audios» y remite a su propio backup. El PDF pesa ~60 KB aunque
  haya muchas visitas.
- **Tope `MAX_VISITAS = 25`** (las más recientes). Con más, se avisa en la
  portada y en el título de la sección. Timeout de 45 s del hook sin tocar.
- **Autorización:** dirección comercial, o responsable del cliente en cartera
  (`cliente.responsable_id`), o participante de ≥1 visita del proyecto.
  (Cesar confirmó que el comercial con el cliente en cartera puede, aunque no
  haya ido a ninguna visita.)

## Cómo

### `supabase/functions/_shared/informe-pdf.ts` (prompt maestro 07 lo creó)

Se le añade `crearNumeradorSecciones()` — el «01 / 02 …» con su regla, que
antes vivía inline en generar-backup-visita. Ahora los dos informes lo
comparten. generar-backup-visita pasa a usarlo (PDF de visita verificado
idéntico: `_shared/informe-pdf.test.ts` + backup real de SAPA).

### `supabase/functions/generar-informe-proyecto/` (nueva)

Acepta `{ proyectoId }`. Sube `proyecto/<id>/<ts>.pdf` al bucket
`backups-visita` (reutilizado; el job de limpieza lo borra igual que a los
zip). Devuelve `{ url, expiraEnSegundos, tamanoBytes }`.
Datos por visita: 5 consultas `.in('visita_id', [...≤25])` agrupadas en
memoria (no N+1). Agregados de proyecto: por `proyecto_id`.

### `src/hooks/use-descargar-informe.tsx`

Generalizado: `descargar(tipo: 'visita' | 'proyecto', id)` +
`estadoDe(id)`. Un solo camino (timeout, guardado en disco, estados). Los
dos callers de visita (`cierre-visita`, `detalle-visita-cerrada`) pasan a
`descargar('visita', visitaId)`.

### `src/features/proyectos/ficha-proyecto.tsx`

`<FilaAccion titulo="Informe del proyecto">` dentro de `.lista-agrupada`,
tras «Historial de visitas» y antes de «Borrar proyecto». Mismo patrón exacto
que el informe en la ficha de visita cerrada (estados generando / sin-red /
error / descargado, enlace `<a href>` de reserva).

Sin migración. Dos edge functions desplegadas.

## Verificación (2026-09-08)

- `deno test _shared/informe-pdf.test.ts` — 5/5 (los 3 bloques compartidos y
  los diccionarios siguen idénticos al inline anterior).
- PDF de visita (SAPA) tras mover `tituloSeccion` a compartido: 661 KB,
  portada + 01-07 + KPIs + estados vacíos + chips + tablas + anexos —
  idéntico.
- PDF de proyecto, SAPA (2 visitas) y MADRID DIGITAL (3 visitas): portada
  (logo, cliente, «Proyecto · …», chip de estado, rango de fechas — se
  colapsa a una sola fecha si primera == última), 01 Resumen + KPIs (cuadran
  con SQL), 02 Oportunidades abiertas, 03 Próximos pasos pendientes,
  04 Cronología con un bloque por visita, cabecera/pie con nº de página.
- UI: `/clientes/:c/proyectos/:p` — la fila «Informe del proyecto» aparece en
  su sitio; al pulsar pasa a «Generando…», luego «Descregado (0.1 MB)» con
  enlace de re-descarga.
- frontend: typecheck + lint + build en verde.

## Clase / barrido

Feature nueva. Al extraer `crearNumeradorSecciones` se re-verificó que el PDF
de visita (prompt maestro 07) no cambia. Pendiente menor anotado: unificar
también `filaKPIs` (hoy duplicado ~18 líneas en cada función; layouts algo
distintos, no es divergencia de negocio).

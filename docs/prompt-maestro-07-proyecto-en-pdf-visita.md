# Prompt maestro 07 — `Proyecto · {nombre}` en la portada del PDF de visita

## Contexto

Desde el fin de «General» (prompt maestro 01/02), **toda visita tiene un
proyecto con nombre** y la app lo muestra siempre (agenda, repaso,
detalle-captura, cierre-visita, visita-activa…). El informe PDF de visita
era la única superficie que aún no lo enseñaba: la portada iba directa de
cliente a fecha.

## Alcance

Una línea en la portada. Nada del cuerpo del PDF. No es el PDF de proyecto
(feature aparte, cola #2).

## Cambios — `supabase/functions/generar-backup-visita/index.ts`

1. `interface VisitaRow`: `+ proyecto: { nombre: string } | null`.
2. `select` de la visita: `+ proyecto:proyecto_id(nombre)` (mismo patrón ya
   vivo en `detalle-captura.tsx`, `cierre-visita.tsx`, `visita-activa.tsx`).
3. Tras `const clienteInfo = visita.cliente`: `const proyectoInfo = visita.proyecto`.
4. Portada, bajo el nombre del cliente y antes de `metaCliente`:
   `{ text: 'Proyecto · ' + (proyectoInfo?.nombre ?? '—'), fontSize: 10.5, bold: true, color: COLOR.brand600, margin: [0, 0, 0, 8] }`.
   `visita.proyecto_id` es NOT NULL (migración 89); el `?? '—'` es defensivo.

Sin migración. Redesplegada la edge function.

## Verificación (2026-09-07)

Backup real de una visita (TOTAL · «Ampliación de sistema de
videovigilancia», en curso), sesión `comercial@test.local`
(direccion_comercial). `pdftotext` de la portada:

```
INFORME DE VISITA
TOTAL
Proyecto · Ampliación de sistema de videovigilancia
Visita · lunes, 7 de septiembre de 2026 · 09:00
```

Línea en su sitio, resto de la portada intacto (banner «en curso», tabla de
quiénes, histórico, pie).

## Clase / barrido

No es bug: omisión de una sola superficie. El resto de la app ya mostraba el
proyecto (cerrado en prompt maestro 02 / P11). Nada más que barrer aquí.

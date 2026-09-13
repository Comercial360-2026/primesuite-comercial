# Prompt maestro nº4 — Ficha de cliente + ficha de proyecto sin «General»

**Rama:** `feature/proyectos`. Cierra los 4 errores TS que quedan. Última pieza
del replanteo; después vienen P7b, Hoy visitas sin cerrar, P11.

## 4.1 · `ficha-proyecto.tsx` — quitar la fusión con la ficha de cliente (P8)

Línea 88: `if (proyectos && proyecto?.es_general) { <Navigate to …ficha cliente…/> }`.
Se **elimina** el bloque entero. Ya no hay proyecto sin pantalla propia: todos
los proyectos (incluido «Proyecto principal») tienen su ficha navegable.

## 4.2 · `ficha-proyecto.tsx` + `acciones-proyecto.tsx` — borrar proyecto con destino

`eliminar_proyecto` cambió de firma (migración 103): `(p_proyecto_id, p_destino_id)`.

- Línea 149 de `ficha-proyecto.tsx`: la llamada pasa a exigir `p_destino_id`.
- El botón «Borrar proyecto» abre `<ConfirmacionBorrado>` con un `<select>` de
  **a qué proyecto se mueve la actividad** (el resto de proyectos vigentes del
  cliente). Si el cliente **solo tiene este proyecto**, el botón se
  deshabilita con la nota «Es el único proyecto del cliente». (La RPC también
  lo bloquea server-side.)
- Patrón de destructivo intacto: `FilaNavegable tono="riesgo"` + confirmación +
  `.btn-peligro`, un solo rojo, sin color en línea.

## 4.3 · `ficha-cliente.tsx` — todos los proyectos son fila

Hoy (líneas 309-318, 656-663, 753-760):
- `general = proyectos.find(es_general)` — el «General» nunca es fila; su
  actividad va inline (`ActividadProyecto` con `historialClienteId` +
  `etiquetaGrupo="Sin proyecto asignado"`), y la barra `AccionesProyecto` se
  ancla a él.

Nuevo:
- **Sección «Proyectos»**: lista **todos** los proyectos como fila
  (`proyectosVigentes` = no terminados; «Ver terminados (N)» igual que ahora).
  Se quita el `find(es_general)` / `filter(!es_general)`. El `+` para crear,
  igual.
- **Barra `AccionesProyecto`** (Iniciar visita / Planificar): `proyectoId` deja
  de ser `general.id`. Pasa a `proyectoBase = proyectosVigentes[0] ?? proyectos[0]`
  como preselección; con 2+ proyectos, `ObjetivoVisitaModal` ya pregunta a
  cuál (sin cambios). Se muestra siempre que el cliente tenga ≥1 proyecto
  (siempre, por el modelo).

### Decisión abierta — el «Historial de visitas» del cliente

El bloque `ActividadProyecto` inline (que hoy muestra la actividad del General
**y**, vía `historialClienteId`, TODAS las visitas del cliente etiquetadas)
desaparece tal cual. La spec dice conservar «el historial = todas las visitas
del cliente». Dos caminos:

- **A — Sección propia «Historial de visitas» en la ficha de cliente.**
  Lista todas las visitas del cliente (cualquier proyecto), con el nombre del
  proyecto de subtítulo, navegables. Las oportunidades / hallazgos / próximos
  pasos «sueltos» ya no existen (todo cuelga de un proyecto): se ven entrando
  en cada proyecto. Coste: sacar el historial de `ActividadProyecto` a un
  componente/consulta propia (~media hora). **Recomendada** — mantiene la
  ficha de cliente como vista «todo».
- **B — Sin historial en la ficha de cliente.** La ficha de cliente solo
  lista proyectos; el historial se ve dentro de cada proyecto. Menos código,
  pero se pierde la vista agregada.

## 4.4 · Textos / ayuda

- `ayuda.ts` → `ficha-cliente`: hoy dice «un cliente siempre tiene al menos un
  proyecto — si nunca has creado ninguno, es el que se llama «General»».
  Reescribir: todo cliente nace con su primer proyecto, con nombre, visible.
- `ayuda.ts` → `ficha-proyecto`: revisar que no mencione el «General».
- Barrido final: `grep -rn "General" src/` para textos de usuario residuales.

## Cierre

`npm run typecheck && npm run lint && npm run build` en verde. Prueba en Chrome:
ficha de cliente con 1 proyecto (fila navegable, barra funciona), con 2+
(modal pregunta), borrar un proyecto (pide destino), borrar el único (bloqueado).
`graphify update .`. Commit.

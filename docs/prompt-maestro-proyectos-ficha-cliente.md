# Prompt maestro — modelo de proyectos en la ficha de cliente

**Rama:** `feature/proyectos`. **Fecha:** 2026-09-07. Cierra
[[primesuite-proyectos-en-ficha-cliente]] (los 11 flecos) — quitar el «General»
fantasma. Todo en local, sin push.

## Problema

Cada cliente nace con un proyecto `es_general=true`. Hoy la ficha de cliente:

- lista «General» como una fila más cuando hay proyectos con nombre → parece un
  proyecto vacío y **no navega** (su ficha se funde con la del cliente, `ficha-proyecto.tsx:79`);
- solo muestra la actividad del General y la barra «Iniciar visita» **si el
  General es el único proyecto**;
- su «Historial de visitas» solo trae las visitas del General, no las del cliente;
- no hay UI para renombrar / pausar / terminar / borrar un proyecto;
- no se puede mover una visita ya empezada o cerrada a otro proyecto.

## Decisiones de modelo (valen para todos los puntos)

1. **«General» nunca es una fila y nunca es una palabra visible.** En selectores
   su opción se llama **«Sin proyecto asignado»**; en ningún texto de usuario
   aparece «General».
2. La **actividad del General se muestra siempre en línea** en la ficha de
   cliente, bajo la sección «Proyectos». Si hay proyectos con nombre, con el
   rótulo **«Sin proyecto asignado»**; si el General es el único proyecto, sin
   rótulo (es toda la actividad del cliente).
3. Los **proyectos con nombre** sí tienen fila y ficha propia.
4. El **«Historial de visitas» de la ficha de cliente = todas las visitas del
   cliente**, de cualquier proyecto; subtítulo con el nombre del proyecto cuando
   no es el General.
5. Borrar un proyecto con nombre → su actividad (visitas, oportunidades,
   hallazgos, próximos pasos) **pasa al General**, no se pierde.

## Archivos

| Archivo | Qué cambia |
| --- | --- |
| `src/features/clientes/ficha-cliente.tsx` | P2·P3·P4·P5·P7 — actividad + barra siempre; lista con estados |
| `src/features/proyectos/actividad-proyecto.tsx` | P4 — prop de historial por cliente |
| `src/features/proyectos/acciones-proyecto.tsx` | P1 — selector de proyecto en el arranque ad-hoc |
| `src/features/visita/objetivo-visita-modal.tsx` | P1·P2 — `<select>` de proyecto dentro del modal |
| `src/features/hoy/repaso-cliente.tsx` | P2 — quita la card suelta, usa el selector del modal |
| `src/features/proyectos/ficha-proyecto.tsx` | P6·P8 — lápiz + estado + borrar; redirige si `es_general` |
| `src/features/visita/detalle-visita-cerrada.tsx` | P9 — fila «Proyecto» editable |
| `src/features/visita/visita-activa.tsx` | P9·P10 — fila «Proyecto» editable; barrido «General» |
| `src/features/visita/planificar-visita.tsx` | P10 — opción «Sin proyecto asignado» |
| `src/lib/ayuda.ts` | P11 — `ficha-cliente` y `ficha-proyecto` al modelo nuevo |
| `supabase/migrations/101_proyecto_borrado_estado_y_mover_visita.sql` | P6·P9 — RPCs |

---

## Los 11 puntos

### P0 — Barra inferior: dos botones en la misma línea

**Cesar, 2026-09-07.** Hoy `AccionesProyecto` es un botón primario «Iniciar
visita ahora» y **debajo** una pastilla (`chip`) «Planificar para otro día».
Pasan a ser **dos botones en la misma línea**: `<div style={{display:'flex',
gap:8}}>` con `btn btn-primary` **«Iniciar visita»** (con `flex:1`, mantiene el
chevron) y `btn btn-secondary` **«Planificar otro día»** (ancho natural). Mismo
componente → el cambio vale para la ficha de cliente y la de proyecto a la vez.
Deja de aplicarse aquí la regla 3 (esporádico = chip): Cesar lo quiere como
acción hermana, no secundaria escondida.

### P1 — Selector de proyecto al «Iniciar visita ahora» (ficha de cliente / proyecto)

- `ObjetivoVisitaModal` gana props opcionales `proyectos?: {id,nombre,es_general}[]`
  y `proyectoInicial?: string`. Si `proyectos` tiene 2+, dibuja un `<select>`
  **encima** del textarea (label «Proyecto»); opción del General = **«Sin
  proyecto asignado»** y va primera; el resto por `nombre`. `onConfirmar` pasa a
  `(objetivo, proyectoId)`.
- `AccionesProyecto`: nueva prop `proyectos` (lista del cliente) además de
  `proyectoId`. Si se le pasa `proyectoId` fijo (ficha de proyecto) → no hay
  selector, arranca en ese proyecto. Si se le pasa la lista sin fijo (ficha de
  cliente) → el modal muestra el selector, por defecto el General.
- Sin cambios cuando el cliente tiene un solo proyecto: no se ve selector.
- **También en `alta-rapida-cliente.tsx`** (vía "visitar un cliente existente
  que ha salido como coincidencia"): mismo caso ad-hoc, mismo selector. Se
  añade una query de proyectos del cliente elegido y se hilvana `proyectoId`
  por `encolarVisita`. La vía "cliente nuevo" no lleva selector (solo tiene el
  General). Cierra el fleco de no dejar una entrada sin el selector.

### P2 — Mismo selector en el arranque ad-hoc de «Repaso de cliente»

**Decidido (Cesar, 2026-09-07):** un solo patrón — el selector vive en el modal.

- **Se elimina la `card` «Proyecto»** suelta de `repaso-cliente.tsx` (líneas
  ~409-427). El arranque ad-hoc (`pedirIniciarVisitaAdHoc` → `ObjetivoVisitaModal`)
  usa el **mismo selector del modal** que P1: se le pasa `proyectosCliente`.
- La vía planificada (`visitaIdAgendada`) no lleva selector: el proyecto ya se
  fijó al planificar.

### P3 — Actividad del General + barra «Iniciar visita» siempre en la ficha de cliente

- `const general = proyectos?.find(p => p.es_general)`.
- `<ActividadProyecto>` se renderiza **siempre** con `proyectoId={general.id}`
  (hoy solo si el General es el único). Si hay proyectos con nombre, envuelto
  bajo un encabezado **«Sin proyecto asignado»** (`SeccionLista prominencia="tenue"`
  o un `<h_>` de sección, el que ya use la app); si el General es el único, sin
  encabezado.
- `<AccionesProyecto>` (barra inferior) se renderiza **siempre**, con la lista
  de proyectos (P1). Desaparece la variable `proyectoGeneral` (que solo valía
  para el caso «único»).

### P4 — «Historial de visitas» = todas las visitas del cliente

- `ActividadProyecto` gana prop `historialClienteId?: string`. Cuando viene:
  - la query `historial-visitas-proyecto` filtra por `cliente_id` en vez de
    `proyecto_id` (clave de query propia: `['historial-visitas-cliente', clienteId]`
    — no colisionar, ver [[primesuite-query-key-colision]]);
    `select` añade `proyecto:proyecto_id(nombre, es_general)`;
  - cada fila añade de subtítulo el `proyecto.nombre` si `!es_general` (junto al
    objetivo; si hay los dos, `objetivo · proyecto`).
- La ficha de cliente pasa `historialClienteId={clienteId}`. La ficha de
  proyecto **no** lo pasa (sigue viendo solo lo suyo).
- Oportunidades / próximos pasos / hallazgos del bloque en línea siguen
  acotados al General (son lo «sin proyecto asignado»). Solo el historial se
  amplía.

### P5 — Sección «Proyectos» vacía → `mensajeVacio`

- Cubierto por P3: `ActividadProyecto` ya pinta `EstadoLista vacio` con
  `mensajeVacio` cuando no hay nada. Se mantiene el texto genérico actual
  («Aún no hay oportunidades, hallazgos ni visitas. Empieza una visita para
  llenarlo.»). Sin código nuevo.

### P6 — Ficha de proyecto: renombrar · estado · borrar

En `ficha-proyecto.tsx` (nunca para el General — P8 lo saca de esta pantalla):

- **Renombrar** — `Icono nombre="editar"` (lápiz, `.boton-icono`) en `derecha`
  de `CabeceraDetalle` ([[primesuite-editar-icono-lapiz]]). Abre una `card`
  inline (input autofocus + `[Cancelar][Guardar]`), `UPDATE proyecto.nombre`.
  Invalida `['proyectos-cliente', clienteId]`.
- **Estado** — chips en la línea de contexto: según `estado` actual,
  «Pausar» / «Reactivar» y «Terminar» / «Reabrir». `UPDATE proyecto.estado`
  (`activo` | `pausado` | `terminado`). La `pol_proyecto_update` ya lo permite.
- **Borrar** — al fondo, `FilaNavegable tono="riesgo"` «Borrar proyecto» +
  `<ConfirmacionBorrado>` + `.btn-peligro` ([[primesuite-boton-destructivo]]).
  La confirmación cuenta lo que arrastra («N visitas, N oportunidades… pasan a
  quedar sin proyecto asignado; no se borra nada»). Ejecuta
  `rpc('eliminar_proyecto', { p_proyecto_id })`; al terminar navega a
  `/clientes/${clienteId}`. Botón deshabilitado / oculto si `es_general`.

### P7 — Proyectos terminados / pausados en la lista «Proyectos»

**Decidido (Cesar, 2026-09-07):**

- `activo` → fila normal, sin subtítulo de estado.
- `pausado` → fila normal con subtítulo «pausado».
- `terminado` → **plegado**. Al final de la sección, fila
  «Ver terminados (N)» / «Ocultar terminados» (mismo patrón que
  «Ver archivados» de hallazgos, `actividad-proyecto.tsx:244`). Al abrir, filas
  con subtítulo «terminado».
- `useProyectosCliente` ya devuelve todos; el filtro/plegado es de componente.

### P8 — `ficha-proyecto.tsx` redirige siempre que el proyecto sea `es_general`

- Condición actual (línea 79): `proyectos.length === 1 && proyectos[0].es_general
  && proyectos[0].id === proyectoId`.
- Nueva: en cuanto `proyectos` ha cargado y `proyecto?.es_general` →
  `<Navigate to={/clientes/${clienteId}} replace />`. El General nunca tiene
  pantalla propia, haya 1 o 5 proyectos.
- Comentarios de cabecera del archivo actualizados a este criterio.

### P9 — Cambiar el proyecto de una visita ya empezada o cerrada

- Fila **«Proyecto»** editable en:
  - `detalle-visita-cerrada.tsx` (visita cerrada),
  - `visita-activa.tsx` (visita en curso).
  Patrón: `FilaDato` con lápiz `.boton-icono` que abre un `<select>` de los
  proyectos del cliente (General = «Sin proyecto asignado»). Requiere conexión
  (UPDATE directo, como «Editar datos» del cliente).
- **Decidido (Cesar, 2026-09-07):** la visita se lleva todo lo suyo.
  Ejecuta `rpc('mover_visita_de_proyecto', { p_visita_id, p_proyecto_id })`:
  cambia `visita.proyecto_id` **y repunta** las oportunidades, hallazgos y
  próximos pasos capturados en esa visita (`where visita_id = p_visita_id`) al
  mismo proyecto — si no, quedarían huérfanos en el proyecto viejo (los
  hallazgos «se arrastran» por `proyecto_id`). Solo toca lo nacido en esa
  visita, no lo que venía arrastrado de antes.
- Invalida las queries de historial/actividad de ambos proyectos y de la ficha
  de cliente.
- Fuera de alcance: la visita **planificada** (su proyecto se elige al
  planificar; no lo pide este pase).

### P10 — «General» fuera de todo texto de usuario

- Barrido `grep -rn "General" src/features` (excluir comentarios y el concepto
  «zona/ubicación General» de la visita, que es otra cosa). Sitios de proyecto:
  - `ficha-cliente.tsx` — el subtítulo «Todo lo que no encaja en otro proyecto»
    de la fila General desaparece (el General ya no es fila, P3).
  - `planificar-visita.tsx:279` y selector de P1/P2 — opción del General =
    «Sin proyecto asignado», sin el subtítulo «Todo lo que no encaja…».
  - `visita-activa.tsx:1464` — ya oculta el General (`proyectoTexto`); confirmar
    que no queda ningún `· General` en cabeceras/subtítulos.
  - Resto (`agenda.tsx`, `detalle-captura.tsx`, `cierre-visita.tsx`,
    `detalle-hallazgo.tsx`, `detalle-proximo-paso.tsx`,
    `detalle-actividad-comercial.tsx`) — ya lo ocultan; solo verificar.
- Entregable: el `grep` sale limpio de «General» como texto de proyecto.

### P11 — Ayuda in-app (`ayuda.ts`), mismo commit

- `ficha-cliente`: reescribir `queEs` / `cuando` sin la palabra «General».
  «Proyectos»: la sección muestra siempre la actividad del cliente que no está
  en un proyecto con nombre; los proyectos con nombre tienen su ficha; «+» crea
  otra línea de negocio; barra inferior para arrancar/planificar.
- `ficha-proyecto`: añadir renombrar (lápiz), pausar/terminar, «ver terminados»,
  y que borrar un proyecto manda su actividad «a sin proyecto asignado», no la
  borra.
- `npm run ayuda:cobertura` sin regresiones.

---

## Migración `101_proyecto_borrado_estado_y_mover_visita.sql` (Supabase, no toca Netlify)

```sql
-- P6: borrar un proyecto con nombre; su actividad pasa al General del cliente.
create or replace function public.eliminar_proyecto(p_proyecto_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cliente uuid; v_es_general boolean; v_general uuid;
begin
  if not fn_comercial_actual_activo() then
    raise exception 'No autorizado';
  end if;
  select cliente_id, es_general into v_cliente, v_es_general
    from proyecto where id = p_proyecto_id;
  if v_cliente is null then raise exception 'Proyecto inexistente'; end if;
  if v_es_general then raise exception 'No se puede borrar el proyecto General'; end if;
  select id into v_general from proyecto
    where cliente_id = v_cliente and es_general = true;
  update visita        set proyecto_id = v_general where proyecto_id = p_proyecto_id;
  update oportunidad   set proyecto_id = v_general where proyecto_id = p_proyecto_id;
  update hallazgo      set proyecto_id = v_general where proyecto_id = p_proyecto_id;
  update proximo_paso  set proyecto_id = v_general where proyecto_id = p_proyecto_id;
  delete from proyecto where id = p_proyecto_id;
end $$;

-- P9: mover una visita (y lo capturado en ella) a otro proyecto del MISMO cliente.
create or replace function public.mover_visita_de_proyecto(
  p_visita_id uuid, p_proyecto_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cli_visita uuid; v_cli_proy uuid;
begin
  if not fn_comercial_actual_activo() then
    raise exception 'No autorizado';
  end if;
  select cliente_id into v_cli_visita from visita   where id = p_visita_id;
  select cliente_id into v_cli_proy   from proyecto where id = p_proyecto_id;
  if v_cli_visita is null or v_cli_proy is null or v_cli_visita <> v_cli_proy then
    raise exception 'La visita y el proyecto no son del mismo cliente';
  end if;
  update visita       set proyecto_id = p_proyecto_id where id = p_visita_id;
  update oportunidad  set proyecto_id = p_proyecto_id where visita_id = p_visita_id;
  update hallazgo     set proyecto_id = p_proyecto_id where visita_id = p_visita_id;
  update proximo_paso set proyecto_id = p_proyecto_id where visita_id = p_visita_id;
end $$;
```

*(Ajustar nombres de columnas `visita_id` según el esquema real de cada tabla al
implementar.)* Después: `generate_typescript_types` → `src/types/database.ts`.

## Commits (locales, sin push)

1. `feat(ficha-cliente): actividad e "Iniciar visita" siempre; historial de todo el cliente` (P3·P4·P5)
2. `feat(visita): selector de proyecto al iniciar visita ad-hoc` (P1·P2)
3. `feat(proyecto): renombrar, pausar/terminar y borrar desde su ficha` (P6·P8 + migración)
4. `feat(visita): mover una visita a otro proyecto desde su detalle` (P9 + migración)
5. `feat(ficha-cliente): proyectos terminados plegados` (P7)
6. `chore: "General" fuera de todo texto de usuario` (P10)
7. `docs(ayuda): ficha-cliente y ficha-proyecto al modelo nuevo` (P11)

*(Se pueden fusionar si salen pequeños; ayuda.ts va en el commit del cambio que
la afecta si es más natural.)*

## Verificación

- `npm run typecheck` · `npm run lint` · `npm run build` · `npm run ayuda:cobertura`.
- `grep -rn "General" src/features` → sin «General» como texto de proyecto.
- Chrome de pruebas:
  - **Cliente con 1 proyecto:** la ficha muestra su actividad y la barra
    «Iniciar visita»; no hay fila «General»; `/clientes/:id/proyectos/:general`
    redirige a la ficha.
  - **Cliente con 2+ proyectos:** sección «Proyectos» con las filas con nombre +
    bloque «Sin proyecto asignado» con su actividad + barra; «Iniciar visita
    ahora» abre el modal con selector (por defecto «Sin proyecto asignado»).
  - **Ficha de proyecto:** renombrar con el lápiz; pausar → subtítulo «pausado»;
    terminar → se pliega tras «Ver terminados»; borrar → su actividad aparece en
    «Sin proyecto asignado» de la ficha de cliente.
  - **Historial de cliente:** lista visitas de todos los proyectos, con el
    nombre del proyecto de subtítulo.
  - **Mover visita:** en una visita cerrada y en una en curso, cambiar el
    proyecto; comprobar que sale del historial del proyecto viejo y entra en el
    nuevo.
- Capturas: ficha de cliente (1 proyecto / 2+ proyectos), ficha de proyecto con
  las acciones, modal con selector.
- `graphify update .`

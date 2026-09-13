# Prompt maestro nº5 — Flecos del flujo «Nueva visita»

**Rama:** `feature/proyectos`. Sale del recorrido de Cesar (2026-09-07) tras
cerrar nº1-4. Cuatro cosas, de la más mecánica a la que toca criterio.

## 5.1 · El ← de la visita en curso siempre va a Hoy  ✅ fix claro

**Hoy:** `visita-activa.tsx` líneas 1283 y 1479 → `onVolver={() => navigate('/')}`
**fijo**. Da igual de dónde vengas (ficha de proyecto, ficha de cliente,
Agenda): el ← te lleva a Hoy.

**Fix:** usar el sistema `volver-a` que ya existe (Regla #14):
```ts
const volver = useVolverA('/');            // fallback: Hoy
// ...
onVolver={() => navigate(volver)}          // en las dos CabeceraDetalle
```
Los sitios que ya estampan origen (`ActividadProyecto` → historial de visitas,
`HistorialVisitasCliente`) pasan a volver bien. Los que no (arranque de visita
recién creada) siguen cayendo en Hoy, que es lo correcto ahí.
Comprobar que no queda ningún `navigate('/')` de ← sin cubrir en ese fichero.

## 5.2 · «Empezar» en gris sin decir por qué + cliente con solo proyectos terminados  ✅ fix claro

Dos huecos en `planificar-visita.tsx`:

a) **Paso «¿Cuándo?»**: el botón `Empezar` / `Planificar` está deshabilitado
   hasta escribir el objetivo, sin ningún texto. Añadir bajo el botón, cuando
   está deshabilitado por eso: `Escribe a qué vas para continuar.` (línea tenue,
   `var(--text-xs)`), mismo patrón que ya usa el modal.

b) **Cliente sin proyectos vigentes** (todos terminados): la pantalla se queda
   en blanco — el paso «¿en qué proyecto?» pide 2+, el paso «¿cuándo?» pide
   proyecto elegido, el autoselect pide exactamente 1. Cero salidas.
   Fix: si `proyectos` (vigentes) está cargado y `length === 0`, mostrar una
   tarjeta: «Este cliente no tiene ningún proyecto activo. Reactiva uno o crea
   otro desde su ficha.» + botón `Ir a la ficha del cliente`
   (`/clientes/${clienteId}`). Con el 5.4 (crear proyecto inline) esto se puede
   sustituir por el propio «+ Nuevo proyecto».

## 5.3 · Aviso «este cliente es de otro comercial»  ⚠️ decidir texto/alcance

**Hoy:** cualquier comercial o Dirección puede iniciar/planificar una visita a
**cualquier** cliente, sin aviso (RLS de `visita` INSERT = solo ser comercial
activo). No se informa de que el cliente es de otro.

**Propuesta:** aviso **no bloqueante** en el paso «¿Cuándo?» / la ventana
«¿A qué vas?», solo si `cliente.responsable_id` existe y `!== comercial.id`:

> Este cliente es de **{nombre del responsable}**. Puedes visitarlo igualmente;
> la visita quedará a tu nombre.

- Para **Dirección**, además, en «Otro día» ya existe el selector «Para» → sin
  cambio; en «Ahora» el aviso basta.
- **No** se propone bloquear ni pedir invitación. Si Cesar quiere el flujo
  «que la abra su comercial e invite», es otro prompt (toca notificaciones).

**A decidir:** ¿texto tal cual? ¿solo aviso, sin más?

## 5.4 · «+ Nuevo proyecto» al elegir proyecto  ⚠️ confirmar

**Hoy:** al iniciar/planificar una visita a un cliente con 2+ proyectos, el
selector (`planificar-visita.tsx` paso 2 y `ObjetivoVisitaModal`) **solo lista
los existentes**. Para dirigirla a un proyecto nuevo hay que salir, crearlo en
la ficha y volver.

**Propuesta:** añadir en ambos sitios una opción **«+ Nuevo proyecto»**:
- `planificar-visita.tsx` paso 2: una fila más `+ Nuevo proyecto` bajo la lista
  → despliega un campo de nombre → al confirmar crea el proyecto y lo
  selecciona.
- `ObjetivoVisitaModal`: cuando hay selector, una opción `+ Nuevo proyecto…` en
  el `<select>` (o un enlace debajo) → mismo campo inline.
- **Creación**: helper único `crearProyectoRapido({ clienteId, nombre, encolar })`
  en `src/lib/` — online `insert into proyecto`, sin red `encolar('proyecto',
  { clienteId, nombre })`; devuelve el `id`. Lo usa también el «Nuevo proyecto»
  que ya hay en la ficha de cliente (unifica, no duplica).
- Con **1 solo proyecto** hoy no se pregunta nada (se usa ese). Ahí **no** se
  añade «+»: si quieres otra línea de negocio, se crea desde la ficha. (Si
  Cesar lo quiere también con 1, se amplía.)

**A decidir:** ¿«+» solo cuando ya hay selector (2+), o también con 1 proyecto?

## Cierre

`npm run typecheck && lint && build`. Verificar en Chrome cada punto.
`graphify update .`. Un commit por punto (o 5.1+5.2 juntos, 5.3, 5.4).

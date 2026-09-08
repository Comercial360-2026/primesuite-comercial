# Prompt maestro 09 — «Empezar visita» como hoja, no como asistente

## Problema

El «+» de Hoy abre `/planificar`, una pantalla completa que mezcla dos
trabajos muy distintos:

- **empezar ahora** — el 90 %, en campo, con prisa;
- **planificar otro día** — administración de agenda.

Efectos: el «+» no dice qué hace; el buscador de cliente aparece vacío hasta
teclear 2 letras; elegir cliente lleva a otro paso, luego proyecto, luego
objetivo → se siente como «navegar lejos» para arrancar una visita.

## Solución

**Separar los dos caminos.** El «+» de Hoy abre una **hoja inferior
`EmpezarVisitaHoja`** (componente `HojaInferior` ya existe) que resuelve
«ahora» de principio a fin sin cambiar de pantalla hasta entrar en la visita.
`/planificar` se queda **solo para «otro día»** (agenda) y se alcanza desde un
enlace secundario de la hoja y desde las fichas de cliente/proyecto.

### `EmpezarVisitaHoja`

1. **Cliente.** Al abrir: lista ya poblada con **mis clientes recientes** —
   los que he visitado (participante, cualquier estado), más nuevos primero,
   deduplicados, tope 8. Teclear filtra (`ilike` sobre `vw_semaforo_cliente`,
   como hoy). Si no existe → «Crear «X» y seguir» (a `/clientes/nuevo`).
2. **Proyecto.** Si el cliente tiene **1 proyecto no terminado** →
   autoseleccionado, no se muestra el paso. Si son varios → **chips** en la
   misma hoja + «+ nuevo proyecto» inline (`crearProyectoRapido`).
3. **Objetivo + «Empezar».** Textarea de objetivo (obligatorio, como hoy) y
   botón. Aviso «cliente de otro comercial» inline. `VisitaEnCursoModal` si
   ya hay una abierta con ese cliente. Al empezar: `encolar` + `iniciarVisita`
   + `navigate('/visita/:id')` + cerrar hoja.
4. **Pie:** «¿Es para otro día? Planificar →» →
   `navigate('/planificar?clienteId=…&proyectoId=…')` con lo ya elegido.

Reutiliza la fontanería de `planificar-visita`: `useSyncQueue.encolar`,
`useVisitaActivaContext.iniciarVisita`, `useAvisoVisitaEnCurso`,
`crearProyectoRapido`, `VisitaEnCursoModal`. No se duplica la lógica de
arranque — se extrae a un helper `arrancarVisitaAhora()` que usan la hoja y
`planificar-visita`.

### El «+» de Hoy

Sigue en la cabecera (regla [[primesuite-anadir-mas-en-cabecera]]) pero con
**texto: «+ Visita»** — empezar una visita es LA acción principal de la app y
merece más peso que «nuevo cliente» / «nuevo comercial». Desviación
consciente de la homogeneidad icono-solo de las otras 3 cabeceras; si se
quiere alinear, es otra pasada.

### Fuera de alcance (anotado)

- `AccionesProyecto` («Iniciar visita» desde la ficha de proyecto) ya abre
  `ObjetivoVisitaModal` con el proyecto conocido — se deja.
- El «+» de `agenda.tsx` (calendario de mes) se deja apuntando a
  `/planificar` — desde un calendario, «otro día» es lo natural.

## Verificación

- Hoy → «+ Visita» abre la hoja con clientes recientes visibles sin teclear.
- Cliente de 1 proyecto: elegir cliente → escribir objetivo → «Empezar», sin
  pasos intermedios ni cambio de pantalla.
- Cliente de varios proyectos: chips en la hoja.
- Cliente nuevo, visita en curso previa, cliente de otro: todos los caminos.
- «Planificar →» lleva a `/planificar` con cliente/proyecto ya puestos.
- typecheck + lint + build.

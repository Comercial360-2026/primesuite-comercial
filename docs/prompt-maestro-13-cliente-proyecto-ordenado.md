# Prompt maestro 13 — Cliente y proyecto ordenados (2026-09-26)

Pedido por Cesar al revisar el Deploy Preview del PR #15 (ficha de SAPA).
Alcance acordado: 1) proyecto ordenado, 2) «Qué tiene instalado», 3) borrar
cliente solo Dirección + archivar, 4) marca de proyecto, 5) interlocutores
desde el CRM (aparte, necesita tocar la carga diaria).

## Análisis por perfiles

### Ficha de proyecto (`ficha-proyecto.tsx` + `actividad-proyecto.tsx`)
Para qué: ver qué está vivo en esta línea de negocio y entrar en sus visitas.

- **Comercial en la calle — NO CUMPLE.** Cinco listas seguidas (oportunidades,
  pasos, hallazgos, notas, historial). Lo que anotó en una visita sale dos
  veces: suelto arriba y otra vez dentro de la visita. Para saber «qué vi el
  día X» tiene que adivinar qué nota era de qué visita.
- **Director — CUMPLE A MEDIAS.** Ve las oportunidades y pasos abiertos (lo
  que sigue), pero el historial no dice qué salió de cada visita sin entrar.
- **Diseño — NO CUMPLE.** Regla 2 (una lista por concepto): notas y hallazgos
  son el mismo concepto que «lo de esa visita». Regla 1 (tres pesos): no hay
  jerarquía entre lo vivo y el archivo.

Cambios:
1. Arriba solo lo VIVO, que dura varias visitas: Oportunidades activas y
   Próximos pasos.
2. Fuera las secciones Notas y Hallazgos del proyecto: viven dentro de su
   visita (el detalle de visita ya las enseña). El resumen de hallazgos del
   cliente es «Qué tiene instalado».
3. «Historial de visitas» → «Visitas», y cada fila dice qué tiene dentro
   («2 notas · 1 hallazgo · 12 fotos», mismo desglose que Visita activa) y a
   qué fue (objetivo junto a la fecha).

### Ficha de cliente (`ficha-cliente.tsx`)
- **«Ecosistema» — NO CUMPLE (regla 6 y cero jerga).** Palabra que no dice
  nada, colgada bajo los proyectos cuando es del cliente entero.
  → «Qué tiene instalado», justo bajo Datos.
- **Proyectos indistinguibles — NO CUMPLE.** Todos iguales; el mismo nombre
  en texto en cada pantalla. → marca de proyecto: iniciales sobre un tono fijo
  (el `Avatar` de siempre, en cuadrado para no confundirlo con una persona),
  mismo hash por nombre en todas las pantallas. Las iniciales son la señal
  principal (regla 11, daltonismo); el color ayuda.
  Dónde: lista de proyectos del cliente, cabecera del proyecto, historial del
  cliente y selectores de proyecto (planificar, empezar visita).
  No numerar: el número no significa nada y cambia al borrar.
- **Borrar cliente — NO CUMPLE (la app hace lo que dice).** Con los clientes
  vinculados al CRM, borrar no es el caso normal: el normal es «ya no
  trabajamos con él». → «Archivar» (`estado_relacion = 'inactivo'`) para
  responsable o Dirección: sale de Clientes y de los buscadores de elegir
  cliente, conserva todo; se reactiva desde su ficha. «Borrar cliente» queda
  solo para Dirección (duplicados, pruebas). Liberar espacio ya existe por
  proyecto y por visita: no se duplica en el cliente.

## Barrido de sitios que listan clientes (para Archivar)
- `listado-clientes.tsx` — oculta archivados; «Ver archivados (N)» al final.
- `planificar-visita.tsx`, `empezar-visita-hoja.tsx` — no ofrecen archivados.
- `alta-rapida-cliente.tsx` — SÍ los enseña en «ya existe» (si no, se
  duplicaría), marcados «archivado»; al tocar se va a su ficha a reactivarlo.
- Resto (`repaso-cliente`, `visita-activa`, `cierre-visita`, `ficha-proyecto`,
  `detalle-comercial`, `deduplicacion`, `cuenta-crm`, avisos) leen un cliente
  concreto por id o cuentan: no cambian.

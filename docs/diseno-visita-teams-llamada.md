# Diseño: visitas por Teams y por llamada

Estado: propuesta para aprobar. Sin código aún.

## Hecho de partida (comprobado 2026-10-01)
- `visita.tipo_visita` es el **propósito** de la visita (siempre null hoy). No sirve para el medio.
- No existe ninguna columna que diga si la visita es presencial, por Teams o por llamada.
- La tabla `visita` no tiene enlace de reunión.

## Propuesta
1. **Migración 131**: `visita.medio text not null default 'presencial' check (medio in ('presencial','teams','llamada'))` y `visita.enlace_reunion text null` (solo Teams).
2. **Planificar y editar visita planificada**: selector `Segmentado` (patrón existente) Presencial / Teams / Llamada. Con Teams aparece el campo opcional «Enlace de la reunión».
3. **Detalle de visita planificada y visita en curso**: si hay enlace, fila «Unirse a la reunión» (`FilaNavegable`, sin texto subrayado). Llamada: sin acción extra.
4. **Visita en curso no presencial**: no se pide ubicación; fotos y notas siguen siendo opcionales; el briefing y la IA funcionan igual.
5. **Agenda (Hoy / Agenda / repaso)**: icono pequeño del medio junto a la hora.
6. **Briefing e IA**: el medio entra en el contexto («reunión por Teams», «llamada»).
7. **Archivado SharePoint**: sin cambios (sigue por capturas).

## Barrido obligatorio al implementar
Todos los sitios que leen `visita` con `tipo_visita` (agenda-del-dia, agenda, detalle-visita-planificada, detalle-visita-cerrada) y los que crean visitas. `ayuda.ts` se actualiza en el mismo commit.

## A comprobar antes de empezar
- Dónde se captura la ubicación al iniciar una visita, para saltarla en no presenciales.
- Si el cliente tiene teléfono guardado (para un botón «Llamar»).

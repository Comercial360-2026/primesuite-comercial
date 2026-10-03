-- 136: cómo se hace la visita — presencial, por Teams o por llamada.
--
-- `tipo_visita` es el PROPÓSITO (comercial/demo/técnica…), no el medio. El medio
-- es una columna aparte. Aditiva: las visitas existentes quedan como presenciales
-- por el valor por defecto, y la app anterior (que no la selecciona) sigue igual.
-- `enlace_reunion` solo tiene sentido en Teams.

alter table visita
  add column medio text not null default 'presencial'
    check (medio in ('presencial', 'teams', 'llamada')),
  add column enlace_reunion text;

comment on column visita.medio is 'Cómo se hace la visita: presencial (por defecto), teams o llamada.';
comment on column visita.enlace_reunion is 'Enlace de la reunión de Teams (opcional). Solo se usa con medio = teams.';

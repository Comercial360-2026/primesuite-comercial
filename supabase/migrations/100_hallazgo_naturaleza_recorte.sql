-- Recorte de la naturaleza del hallazgo (prompt maestro 10).
-- De 6 valores a 3: contexto ("Dato del cliente"), riesgo ("Me preocupa"),
-- competencia. Se quitan 'oportunidad' (pisaba a la entidad Oportunidad),
-- 'fortaleza' y 'proyecto_activo'. Los hallazgos con esos valores pasan a
-- 'contexto' — NO se convierten a Oportunidad retroactivamente.

alter table public.hallazgo drop constraint if exists hallazgo_naturaleza_check;

update public.hallazgo
set naturaleza = 'contexto'
where naturaleza in ('oportunidad', 'fortaleza', 'proyecto_activo');

alter table public.hallazgo
  add constraint hallazgo_naturaleza_check
  check (naturaleza in ('contexto', 'riesgo', 'competencia'));

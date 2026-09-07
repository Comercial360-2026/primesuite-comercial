-- 102 — Cuándo se abrió una visita, y fin del auto-cierre.
--
-- Problema: no guardábamos CUÁNDO una visita pasó a `en_curso`. `visita.fecha`
-- no vale (para una planificada es la fecha del plan, no la de arranque), así
-- que "esta visita lleva abierta desde…" era inexacto.
--
-- Y `fn_consolidar_visitas_antiguas` (cron cada hora) cerraba solo — pasaba
-- `en_curso` → `consolidada` a las 48h, sin avisar. Una visita la cierra el
-- comercial, punto. Se puede dar el coñazo con avisos, no cerrarla por él.
-- Se DESPROGRAMA el cron; la función se deja por si algún día se quiere una
-- limpieza manual, pero no se ejecuta.

alter table public.visita
  add column if not exists en_curso_desde timestamptz;

-- Trigger: al nacer una visita `en_curso` (ad-hoc) o al pasar de `agendada`
-- a `en_curso` (empezar una planificada), se sella la hora. Solo la primera
-- vez — si ya tiene valor no se toca (reabrir/editar no lo pisa).
create or replace function public.fn_set_visita_en_curso_desde()
  returns trigger
  language plpgsql
as $function$
begin
  if new.estado_captura = 'en_curso'
     and new.en_curso_desde is null
     and (tg_op = 'INSERT' or old.estado_captura is distinct from 'en_curso')
  then
    new.en_curso_desde := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_visita_en_curso_desde on public.visita;
create trigger trg_visita_en_curso_desde
  before insert or update on public.visita
  for each row execute function public.fn_set_visita_en_curso_desde();

-- Backfill: las que ya están abiertas se datan con su `fecha` (lo mejor que
-- hay para las históricas).
update public.visita
   set en_curso_desde = fecha
 where estado_captura = 'en_curso' and en_curso_desde is null;

-- Fin del auto-cierre.
select cron.unschedule('consolidar-visitas-antiguas');

-- "Mi espacio" > modo Seleccionar (borrado por lotes) no comprobaba nada:
-- borraba N visitas de golpe aunque alguna tuviera una oportunidad abierta
-- colgando (eliminar_visita_completa se la lleva por delante sin avisar).
-- El detalle de visita cerrada ya tiene este candado en "Descargar y
-- liberar espacio" (ver 1981bd0 y detalle-visita-cerrada.tsx); para aplicar
-- el mismo candado en el lote hace falta saber, por visita, si tiene
-- oportunidades sin cerrar — dato que fn_mis_visitas_espacio no traía.
drop function if exists public.fn_mis_visitas_espacio();
create function public.fn_mis_visitas_espacio()
returns table(
  visita_id uuid,
  cliente_nombre text,
  creado_en timestamp with time zone,
  bytes bigint,
  oportunidades_abiertas bigint
)
language sql
security definer
set search_path to 'public'
as $$
  select
    v.id as visita_id,
    cl.nombre as cliente_nombre,
    v.creado_en,
    coalesce(sum((o.metadata->>'size')::bigint), 0) as bytes,
    (
      select count(*) from oportunidad op
      where op.visita_origen_id = v.id and op.etapa <> 'cerrada'
    ) as oportunidades_abiertas
  from visita v
  join cliente cl on cl.id = v.cliente_id
  left join storage.objects o
    on o.bucket_id in ('fotos-visita', 'audios-visita')
    and split_part(o.name, '/', 1) = v.id::text
  where exists (
    select 1 from visita_participante vp
    where vp.visita_id = v.id and vp.comercial_id = auth.uid()
  )
  group by v.id, cl.nombre, v.creado_en
  order by v.creado_en desc;
$$;

-- 133: dos salvaguardas del archivado a SharePoint (migración 132).
--
-- 1) INTERRUPTOR de liberación. Liberar un original (borrarlo de Supabase) solo es
--    seguro cuando la app desplegada sabe leer capturas archivadas. Hasta que se
--    despliegue la app con ese soporte, `liberar_activo` queda en false y la fase 2 no
--    borra nada (la fase 1, copiar, sí corre: no destruye). El interruptor es la fila
--    'archivado_liberar_activo' de ajustes_app (la tabla de ajustes que ya existe).
--    Activarlo a mano:
--       update ajustes_app set valor = true where clave = 'archivado_liberar_activo';
-- 2) TOPE DE REINTENTOS. Sin él, una copia que no se confirma se reintentaba cada
--    10 min para siempre, sin que nadie se enterase. Tras 5 intentos deja de
--    reintentarse y queda `error_archivado` (lo ve Dirección en la visita cerrada).
--    Reintento manual: update captura_libre set intentos_archivado = 0, error_archivado = null where …;

insert into ajustes_app (clave, valor) values ('archivado_liberar_activo', false) on conflict (clave) do nothing;

create or replace function fn_capturas_para_liberar()
returns table (captura_id uuid, visita_id uuid, tipo text, storage_path text, storage_path_thumbnail text)
language sql security definer set search_path = public as $$
  select cl.id, cl.visita_id, cl.tipo, cl.storage_path, cl.storage_path_thumbnail
    from captura_libre cl
    join visita v on v.id = cl.visita_id
   where coalesce((select valor from ajustes_app where clave = 'archivado_liberar_activo'), false)
     and cl.tipo in ('foto', 'audio')
     and cl.ubicacion_archivo = 'supabase'
     and cl.ruta_sharepoint is not null
     and cl.storage_path is not null
     and cl.copiada_sharepoint_en < now() - interval '1 day'
     and v.estado_captura = 'consolidada'
     and v.cerrada_en is not null
     and v.cerrada_en < now() - interval '30 days';
$$;

alter table captura_libre add column intentos_archivado int not null default 0;

create or replace function fn_marcar_intento_archivado(p_captura_ids uuid[])
returns void
language sql security definer set search_path = public as $$
  update captura_libre
     set intento_archivado_en = now(),
         intentos_archivado = intentos_archivado + 1,
         error_archivado = case when intentos_archivado + 1 >= 5
           then 'Último intento de copia a SharePoint (5 de 5). Si no se confirma, revisar el flujo de Power Automate y poner intentos_archivado a 0 para reintentar.'
           else null end
   where id = any(p_captura_ids);
$$;

create or replace function fn_visitas_para_copiar()
returns table (visita_id uuid, cliente_id uuid, cliente_nombre text, proyecto_id uuid, proyecto_nombre text, fecha_visita timestamptz)
language sql security definer set search_path = public as $$
  select distinct v.id, c.id, c.nombre, p.id, p.nombre, v.fecha
    from visita v
    join cliente c on c.id = v.cliente_id
    join proyecto p on p.id = v.proyecto_id
    join captura_libre cl on cl.visita_id = v.id
   where v.estado_captura = 'consolidada'
     and v.cerrada_en is not null
     and cl.ubicacion_archivo = 'supabase'
     and cl.storage_path is not null
     and cl.ruta_sharepoint is null
     and cl.tipo in ('foto', 'audio', 'documento')
     and cl.intentos_archivado < 5
     and (cl.intento_archivado_en is null or cl.intento_archivado_en < now() - interval '15 minutes');
$$;

create or replace function fn_capturas_para_copiar(p_visita_id uuid)
returns table (captura_id uuid, tipo text, storage_path text, storage_path_thumbnail text)
language sql security definer set search_path = public as $$
  select cl.id, cl.tipo, cl.storage_path, cl.storage_path_thumbnail
    from captura_libre cl
   where cl.visita_id = p_visita_id
     and cl.ubicacion_archivo = 'supabase'
     and cl.storage_path is not null
     and cl.ruta_sharepoint is null
     and cl.tipo in ('foto', 'audio', 'documento')
     and cl.intentos_archivado < 5
     and (cl.intento_archivado_en is null or cl.intento_archivado_en < now() - interval '15 minutes');
$$;

create or replace function fn_confirmar_copia_captura(p_captura_id uuid, p_ruta_sharepoint text)
returns void
language sql security definer set search_path = public as $$
  update captura_libre
     set ruta_sharepoint = p_ruta_sharepoint,
         copiada_sharepoint_en = now(),
         intento_archivado_en = null,
         intentos_archivado = 0,
         error_archivado = null
   where id = p_captura_id;
$$;

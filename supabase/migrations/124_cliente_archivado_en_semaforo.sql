-- Archivar cliente (prompt maestro 13): «ya no trabajamos con él» es
-- `cliente.estado_relacion = 'inactivo'` (valor que ya admitía el CHECK).
-- Los tres sitios que listan clientes para elegir (Clientes, Nueva visita,
-- Empezar visita) leen vw_semaforo_cliente: se le añade el estado del
-- cliente maestro para que puedan ocultar los archivados. Columnas nuevas al
-- final: `create or replace view` solo permite añadir, no reordenar.

create or replace view vw_cliente_resuelto as
 SELECT c.id AS cliente_id,
    COALESCE(cm.id, c.id) AS cliente_maestro_id,
    COALESCE(cm.nombre, c.nombre) AS cliente_maestro_nombre,
    COALESCE(cm.estado_relacion, c.estado_relacion) AS cliente_maestro_estado_relacion
   FROM cliente c
     LEFT JOIN cliente cm ON cm.id = c.fusionado_en_id;

create or replace view vw_semaforo_cliente as
 SELECT cr.cliente_maestro_id AS cliente_id,
    cr.cliente_maestro_nombre AS cliente_nombre,
    max(v.fecha) AS ultima_visita,
    count(DISTINCT o.id) FILTER (WHERE (o.etapa <> 'cerrada'::text)) AS oportunidades_activas,
        CASE
            WHEN (count(DISTINCT o.id) FILTER (WHERE (o.etapa <> 'cerrada'::text)) > 0) THEN 'verde'::text
            WHEN (max(v.fecha) >= (now() - '90 days'::interval)) THEN 'amarillo'::text
            ELSE 'rojo'::text
        END AS semaforo,
    cr.cliente_maestro_estado_relacion AS estado_relacion
   FROM ((vw_cliente_resuelto cr
     LEFT JOIN visita v ON (((v.cliente_id = cr.cliente_id) AND (v.estado_captura <> 'agendada'::text))))
     LEFT JOIN oportunidad o ON ((o.cliente_id = cr.cliente_id)))
  GROUP BY cr.cliente_maestro_id, cr.cliente_maestro_nombre, cr.cliente_maestro_estado_relacion;

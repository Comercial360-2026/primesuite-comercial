-- Cliente creado a mano que luego aparece en el CRM: al vincularlo se puede adoptar el nombre de la cuenta del CRM.
-- El nombre que tenía hasta entonces se guarda en `nombre_alias` para que buscar «SAPA» siga encontrando a
-- «SAPA OPERACIONES, S.L.». Al desvincular se restaura. La vista de clientes (la que leen los buscadores de
-- Clientes, Empezar visita y Planificar) lo expone al final (`create or replace view` solo permite añadir columnas).
alter table cliente add column if not exists nombre_alias text;

create or replace view vw_cliente_resuelto as
 SELECT c.id AS cliente_id,
    COALESCE(cm.id, c.id) AS cliente_maestro_id,
    COALESCE(cm.nombre, c.nombre) AS cliente_maestro_nombre,
    COALESCE(cm.estado_relacion, c.estado_relacion) AS cliente_maestro_estado_relacion,
    COALESCE(cm.nombre_alias, c.nombre_alias) AS cliente_maestro_alias
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
    cr.cliente_maestro_estado_relacion AS estado_relacion,
    cr.cliente_maestro_alias AS nombre_alias
   FROM ((vw_cliente_resuelto cr
     LEFT JOIN visita v ON (((v.cliente_id = cr.cliente_id) AND (v.estado_captura <> 'agendada'::text))))
     LEFT JOIN oportunidad o ON ((o.cliente_id = cr.cliente_id)))
  GROUP BY cr.cliente_maestro_id, cr.cliente_maestro_nombre, cr.cliente_maestro_estado_relacion, cr.cliente_maestro_alias;

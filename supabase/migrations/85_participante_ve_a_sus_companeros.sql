-- Hasta ahora un participante que no fuera Dirección solo se veía a SÍ
-- MISMO en la lista de participantes (y, desde la mig. 82, a quien él
-- hubiera añadido). No podía ver ni al responsable ni al resto del
-- equipo de la visita. Con la opción C (el responsable gestiona
-- participantes) eso es un agujero claro.
--
-- Se añade fn_es_participante_de_visita(visita_id): si participas en una
-- visita, ves a todos los participantes de ESA visita. No abre nada más
-- (solo filas de visitas donde tú ya estás).

drop policy if exists pol_participante_select on visita_participante;
create policy pol_participante_select on visita_participante
  for select
  using (
    comercial_id = auth.uid()
    or anadido_por = auth.uid()
    or fn_es_participante_de_visita(visita_id)
    or fn_estado_captura_visita(visita_id) = 'consolidada'
    or fn_rol_actual() = 'direccion_comercial'
  );

-- DELETE en visita_participante estaba en "cualquier participante de la
-- visita puede borrar a cualquier otro" (fn_es_participante_de_visita).
-- Se acota a:
--   · tu propia fila            -> salir de la visita,
--   · el responsable            -> expulsar a un participante,
--   · Dirección Comercial.
-- La fila del responsable sigue sin poder borrarse: lo impide el trigger
-- fn_check_visita_tiene_responsable (la visita quedaría con 0).

drop policy if exists pol_participante_delete on visita_participante;
create policy pol_participante_delete on visita_participante
  for delete
  using (
    comercial_id = auth.uid()
    or fn_es_responsable_de_visita(visita_id)
    or fn_rol_actual() = 'direccion_comercial'
  );

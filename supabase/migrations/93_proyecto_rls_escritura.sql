-- Completa el RLS de proyecto (Fase 1 solo dejó SELECT) para que Fase 3/4
-- puedan construir "crear proyecto" / "renombrar" / "cambiar estado" sin
-- tener que volver a diseñar seguridad — mismo patrón abierto que cliente
-- (P2: proyecto hereda el modelo de cliente, cualquier comercial activo
-- puede crear/editar, sin restricción por responsable). No se añade policy
-- de DELETE: no hay ni habrá borrado directo de proyecto hasta Fase 6
-- (archivado), y eliminar_cliente_completo ya lo borra vía SECURITY DEFINER.
create policy pol_proyecto_insert on public.proyecto
  for insert with check (fn_comercial_actual_activo());

create policy pol_proyecto_update on public.proyecto
  for update using (fn_comercial_actual_activo()) with check (fn_comercial_actual_activo());

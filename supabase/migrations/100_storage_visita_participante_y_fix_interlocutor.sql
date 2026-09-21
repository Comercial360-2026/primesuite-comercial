-- Un comercial invitado a una visita (participante) no podía ver las fotos ni
-- los audios de compañeros mientras la visita seguía en curso: las políticas
-- de storage.objects para 'fotos-visita'/'audios-visita' solo miraban si eras
-- el autor del propio archivo o Dirección/preventa/consultoría, sin mirar
-- nunca visita_participante (a diferencia de sus políticas hermanas de
-- DELETE, que sí lo hacen). Se añade el caso: participante ACEPTADO de esa
-- visita también puede leer el binario. Se exige 'aceptado' (no 'pendiente')
-- para no adelantar acceso a quien todavía no ha confirmado la invitación.
alter policy pol_storage_fotos_select on storage.objects
using (
  bucket_id = 'fotos-visita'
  and (
    owner = auth.uid()
    or fn_rol_lectura_ampliada()
    or fn_rol_actual() = 'direccion_comercial'
    or exists (
      select 1 from captura_libre cl
      where cl.storage_path = objects.name
        and (
          cl.comercial_autor_id = auth.uid()
          or exists (
            select 1 from visita v
            where v.id = cl.visita_id and v.estado_captura = 'consolidada'
          )
          or exists (
            select 1 from visita_participante vp
            where vp.visita_id = cl.visita_id
              and vp.comercial_id = auth.uid()
              and vp.estado = 'aceptado'
          )
        )
    )
  )
);

alter policy pol_storage_audios_select on storage.objects
using (
  bucket_id = 'audios-visita'
  and (
    owner = auth.uid()
    or fn_rol_lectura_ampliada()
    or fn_rol_actual() = 'direccion_comercial'
    or exists (
      select 1 from captura_libre cl
      where cl.storage_path = objects.name
        and (
          cl.comercial_autor_id = auth.uid()
          or exists (
            select 1 from visita v
            where v.id = cl.visita_id and v.estado_captura = 'consolidada'
          )
          or exists (
            select 1 from visita_participante vp
            where vp.visita_id = cl.visita_id
              and vp.comercial_id = auth.uid()
              and vp.estado = 'aceptado'
          )
        )
    )
  )
);

-- Bug real de sobre-permiso: pol_visita_interlocutor_write comparaba
-- vp.visita_id consigo misma (tautología, siempre true) en vez de con
-- visita_interlocutor.visita_id. Efecto: cualquier comercial que participe
-- en AL MENOS una visita podía escribir/editar interlocutores de CUALQUIER
-- otra visita, no solo la suya.
alter policy pol_visita_interlocutor_write on visita_interlocutor
using (
  exists (
    select 1 from visita_participante vp
    where vp.visita_id = visita_interlocutor.visita_id
      and vp.comercial_id = auth.uid()
  )
);

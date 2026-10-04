-- Interruptor de la liberación MANUAL de espacio: la pantalla «Mi espacio» (con su lista de visitas
-- para liberar y la petición de Dirección «libera espacio»), el banner que manda a ella y el aviso
-- en «Yo». APAGADO por defecto: con el archivado a SharePoint y la liberación automática a los 30
-- días ya no hace falta. Apagado no se pierde nada: encendiéndolo vuelve todo. La protección de
-- cuota (se cortan fotos y audios cuando el espacio del equipo está lleno) no depende de él.
insert into ajustes_app (clave, valor) values ('espacio_manual_activo', false) on conflict (clave) do nothing;

-- Fotos y audios subidos desde la galería del móvil (no hechos en el momento): se marcan para decirlo en la ficha y el informe.
-- `creado_en` guarda la fecha de la propia foto (EXIF), así se ordenan por cuándo se hicieron.
alter table public.captura_libre add column if not exists desde_galeria boolean not null default false;

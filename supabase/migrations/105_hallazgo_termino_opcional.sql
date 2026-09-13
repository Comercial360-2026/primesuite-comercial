-- "Anotar" (prompt maestro 10, Paso 2): un solo gesto de captura en la
-- visita. El comercial escribe lo que ha visto y luego elige "¿qué es?";
-- el término del catálogo pasa a ser OPCIONAL ("¿de qué marca o sistema?").
-- Antes, crear un hallazgo obligaba a elegir término antes de escribir nada.
--
-- Un hallazgo sin término no entra en el "Ecosistema" de la ficha de
-- cliente (esa vista agrupa por término) — es lo esperado.

alter table public.hallazgo
  alter column termino_id drop not null;

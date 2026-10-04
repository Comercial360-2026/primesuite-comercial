-- Vinculación automática de clientes con el CRM (coincidencia exacta y única): si alguien la deshace o quita la cuenta a
-- mano, el cliente queda marcado para NO volver a vincularse solo (si no, al abrir la ficha se re-vincularía en bucle).
-- La sugerencia manual («Parece estar en el CRM…») sigue saliendo.
alter table cliente add column if not exists crm_no_autovincular boolean not null default false;

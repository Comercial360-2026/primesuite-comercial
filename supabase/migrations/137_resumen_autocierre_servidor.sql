-- Resumen automático de la visita en el servidor (hermano de src/lib/resumen-visita.ts:
-- misma lógica, mismas frases). Lo usa el cierre automático por inactividad para que la
-- visita nazca con su resumen, sin esperar a que alguien la abra (hasta ahora lo generaba el
-- cliente al abrirla la primera vez). Si se cambia una frase aquí, cambiarla también en TS.

create function fn_capitalizar_frase(t text)
returns text language sql immutable as $$
  select case
    when t is null or t = '' then t
    when regexp_replace(t, '[^[:alpha:]]', '', 'g') = ''
      or regexp_replace(t, '[^[:alpha:]]', '', 'g') <> upper(regexp_replace(t, '[^[:alpha:]]', '', 'g'))
      or upper(regexp_replace(t, '[^[:alpha:]]', '', 'g')) = lower(regexp_replace(t, '[^[:alpha:]]', '', 'g'))
    then t
    else upper(left(lower(t), 1)) || substr(lower(t), 2)
  end;
$$;

create function fn_lista_corta(nombres text[], maximo int)
returns text language sql immutable as $$
  with l as (select array_agg(btrim(n)) a from unnest(nombres) n where btrim(n) <> '')
  select case
    when a is null then ''
    when cardinality(a) <= maximo then array_to_string(a, ', ')
    else array_to_string(a[1:maximo], ', ') || ' y ' || (cardinality(a) - maximo) || ' más'
  end from l;
$$;

create function fn_resumen_visita_reglas(p_visita_id uuid)
returns text language plpgsql stable set search_path = public as $$
declare
  v_objetivo text;
  frases text[] := '{}';
  hall text[];
  opor text[];
  n_pasos int;
  pasos_txt text;
  n_fotos int; n_audios int; n_notas int;
  capturas text[];
  meses text[] := array['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic'];
begin
  select nullif(btrim(objetivo), '') into v_objetivo from visita where id = p_visita_id;
  if v_objetivo is not null then
    frases := frases || ('Ibas a: ' || fn_capitalizar_frase(v_objetivo) || '.');
  end if;

  select array_agg(regexp_replace(btrim(nota), '[.;,\s]+$', '') order by creado_en) into hall
    from hallazgo where visita_id = p_visita_id and btrim(coalesce(nota, '')) <> '';
  hall := array(select h from unnest(coalesce(hall, '{}')) h where h <> '');
  if cardinality(hall) > 0 then
    frases := frases || ('Hallazgos: ' || fn_lista_corta(hall, 2) || '.');
  end if;

  select array_agg(fn_capitalizar_frase(titulo) order by creado_en) into opor
    from oportunidad where visita_origen_id = p_visita_id;
  if cardinality(coalesce(opor, '{}')) > 0 then
    frases := frases || ('Oportunidad: ' || fn_lista_corta(opor, 3) || '.');
  end if;

  select count(*) into n_pasos from proximo_paso where visita_id = p_visita_id;
  if n_pasos > 0 then
    select string_agg(
             case when fecha_objetivo is not null
               then regexp_replace(fn_capitalizar_frase(btrim(descripcion)), '[.;,\s]+$', '')
                    || ' (' || extract(day from fecha_objetivo)::int || ' ' || meses[extract(month from fecha_objetivo)::int]
                    || ' ' || extract(year from fecha_objetivo)::int || ')'
               else fn_capitalizar_frase(btrim(descripcion)) end,
             '; ' order by creado_en)
      into pasos_txt
      from (select * from proximo_paso where visita_id = p_visita_id order by creado_en limit 3) p;
    frases := frases || ('Próximo paso: ' || pasos_txt || case when n_pasos > 3 then ' y ' || (n_pasos - 3) || ' más' else '' end || '.');
  end if;

  if cardinality(frases) <= (case when v_objetivo is not null then 1 else 0 end) then
    select count(*) filter (where tipo = 'foto'), count(*) filter (where tipo = 'audio'), count(*) filter (where tipo = 'nota')
      into n_fotos, n_audios, n_notas from captura_libre where visita_id = p_visita_id;
    capturas := '{}';
    if n_fotos > 0 then capturas := capturas || (n_fotos || case when n_fotos = 1 then ' foto' else ' fotos' end); end if;
    if n_audios > 0 then capturas := capturas || (n_audios || case when n_audios = 1 then ' audio' else ' audios' end); end if;
    if n_notas > 0 then capturas := capturas || (n_notas || case when n_notas = 1 then ' nota' else ' notas' end); end if;
    if cardinality(capturas) > 0 then
      frases := frases || ('Se ' || case when cardinality(capturas) = 1 and capturas[1] like '1 %' then 'registró' else 'registraron' end
                           || ' ' || array_to_string(capturas, ', ') || '.');
    end if;
  end if;

  return btrim(array_to_string(frases, ' '));
end;
$$;
revoke all on function fn_resumen_visita_reglas(uuid) from public, anon, authenticated;
grant execute on function fn_resumen_visita_reglas(uuid) to service_role;

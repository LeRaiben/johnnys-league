-- ============================================================================
-- Duelos de presidentes — esquema, RLS y funciones
-- Proyecto Supabase: hgmswhslnuqlzqbvuifw
--
-- Idempotente: se puede volver a ejecutar entero sin romper nada.
-- Ejecutar como owner (postgres) desde el editor SQL de Supabase.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tablas
-- ----------------------------------------------------------------------------

-- Un duelo entre dos presidentes.
-- La identidad es el id de Biwenger (clasificacion[].id), que no cambia aunque
-- alguien se renombre el equipo. El nombre se guarda solo para mostrar.
create table if not exists public.duelos (
  id              bigint generated always as identity primary key,
  creado          timestamptz not null default now(),
  retador_id      bigint not null,
  retador_nombre  text   not null,
  rival_id        bigint not null,
  rival_nombre    text   not null,
  estado          text   not null default 'pendiente',   -- pendiente | terminado
  puntos_retador  int,
  puntos_rival    int,
  terminado_el    timestamptz,
  constraint duelos_estado_valido check (estado in ('pendiente', 'terminado')),
  constraint duelos_rivales_distintos check (retador_id <> rival_id)
);

-- Las 8 preguntas, fijadas al crear el duelo para que ambos jueguen las mismas.
create table if not exists public.duelo_preguntas (
  id         bigint generated always as identity primary key,
  duelo_id   bigint not null references public.duelos(id) on delete cascade,
  orden      int  not null,                -- 1..8
  enunciado  text not null,
  opciones   jsonb not null,               -- ["Madriguana FC", "Seif fc", ...]
  correcta   int  not null,                -- índice 0..3
  categoria  text,
  unique (duelo_id, orden),
  constraint duelo_preguntas_orden_valido check (orden between 1 and 8),
  constraint duelo_preguntas_opciones_array check (jsonb_typeof(opciones) = 'array'),
  constraint duelo_preguntas_correcta_valida
    check (correcta >= 0 and correcta < jsonb_array_length(opciones))
);

-- Lo que contestó cada uno.
create table if not exists public.duelo_respuestas (
  id         bigint generated always as identity primary key,
  duelo_id   bigint  not null references public.duelos(id) on delete cascade,
  jugador_id bigint  not null,
  orden      int     not null,
  opcion     int,                           -- null = se le acabó el tiempo
  acierto    boolean not null,
  ms         int     not null,
  puntos     int     not null,
  creado     timestamptz not null default now(),
  unique (duelo_id, jugador_id, orden)
);

-- Un solo duelo pendiente por pareja, en cualquier sentido: así no se acumulan diez.
create unique index if not exists duelos_pareja_pendiente
  on public.duelos (least(retador_id, rival_id), greatest(retador_id, rival_id))
  where estado = 'pendiente';

-- Para el lobby: "te toca jugar" / "esperando al rival".
create index if not exists duelos_retador_idx on public.duelos (retador_id, estado);
create index if not exists duelos_rival_idx   on public.duelos (rival_id,   estado);
create index if not exists duelo_respuestas_duelo_idx
  on public.duelo_respuestas (duelo_id, jugador_id);


-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------

alter table public.duelos           enable row level security;
alter table public.duelo_preguntas  enable row level security;
alter table public.duelo_respuestas enable row level security;

-- duelos y respuestas: lectura pública (marcadores, ranking, historial).
drop policy if exists "leer duelos" on public.duelos;
create policy "leer duelos"
  on public.duelos for select to public using (true);

drop policy if exists "leer respuestas" on public.duelo_respuestas;
create policy "leer respuestas"
  on public.duelo_respuestas for select to public using (true);

-- Nadie escribe directamente en ninguna de las tres: no hay políticas de
-- insert/update/delete. Todo entra por las funciones security definer de abajo
-- y por la Edge Function crear-duelo (que usa la service_role y se salta RLS).

-- duelo_preguntas: NADIE la lee directamente. Sin política de select no hay
-- acceso, y además le quitamos el privilegio de tabla — doble candado, para que
-- una política añadida por despiste en el futuro no abra las respuestas.
revoke all on table public.duelo_preguntas from anon, authenticated;

-- Ojo: Supabase concede por defecto TODOS los privilegios (insert, update,
-- delete, truncate...) a anon y authenticated sobre cada tabla nueva de public.
-- RLS lo tapa, pero hay que quitarlos igual: si no, basta una política mal
-- puesta el día de mañana para que anon escriba marcadores a mano.
revoke insert, update, delete, truncate, references, trigger
  on table public.duelos           from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.duelo_respuestas from anon, authenticated;

grant select on table public.duelos           to anon, authenticated;
grant select on table public.duelo_respuestas to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Funciones
-- ----------------------------------------------------------------------------

-- Las 8 preguntas para jugar, SIN el campo correcta.
-- Falla si el jugador no es parte del duelo o si ya lo ha terminado.
-- Sí deja volver a pedirlas a medias: si se cierra el navegador en la pregunta
-- 4, se puede retomar. No se gana nada con ello — aquí nunca viaja la respuesta
-- correcta — y duelo_responder rechaza las preguntas ya contestadas.
create or replace function public.duelo_preguntas_para_jugar(
  p_duelo_id bigint,
  p_jugador_id bigint
)
returns table (orden int, enunciado text, opciones jsonb, categoria text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_duelo  public.duelos%rowtype;
  v_hechas int;
begin
  select * into v_duelo from public.duelos d where d.id = p_duelo_id;
  if not found then
    raise exception 'Ese duelo no existe' using errcode = 'P0002';
  end if;

  if p_jugador_id not in (v_duelo.retador_id, v_duelo.rival_id) then
    raise exception 'No juegas este duelo' using errcode = 'P0001';
  end if;

  if v_duelo.estado <> 'pendiente' then
    raise exception 'Este duelo ya está terminado' using errcode = 'P0001';
  end if;

  select count(*) into v_hechas
    from public.duelo_respuestas r
   where r.duelo_id = p_duelo_id and r.jugador_id = p_jugador_id;

  if v_hechas >= 8 then
    raise exception 'Ya has jugado este duelo' using errcode = 'P0001';
  end if;

  return query
    select q.orden, q.enunciado, q.opciones, q.categoria
      from public.duelo_preguntas q
     where q.duelo_id = p_duelo_id
     order by q.orden;
end;
$fn$;


-- Corrige una respuesta, calcula los puntos y la guarda.
-- Los puntos se calculan AQUÍ, nunca en el navegador:
--   acierto -> 100 + round(100 * (10000 - ms) / 10000)
--   fallo o tiempo agotado -> 0
-- El ms lo manda el cliente, pero se topa a [0, 10000]: nadie gana mandando 1ms
-- con una petición manual. Si ya había respuesta para ese (duelo, jugador,
-- orden), la rechaza — así nadie repite pregunta hasta acertar.
create or replace function public.duelo_responder(
  p_duelo_id bigint,
  p_jugador_id bigint,
  p_orden int,
  p_opcion int,
  p_ms int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_duelo      public.duelos%rowtype;
  v_correcta   int;
  v_ms         int;
  v_acierto    boolean;
  v_puntos     int;
  v_insertadas int;
begin
  select * into v_duelo from public.duelos d where d.id = p_duelo_id;
  if not found then
    raise exception 'Ese duelo no existe' using errcode = 'P0002';
  end if;

  if p_jugador_id not in (v_duelo.retador_id, v_duelo.rival_id) then
    raise exception 'No juegas este duelo' using errcode = 'P0001';
  end if;

  if v_duelo.estado <> 'pendiente' then
    raise exception 'Este duelo ya está terminado' using errcode = 'P0001';
  end if;

  select q.correcta into v_correcta
    from public.duelo_preguntas q
   where q.duelo_id = p_duelo_id and q.orden = p_orden;

  if not found then
    raise exception 'Esa pregunta no existe en este duelo' using errcode = 'P0002';
  end if;

  v_ms      := least(greatest(coalesce(p_ms, 10000), 0), 10000);
  v_acierto := p_opcion is not null and p_opcion = v_correcta;
  v_puntos  := case when v_acierto
                    then 100 + greatest(round(100.0 * (10000 - v_ms) / 10000)::int, 0)
                    else 0
               end;

  insert into public.duelo_respuestas
    (duelo_id, jugador_id, orden, opcion, acierto, ms, puntos)
  values
    (p_duelo_id, p_jugador_id, p_orden, p_opcion, v_acierto, v_ms, v_puntos)
  on conflict (duelo_id, jugador_id, orden) do nothing;

  get diagnostics v_insertadas = row_count;
  if v_insertadas = 0 then
    raise exception 'Esa pregunta ya la has contestado' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'acierto',  v_acierto,
    'correcta', v_correcta,
    'puntos',   v_puntos
  );
end;
$fn$;


-- Cierra el duelo si los dos han terminado sus 8 preguntas: suma, guarda el
-- marcador, marca estado = 'terminado' y publica el resultado en el tablón
-- (lo que dispara la push que ya existe a todo el grupo).
-- Se llama al acabar cada partida. Si falta el otro, no hace nada.
--
-- p_forzar = true (solo lo usa el cron de caducidad) cierra igualmente contando
-- lo que cada uno tenga: quien no jugó se lo lleva perdido.
create or replace function public.duelo_cerrar(
  p_duelo_id bigint,
  p_forzar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_duelo public.duelos%rowtype;
  v_n_ret int;
  v_n_riv int;
  v_p_ret int;
  v_p_riv int;
  v_texto text;
begin
  -- Bloqueo de fila: si los dos acaban a la vez, solo uno publica el resultado.
  select * into v_duelo from public.duelos d where d.id = p_duelo_id for update;
  if not found then
    raise exception 'Ese duelo no existe' using errcode = 'P0002';
  end if;

  if v_duelo.estado = 'terminado' then
    return jsonb_build_object(
      'cerrado', true,
      'ya_estaba', true,
      'puntos_retador', v_duelo.puntos_retador,
      'puntos_rival',   v_duelo.puntos_rival
    );
  end if;

  select count(*) filter (where r.jugador_id = v_duelo.retador_id),
         count(*) filter (where r.jugador_id = v_duelo.rival_id),
         coalesce(sum(r.puntos) filter (where r.jugador_id = v_duelo.retador_id), 0),
         coalesce(sum(r.puntos) filter (where r.jugador_id = v_duelo.rival_id),   0)
    into v_n_ret, v_n_riv, v_p_ret, v_p_riv
    from public.duelo_respuestas r
   where r.duelo_id = p_duelo_id;

  if not p_forzar and (v_n_ret < 8 or v_n_riv < 8) then
    return jsonb_build_object(
      'cerrado', false,
      'faltan_retador', greatest(8 - v_n_ret, 0),
      'faltan_rival',   greatest(8 - v_n_riv, 0)
    );
  end if;

  update public.duelos
     set estado         = 'terminado',
         puntos_retador = v_p_ret,
         puntos_rival   = v_p_riv,
         terminado_el   = now()
   where id = p_duelo_id;

  if p_forzar and (v_n_ret = 0 or v_n_riv = 0) then
    -- Caducado sin que uno de los dos llegara a abrirlo.
    v_texto := format('⌛ El duelo entre %s y %s ha caducado. Gana %s por incomparecencia.',
                      v_duelo.retador_nombre,
                      v_duelo.rival_nombre,
                      case when v_n_ret = 0
                           then v_duelo.rival_nombre
                           else v_duelo.retador_nombre end);
  elsif v_p_ret = v_p_riv then
    v_texto := format('⚔️ Empate en el duelo: %s %s - %s %s.',
                      v_duelo.retador_nombre, v_p_ret, v_p_riv, v_duelo.rival_nombre);
  else
    v_texto := format('⚔️ %s %s - %s %s. Gana %s.',
                      v_duelo.retador_nombre, v_p_ret, v_p_riv, v_duelo.rival_nombre,
                      case when v_p_ret > v_p_riv
                           then v_duelo.retador_nombre
                           else v_duelo.rival_nombre end);
  end if;

  insert into public.mensajes (nombre, texto) values ('Duelos', v_texto);

  return jsonb_build_object(
    'cerrado', true,
    'ya_estaba', false,
    'puntos_retador', v_p_ret,
    'puntos_rival',   v_p_riv
  );
end;
$fn$;


-- Caducidad: a los 3 días sin terminar, el duelo se cierra con lo que haya.
-- Pensada para un cron diario de Supabase (pg_cron), no para el navegador.
create or replace function public.duelos_caducar()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id bigint;
  v_n  int := 0;
begin
  for v_id in
    select d.id
      from public.duelos d
     where d.estado = 'pendiente'
       and d.creado < now() - interval '3 days'
  loop
    perform public.duelo_cerrar(v_id, true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;


-- ----------------------------------------------------------------------------
-- 4. Permisos de ejecución
-- ----------------------------------------------------------------------------

-- Mismo cuento que con las tablas: revocar solo de "public" NO basta, porque
-- Supabase concede EXECUTE explícitamente a anon y authenticated sobre toda
-- función nueva de public. Hay que nombrarlos.
revoke all on function public.duelo_preguntas_para_jugar(bigint, bigint)     from public, anon, authenticated;
revoke all on function public.duelo_responder(bigint, bigint, int, int, int) from public, anon, authenticated;
revoke all on function public.duelo_cerrar(bigint, boolean)                  from public, anon, authenticated;
revoke all on function public.duelos_caducar()                               from public, anon, authenticated;

grant execute on function public.duelo_preguntas_para_jugar(bigint, bigint)     to anon, authenticated;
grant execute on function public.duelo_responder(bigint, bigint, int, int, int) to anon, authenticated;
grant execute on function public.duelo_cerrar(bigint, boolean)                  to anon, authenticated;
-- duelos_caducar NO se expone: la llama el cron con la service_role.


-- ----------------------------------------------------------------------------
-- 5. Comprobación de seguridad (la que pide el paso 1 del plan)
-- ----------------------------------------------------------------------------
-- Pegar esto en el editor SQL de Supabase. Tiene que dar error de permisos.
-- Si devuelve las preguntas, la seguridad está mal:
--
--   begin;
--   set local role anon;
--   select * from public.duelo_preguntas;     -- permission denied for table
--   rollback;
--
-- Y esto, en cambio, tiene que funcionar y no traer la columna correcta:
--
--   begin;
--   set local role anon;
--   select * from public.duelo_preguntas_para_jugar(1, 11412340);
--   rollback;
--
-- Ejecutado el 2026-09-23 sobre el proyecto. Resultado, con rol anon:
--   duelo_preguntas          SELECT  -> permission denied for table  ✅
--   duelos                   SELECT  -> permitido                   ✅
--   duelo_respuestas         SELECT  -> permitido                   ✅
--   duelos                   INSERT  -> permission denied           ✅
--   duelos                   UPDATE  -> permission denied           ✅
--   duelo_respuestas         INSERT  -> permission denied           ✅
--   duelo_preguntas_para_jugar / duelo_responder / duelo_cerrar     ✅ ejecutan
--   duelos_caducar                   -> permission denied           ✅


-- ----------------------------------------------------------------------------
-- 6. Cron de caducidad
-- ----------------------------------------------------------------------------
-- A los 3 días sin terminar, el duelo se cierra con lo que haya y quien no
-- jugó lo pierde. Se ejecuta como postgres, que es el dueño de la función:
-- por eso funciona aunque duelos_caducar esté revocada para anon.
--
-- Ojo: al cerrar publica el resultado en `mensajes`, y eso dispara la push.

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'duelos-caducar';

-- 04:00 UTC = 06:00 en España en verano, 05:00 en invierno. A esa hora no hay
-- nadie a medio duelo.
select cron.schedule(
  'duelos-caducar',
  '0 11 * * *',
  $$select public.duelos_caducar();$$
);

-- Para comprobarlo:
--   select jobname, schedule, active from cron.job where jobname = 'duelos-caducar';
--   select * from cron.job_run_details order by start_time desc limit 5;

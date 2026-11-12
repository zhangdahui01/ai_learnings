-- The admin account of the visit dashboard. Everything is checked inside the database, because the key the
-- site uses to call these functions is public. Tables are closed (RLS on, no policies); only password and
-- session-token hashes are stored. Additive: safe to run again.
create table if not exists public.quiet_hall_admin (
  username text primary key, pass_hash text not null, failures int not null default 0,
  locked_until timestamptz, created_at timestamptz not null default now());
create table if not exists public.quiet_hall_admin_session (
  token_hash text primary key, username text not null, expires_at timestamptz not null);
alter table public.quiet_hall_admin enable row level security;
alter table public.quiet_hall_admin_session enable row level security;

create or replace function public.quiet_hall_admin_status() returns boolean
language sql security definer set search_path = public as $$ select exists (select 1 from quiet_hall_admin) $$;

-- The first caller sets the one admin account. After that this always answers 409.
create or replace function public.quiet_hall_admin_claim(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text;
begin
  perform pg_advisory_xact_lock(74120611);
  if exists (select 1 from quiet_hall_admin) then return jsonb_build_object('status', 409); end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,20}$' or p_password is null or length(p_password) not between 8 and 200 then
    return jsonb_build_object('status', 400);
  end if;
  insert into quiet_hall_admin (username, pass_hash) values (p_username, crypt(p_password, gen_salt('bf', 10)));
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into quiet_hall_admin_session values (encode(digest(v_token, 'sha256'), 'hex'), p_username, now() + interval '7 days');
  return jsonb_build_object('status', 200, 'token', v_token, 'username', p_username);
end $$;

-- Five wrong passwords pause the account for five minutes.
create or replace function public.quiet_hall_admin_login(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare a quiet_hall_admin; v_token text;
begin
  select * into a from quiet_hall_admin where username = p_username for update;
  if not found then return jsonb_build_object('status', 401); end if;
  if a.locked_until is not null and a.locked_until > now() then return jsonb_build_object('status', 429); end if;
  if p_password is null or a.pass_hash <> crypt(p_password, a.pass_hash) then
    update quiet_hall_admin set failures = case when failures >= 4 then 0 else failures + 1 end,
           locked_until = case when failures >= 4 then now() + interval '5 minutes' else null end where username = a.username;
    return jsonb_build_object('status', 401);
  end if;
  update quiet_hall_admin set failures = 0, locked_until = null where username = a.username;
  delete from quiet_hall_admin_session where expires_at < now();
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into quiet_hall_admin_session values (encode(digest(v_token, 'sha256'), 'hex'), a.username, now() + interval '7 days');
  return jsonb_build_object('status', 200, 'token', v_token, 'username', a.username);
end $$;

-- The visit log since a moment, newest first, for a signed-in admin. Null for anyone else.
create or replace function public.quiet_hall_admin_events(p_token text, p_since timestamptz, p_limit int default 10000) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_user text; v_limit int := least(greatest(coalesce(p_limit, 10000), 1), 10000);
begin
  select username into v_user from quiet_hall_admin_session
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now();
  if v_user is null then return null; end if;
  return jsonb_build_object('username', v_user, 'limit', v_limit,
    'total', (select count(*) from quiet_hall_events where at >= p_since),
    'events', coalesce((select jsonb_agg(to_jsonb(e) - 'id' order by e.at desc) from
       (select * from quiet_hall_events where at >= p_since order by at desc limit v_limit) e), '[]'::jsonb));
end $$;

create or replace function public.quiet_hall_admin_logout(p_token text) returns boolean
language sql security definer set search_path = public, extensions as $$
  with gone as (delete from quiet_hall_admin_session where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') returning 1)
  select exists (select 1 from gone) $$;

grant execute on function public.quiet_hall_admin_status(), public.quiet_hall_admin_claim(text, text), public.quiet_hall_admin_login(text, text),
  public.quiet_hall_admin_events(text, timestamptz, int), public.quiet_hall_admin_logout(text) to anon, authenticated;

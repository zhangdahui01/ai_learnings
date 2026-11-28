-- Seoul Life app schema. Every table is private to its owner through row level security.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_lang text not null default 'zh',
  korean_level text not null default 'beginner',
  preferences text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scene text not null check (scene in ('shelf','menu','cosmetics','subway')),
  need text not null default '',
  photo_path text,
  summary text not null default '',
  raw_result jsonb,
  created_at timestamptz not null default now()
);
create index scans_user_created on public.scans (user_id, created_at desc);

create table public.scan_items (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position int not null default 0,
  name_ko text not null default '',
  name_zh text not null default '',
  name_en text not null default '',
  purpose text not null default '',
  price_krw numeric,
  size_amount numeric,
  size_unit text,
  unit_price_text text,
  promo text,
  recommended boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);
create index scan_items_scan on public.scan_items (scan_id);
create index scan_items_user on public.scan_items (user_id);

create table public.vocab (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_ko text not null,
  romanization text not null default '',
  meaning_zh text not null default '',
  meaning_en text not null default '',
  hanja text,
  mnemonic text,
  scene text,
  source_scan_id uuid references public.scans(id) on delete set null,
  seen_count int not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, word_ko)
);
create index vocab_source_scan on public.vocab (source_scan_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vocab_id uuid not null references public.vocab(id) on delete cascade,
  due_at timestamptz not null default now(),
  interval_days numeric not null default 0,
  ease numeric not null default 2.5,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, vocab_id)
);
create index reviews_due on public.reviews (user_id, due_at);
create index reviews_vocab on public.reviews (vocab_id);

create table public.pronunciation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_text text not null,
  recording_path text,
  score numeric,
  syllable_scores jsonb,
  feedback text,
  created_at timestamptz not null default now()
);
create index pron_user on public.pronunciation_attempts (user_id, created_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode text not null check (mode in ('speak','listen')),
  scene text,
  text_ko text not null default '',
  text_zh text not null default '',
  created_at timestamptz not null default now()
);
create index conv_user on public.conversations (user_id, created_at desc);

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'Asia/Seoul')::date,
  kind text not null,
  count int not null default 0,
  primary key (user_id, day, kind)
);

alter table public.profiles enable row level security;
alter table public.scans enable row level security;
alter table public.scan_items enable row level security;
alter table public.vocab enable row level security;
alter table public.reviews enable row level security;
alter table public.pronunciation_attempts enable row level security;
alter table public.conversations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own scans" on public.scans for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own scan items" on public.scan_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own vocab" on public.vocab for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own reviews" on public.reviews for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own pronunciation" on public.pronunciation_attempts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own conversations" on public.conversations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Plans and usage counters are read-only to the user; only the server changes them.
create policy "read own subscription" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "read own usage" on public.usage for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Counts one use for today (Seoul time) and returns false once the daily limit is reached.
create or replace function public.bump_usage(p_kind text, p_limit int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_count int;
begin
  if v_uid is null then return false; end if;
  insert into public.usage (user_id, day, kind, count) values (v_uid, v_day, p_kind, 0)
    on conflict do nothing;
  select count into v_count from public.usage
    where user_id = v_uid and day = v_day and kind = p_kind for update;
  if v_count >= p_limit then return false; end if;
  update public.usage set count = count + 1
    where user_id = v_uid and day = v_day and kind = p_kind;
  return true;
end; $$;
revoke execute on function public.bump_usage(text, int) from public, anon;
grant execute on function public.bump_usage(text, int) to authenticated;

insert into storage.buckets (id, name, public) values
  ('scan-photos', 'scan-photos', false), ('recordings', 'recordings', false)
  on conflict do nothing;
create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id in ('scan-photos','recordings') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('scan-photos','recordings') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id in ('scan-photos','recordings') and (storage.foldername(name))[1] = (select auth.uid())::text);

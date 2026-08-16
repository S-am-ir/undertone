-- Undertone Supabase schema
-- Run in the SQL Editor. Backend uses the secret key (bypasses RLS).
-- If these credentials are missing or a write fails, the API falls back to local JSON.

create extension if not exists "pgcrypto";

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  intent_text text default '',
  intent_struct jsonb default '{}'::jsonb,
  preference_text text default '',
  events jsonb default '[]'::jsonb,
  guidance jsonb,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.sessions add column if not exists guidance jsonb;
alter table public.sessions add column if not exists payload jsonb default '{}'::jsonb;

create table if not exists public.skin_profiles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  selfie_path text,
  undertone text,
  depth text,
  contrast text,
  fitzpatrick text,
  skin_age float,
  concerns jsonb default '[]'::jsonb,
  palette jsonb default '[]'::jsonb,
  summary text,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  image_path text,
  category text default 'clothes',
  label text,
  color_features jsonb default '{}'::jsonb,
  rule_score float default 0,
  harmony_score float default 0,
  preference_score float default 0,
  final_score float default 0,
  tier text default 'mixed',
  reasons jsonb default '[]'::jsonb,
  short_verdict text default '',
  rank int,
  is_topk boolean default false,
  vto_status text default 'none',
  vto_path text,
  created_at timestamptz default now()
);

alter table public.sessions enable row level security;
alter table public.skin_profiles enable row level security;
alter table public.candidates enable row level security;

-- Storage buckets (also created on first upload if missing)
insert into storage.buckets (id, name, public)
values
  ('selfies', 'selfies', true),
  ('garments', 'garments', true),
  ('vtos', 'vtos', true)
on conflict (id) do nothing;

drop policy if exists "public read selfies" on storage.objects;
drop policy if exists "public read garments" on storage.objects;
drop policy if exists "public read vtos" on storage.objects;
create policy "public read selfies"
on storage.objects for select using (bucket_id = 'selfies');
create policy "public read garments"
on storage.objects for select using (bucket_id = 'garments');
create policy "public read vtos"
on storage.objects for select using (bucket_id = 'vtos');

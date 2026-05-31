-- Schema base do projeto Questão de Sucesso
-- Execute este arquivo no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.subthemes (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.themes(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.themes(id) on delete cascade,
  subtheme_id uuid references public.subthemes(id) on delete set null,
  level integer not null default 1 check (level between 1 and 4),
  number integer,
  intro text,
  command text not null,
  alt_a text not null,
  alt_b text not null,
  alt_c text not null,
  alt_d text not null,
  alt_e text not null,
  correct text not null check (correct in ('A', 'B', 'C', 'D', 'E')),
  exp_a text,
  exp_b text,
  exp_c text,
  exp_d text,
  exp_e text,
  created_at timestamptz not null default now(),
  updated_until date
);

create table if not exists public.programmatic_contents (
  id uuid primary key default gen_random_uuid(),
  subtheme_id uuid not null references public.subthemes(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_programmatic_contents (
  question_id uuid not null references public.questions(id) on delete cascade,
  content_id uuid not null references public.programmatic_contents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, content_id)
);

create table if not exists public.cover_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_data_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notebook_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  question_bg_data_url text not null,
  answer_bg_data_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.level_pages (
  id uuid primary key default gen_random_uuid(),
  level integer not null check (level between 1 and 4),
  name text not null,
  page_data_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.about_pages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  page_data_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subthemes_theme_id on public.subthemes(theme_id);
create index if not exists idx_questions_theme_id on public.questions(theme_id);
create index if not exists idx_questions_subtheme_id on public.questions(subtheme_id);
create index if not exists idx_questions_level on public.questions(level);
create index if not exists idx_questions_number on public.questions(number);
create index if not exists idx_programmatic_contents_subtheme_id on public.programmatic_contents(subtheme_id);
create index if not exists idx_question_programmatic_contents_question_id on public.question_programmatic_contents(question_id);
create index if not exists idx_question_programmatic_contents_content_id on public.question_programmatic_contents(content_id);

create trigger set_programmatic_contents_updated_at
before update on public.programmatic_contents
for each row
execute function public.set_updated_at();

create trigger set_cover_models_updated_at
before update on public.cover_models
for each row
execute function public.set_updated_at();

create trigger set_notebook_models_updated_at
before update on public.notebook_models
for each row
execute function public.set_updated_at();

create trigger set_level_pages_updated_at
before update on public.level_pages
for each row
execute function public.set_updated_at();

create trigger set_about_pages_updated_at
before update on public.about_pages
for each row
execute function public.set_updated_at();

alter table public.themes enable row level security;
alter table public.subthemes enable row level security;
alter table public.questions enable row level security;
alter table public.programmatic_contents enable row level security;
alter table public.question_programmatic_contents enable row level security;
alter table public.cover_models enable row level security;
alter table public.notebook_models enable row level security;
alter table public.level_pages enable row level security;
alter table public.about_pages enable row level security;

-- Políticas abertas para o app funcionar com a chave pública do projeto.
-- Use apenas se o sistema for de uso privado/controlado. Para produção pública, substitua por políticas com auth.uid().

drop policy if exists "Allow public select themes" on public.themes;
create policy "Allow public select themes" on public.themes for select using (true);
drop policy if exists "Allow public insert themes" on public.themes;
create policy "Allow public insert themes" on public.themes for insert with check (true);
drop policy if exists "Allow public update themes" on public.themes;
create policy "Allow public update themes" on public.themes for update using (true) with check (true);
drop policy if exists "Allow public delete themes" on public.themes;
create policy "Allow public delete themes" on public.themes for delete using (true);

drop policy if exists "Allow public select subthemes" on public.subthemes;
create policy "Allow public select subthemes" on public.subthemes for select using (true);
drop policy if exists "Allow public insert subthemes" on public.subthemes;
create policy "Allow public insert subthemes" on public.subthemes for insert with check (true);
drop policy if exists "Allow public update subthemes" on public.subthemes;
create policy "Allow public update subthemes" on public.subthemes for update using (true) with check (true);
drop policy if exists "Allow public delete subthemes" on public.subthemes;
create policy "Allow public delete subthemes" on public.subthemes for delete using (true);

drop policy if exists "Allow public select questions" on public.questions;
create policy "Allow public select questions" on public.questions for select using (true);
drop policy if exists "Allow public insert questions" on public.questions;
create policy "Allow public insert questions" on public.questions for insert with check (true);
drop policy if exists "Allow public update questions" on public.questions;
create policy "Allow public update questions" on public.questions for update using (true) with check (true);
drop policy if exists "Allow public delete questions" on public.questions;
create policy "Allow public delete questions" on public.questions for delete using (true);

drop policy if exists "Allow public select programmatic_contents" on public.programmatic_contents;
create policy "Allow public select programmatic_contents" on public.programmatic_contents for select using (true);
drop policy if exists "Allow public insert programmatic_contents" on public.programmatic_contents;
create policy "Allow public insert programmatic_contents" on public.programmatic_contents for insert with check (true);
drop policy if exists "Allow public update programmatic_contents" on public.programmatic_contents;
create policy "Allow public update programmatic_contents" on public.programmatic_contents for update using (true) with check (true);
drop policy if exists "Allow public delete programmatic_contents" on public.programmatic_contents;
create policy "Allow public delete programmatic_contents" on public.programmatic_contents for delete using (true);

drop policy if exists "Allow public select question_programmatic_contents" on public.question_programmatic_contents;
create policy "Allow public select question_programmatic_contents" on public.question_programmatic_contents for select using (true);
drop policy if exists "Allow public insert question_programmatic_contents" on public.question_programmatic_contents;
create policy "Allow public insert question_programmatic_contents" on public.question_programmatic_contents for insert with check (true);
drop policy if exists "Allow public update question_programmatic_contents" on public.question_programmatic_contents;
create policy "Allow public update question_programmatic_contents" on public.question_programmatic_contents for update using (true) with check (true);
drop policy if exists "Allow public delete question_programmatic_contents" on public.question_programmatic_contents;
create policy "Allow public delete question_programmatic_contents" on public.question_programmatic_contents for delete using (true);

drop policy if exists "Allow public select cover_models" on public.cover_models;
create policy "Allow public select cover_models" on public.cover_models for select using (true);
drop policy if exists "Allow public insert cover_models" on public.cover_models;
create policy "Allow public insert cover_models" on public.cover_models for insert with check (true);
drop policy if exists "Allow public update cover_models" on public.cover_models;
create policy "Allow public update cover_models" on public.cover_models for update using (true) with check (true);
drop policy if exists "Allow public delete cover_models" on public.cover_models;
create policy "Allow public delete cover_models" on public.cover_models for delete using (true);

drop policy if exists "Allow public select notebook_models" on public.notebook_models;
create policy "Allow public select notebook_models" on public.notebook_models for select using (true);
drop policy if exists "Allow public insert notebook_models" on public.notebook_models;
create policy "Allow public insert notebook_models" on public.notebook_models for insert with check (true);
drop policy if exists "Allow public update notebook_models" on public.notebook_models;
create policy "Allow public update notebook_models" on public.notebook_models for update using (true) with check (true);
drop policy if exists "Allow public delete notebook_models" on public.notebook_models;
create policy "Allow public delete notebook_models" on public.notebook_models for delete using (true);

drop policy if exists "Allow public select level_pages" on public.level_pages;
create policy "Allow public select level_pages" on public.level_pages for select using (true);
drop policy if exists "Allow public insert level_pages" on public.level_pages;
create policy "Allow public insert level_pages" on public.level_pages for insert with check (true);
drop policy if exists "Allow public update level_pages" on public.level_pages;
create policy "Allow public update level_pages" on public.level_pages for update using (true) with check (true);
drop policy if exists "Allow public delete level_pages" on public.level_pages;
create policy "Allow public delete level_pages" on public.level_pages for delete using (true);

drop policy if exists "Allow public select about_pages" on public.about_pages;
create policy "Allow public select about_pages" on public.about_pages for select using (true);
drop policy if exists "Allow public insert about_pages" on public.about_pages;
create policy "Allow public insert about_pages" on public.about_pages for insert with check (true);
drop policy if exists "Allow public update about_pages" on public.about_pages;
create policy "Allow public update about_pages" on public.about_pages for update using (true) with check (true);
drop policy if exists "Allow public delete about_pages" on public.about_pages;
create policy "Allow public delete about_pages" on public.about_pages for delete using (true);

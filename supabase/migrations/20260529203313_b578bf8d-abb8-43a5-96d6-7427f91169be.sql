create table if not exists public.notebook_models (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  question_bg_data_url text not null,
  answer_bg_data_url text not null
);

grant select, insert, update, delete on table public.notebook_models to anon;
grant select, insert, update, delete on table public.notebook_models to authenticated;
grant all on table public.notebook_models to service_role;

create index if not exists notebook_models_created_at_idx
  on public.notebook_models(created_at desc);

alter table public.notebook_models enable row level security;

drop policy if exists "public access notebook_models" on public.notebook_models;
create policy "public access notebook_models"
  on public.notebook_models
  for all
  to public
  using (true)
  with check (true);

drop trigger if exists notebook_models_set_updated_at on public.notebook_models;
create trigger notebook_models_set_updated_at
  before update on public.notebook_models
  for each row execute function public.set_updated_at();
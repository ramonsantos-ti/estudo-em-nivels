create table if not exists public.cover_models (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  image_data_url text not null
);

create index if not exists cover_models_created_at_idx 
on public.cover_models(created_at desc);

grant select, insert, update, delete on table public.cover_models to anon;
grant select, insert, update, delete on table public.cover_models to authenticated;
grant all on table public.cover_models to service_role;

alter table public.cover_models enable row level security;

create policy "public access cover_models"
on public.cover_models
for all
to public
using (true)
with check (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cover_models_set_updated_at on public.cover_models;

create trigger cover_models_set_updated_at
before update on public.cover_models
for each row execute function public.set_updated_at();
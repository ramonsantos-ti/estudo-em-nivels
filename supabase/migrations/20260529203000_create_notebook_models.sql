create table if not exists public.notebook_models (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  question_bg_data_url text not null,
  answer_bg_data_url text not null
);

create index if not exists notebook_models_created_at_idx on public.notebook_models(created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists notebook_models_set_updated_at on public.notebook_models;
create trigger notebook_models_set_updated_at
before update on public.notebook_models
for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.notebook_models to anon;
grant select, insert, update, delete on table public.notebook_models to authenticated;

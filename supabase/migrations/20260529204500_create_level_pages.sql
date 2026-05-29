create table if not exists public.level_pages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  level integer not null check (level between 1 and 4),
  name text not null,
  page_data_url text not null
);

create index if not exists level_pages_level_created_at_idx on public.level_pages(level, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists level_pages_set_updated_at on public.level_pages;
create trigger level_pages_set_updated_at
before update on public.level_pages
for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.level_pages to anon;
grant select, insert, update, delete on table public.level_pages to authenticated;

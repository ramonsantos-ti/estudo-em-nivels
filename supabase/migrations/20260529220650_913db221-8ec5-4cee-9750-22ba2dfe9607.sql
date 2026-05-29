create table if not exists public.level_pages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  level smallint not null,
  name text not null,
  page_data_url text not null
);

create index if not exists level_pages_level_created_at_idx on public.level_pages (level, created_at desc);

grant select, insert, update, delete on table public.level_pages to anon;
grant select, insert, update, delete on table public.level_pages to authenticated;
grant all on table public.level_pages to service_role;

alter table public.level_pages enable row level security;

create policy "public access level_pages" on public.level_pages for all using (true) with check (true);

drop trigger if exists level_pages_set_updated_at on public.level_pages;
create trigger level_pages_set_updated_at
before update on public.level_pages
for each row execute function public.set_updated_at();
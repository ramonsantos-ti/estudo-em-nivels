create table if not exists public.about_pages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  description text,
  page_data_url text not null
);

create index if not exists about_pages_created_at_idx on public.about_pages(created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists about_pages_set_updated_at on public.about_pages;
create trigger about_pages_set_updated_at
before update on public.about_pages
for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.about_pages to anon;
grant select, insert, update, delete on table public.about_pages to authenticated;

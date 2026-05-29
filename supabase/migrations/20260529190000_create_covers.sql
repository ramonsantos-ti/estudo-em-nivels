create table if not exists public.covers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  theme_id uuid references public.themes(id) on delete set null,
  title_line_1 text not null default '',
  title_line_2 text not null default '',
  title_line_3 text not null default '',
  subtitle text not null default '',
  badge_text text not null default 'MENOS TEORIA, MAIS RESULTADO!',
  quote_text text not null default 'Seu esforço hoje, sua conquista amanhã!',
  is_active boolean not null default true
);

create index if not exists covers_theme_id_idx on public.covers(theme_id);
create index if not exists covers_created_at_idx on public.covers(created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists covers_set_updated_at on public.covers;
create trigger covers_set_updated_at
before update on public.covers
for each row execute function public.set_updated_at();

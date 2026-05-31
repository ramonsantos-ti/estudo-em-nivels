create table if not exists public.programmatic_contents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  subtheme_id uuid not null references public.subthemes(id) on delete cascade,
  name text not null,
  description text
);

create table if not exists public.question_programmatic_contents (
  question_id uuid not null references public.questions(id) on delete cascade,
  content_id uuid not null references public.programmatic_contents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, content_id)
);

create index if not exists programmatic_contents_subtheme_idx on public.programmatic_contents(subtheme_id);
create index if not exists programmatic_contents_name_idx on public.programmatic_contents(name);
create index if not exists question_programmatic_contents_question_idx on public.question_programmatic_contents(question_id);
create index if not exists question_programmatic_contents_content_idx on public.question_programmatic_contents(content_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists programmatic_contents_set_updated_at on public.programmatic_contents;
create trigger programmatic_contents_set_updated_at
before update on public.programmatic_contents
for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.programmatic_contents to anon;
grant select, insert, update, delete on table public.programmatic_contents to authenticated;
grant select, insert, update, delete on table public.question_programmatic_contents to anon;
grant select, insert, update, delete on table public.question_programmatic_contents to authenticated;

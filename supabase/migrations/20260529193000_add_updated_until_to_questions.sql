alter table public.questions
add column if not exists updated_until date not null default current_date;

update public.questions
set updated_until = coalesce(created_at::date, current_date)
where updated_until is null;

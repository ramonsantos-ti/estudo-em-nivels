alter table public.covers
add column if not exists image_data_url text;

create index if not exists covers_image_data_url_present_idx
on public.covers ((image_data_url is not null));

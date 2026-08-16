-- Remove the declined FAQ feature from already-provisioned projects.

delete from public.site_copy where page = 'faq' or key like 'faq.%';
delete from public.photos where slot like 'faq.%';

drop table if exists public.faq_entries cascade;

alter table public.site_copy
  drop constraint if exists site_copy_page_check;

alter table public.site_copy
  add constraint site_copy_page_check
  check (page in ('index', 'food', 'drinks', 'wine'));

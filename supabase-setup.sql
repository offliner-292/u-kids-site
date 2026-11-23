-- U kids public demo setup. All data and attachments are intentionally shared with visitors.
-- Use only invented records and test files. This schema is not for real personal or student data.

create table if not exists public.ukids_demo_state (
  id smallint primary key check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ukids_demo_state enable row level security;

grant usage on schema public to anon;
grant select, insert, update on public.ukids_demo_state to anon;

drop policy if exists "demo visitors can read state" on public.ukids_demo_state;
drop policy if exists "demo visitors can create state" on public.ukids_demo_state;
drop policy if exists "demo visitors can update state" on public.ukids_demo_state;

create policy "demo visitors can read state"
  on public.ukids_demo_state for select to anon
  using (id = 1);

create policy "demo visitors can create state"
  on public.ukids_demo_state for insert to anon
  with check (id = 1);

create policy "demo visitors can update state"
  on public.ukids_demo_state for update to anon
  using (id = 1)
  with check (id = 1);

insert into public.ukids_demo_state (id, payload)
values (
  1,
  jsonb_build_object(
    'users', '[]'::jsonb,
    'tasks', '[]'::jsonb,
    'logs', '[]'::jsonb,
    'branches', '["Центр","Южный"]'::jsonb,
    'groups', '{"Центр":[{"name":"Группа А","schedule":"Утренняя"},{"name":"Группа В","schedule":"Послеобеда"}],"Южный":[{"name":"Группа Б","schedule":"Утренняя"}]}'::jsonb
  )
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('ukids-demo-files', 'ukids-demo-files', false, 26214400)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "demo visitors can read attachments" on storage.objects;
drop policy if exists "demo visitors can upload attachments" on storage.objects;
drop policy if exists "demo visitors can replace attachments" on storage.objects;
drop policy if exists "demo visitors can delete attachments" on storage.objects;

create policy "demo visitors can read attachments"
  on storage.objects for select to anon
  using (bucket_id = 'ukids-demo-files');

create policy "demo visitors can upload attachments"
  on storage.objects for insert to anon
  with check (bucket_id = 'ukids-demo-files');

create policy "demo visitors can replace attachments"
  on storage.objects for update to anon
  using (bucket_id = 'ukids-demo-files')
  with check (bucket_id = 'ukids-demo-files');

create policy "demo visitors can delete attachments"
  on storage.objects for delete to anon
  using (bucket_id = 'ukids-demo-files');

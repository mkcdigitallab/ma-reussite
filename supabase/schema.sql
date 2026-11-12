-- Évolia — schéma Supabase initial
-- Exécuter une seule fois sur un nouveau projet via Supabase SQL Editor.
-- Les comptes sont créés depuis Authentication > Users, puis associés en bas de ce fichier.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'tutor')),
  display_name text,
  tutor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tutor_cannot_be_assigned check (role <> 'tutor' or tutor_id is null)
);

create or replace function public.handle_new_evolia_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'student',
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_evolia_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_evolia on auth.users;
create trigger on_auth_user_created_evolia
after insert on auth.users
for each row execute procedure public.handle_new_evolia_user();

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  subject text not null,
  effort text not null,
  done text not null,
  learned text not null,
  hard text not null default '',
  next text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, day)
);

create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  message text not null,
  photo_path text,
  created_at timestamptz not null default now()
);

create index if not exists daily_logs_student_day_idx on public.daily_logs(student_id, day desc);
create index if not exists help_requests_student_created_idx on public.help_requests(student_id, created_at desc);
create index if not exists profiles_tutor_id_idx on public.profiles(tutor_id);

alter table public.profiles enable row level security;
alter table public.daily_logs enable row level security;
alter table public.help_requests enable row level security;

drop policy if exists "profile self or assigned tutor read" on public.profiles;
create policy "profile self or assigned tutor read" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or tutor_id = (select auth.uid()));

drop policy if exists "student reads own logs" on public.daily_logs;
drop policy if exists "assigned tutor reads logs" on public.daily_logs;
drop policy if exists "student or assigned tutor reads logs" on public.daily_logs;
create policy "student or assigned tutor reads logs" on public.daily_logs
for select to authenticated
using (
  student_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = daily_logs.student_id and p.tutor_id = (select auth.uid())
  )
);

drop policy if exists "student creates own logs" on public.daily_logs;
create policy "student creates own logs" on public.daily_logs
for insert to authenticated
with check (student_id = (select auth.uid()));

drop policy if exists "student updates own logs" on public.daily_logs;
create policy "student updates own logs" on public.daily_logs
for update to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

drop policy if exists "student reads own requests" on public.help_requests;
drop policy if exists "assigned tutor reads requests" on public.help_requests;
drop policy if exists "student or assigned tutor reads requests" on public.help_requests;
create policy "student or assigned tutor reads requests" on public.help_requests
for select to authenticated
using (
  student_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = help_requests.student_id and p.tutor_id = (select auth.uid())
  )
);

drop policy if exists "student creates own requests" on public.help_requests;
create policy "student creates own requests" on public.help_requests
for insert to authenticated
with check (student_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.daily_logs to authenticated;
grant select, insert, delete on public.help_requests to authenticated;

drop policy if exists "assigned tutor deletes logs" on public.daily_logs;
create policy "assigned tutor deletes logs" on public.daily_logs
for delete to authenticated
using (
  exists (select 1 from public.profiles p
    where p.id = daily_logs.student_id and p.tutor_id = (select auth.uid()))
);

drop policy if exists "assigned tutor deletes requests" on public.help_requests;
create policy "assigned tutor deletes requests" on public.help_requests
for delete to authenticated
using (
  exists (select 1 from public.profiles p
    where p.id = help_requests.student_id and p.tutor_id = (select auth.uid()))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
set public = false, file_size_limit = 8388608,
    allowed_mime_types = excluded.allowed_mime_types;

grant select, insert, delete on storage.objects to authenticated;

drop policy if exists "student uploads own photos" on storage.objects;
create policy "student uploads own photos" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'student-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "student and tutor read private photos" on storage.objects;
create policy "student and tutor read private photos" on storage.objects
for select to authenticated
using (
  bucket_id = 'student-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.tutor_id = (select auth.uid())
    )
  )
);

drop policy if exists "assigned tutor deletes student photos" on storage.objects;
create policy "assigned tutor deletes student photos" on storage.objects
for delete to authenticated
using (
  bucket_id = 'student-photos'
  and exists (
    select 1 from public.profiles p
    where p.id::text = (storage.foldername(name))[1]
      and p.tutor_id = (select auth.uid())
  )
);

-- Après création des comptes dans Authentication > Users, récupérer leurs UUID.
-- Remplacer les deux valeurs ci-dessous et exécuter dans SQL Editor :
-- update public.profiles set role = 'tutor', tutor_id = null,
--   display_name = 'Nom accompagnateur' where id = 'UUID_ACCOMPAGNATEUR';
-- update public.profiles set role = 'student', tutor_id = 'UUID_ACCOMPAGNATEUR',
--   display_name = 'Prénom élève' where id = 'UUID_ELEVE';

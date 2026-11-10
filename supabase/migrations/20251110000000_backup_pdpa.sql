-- =====================================================================
--  อัปเดต: ระบบสำรองข้อมูล + PDPA (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562)
--  รันไฟล์นี้ใน Supabase SQL Editor หลังจากรัน init_schema.sql แล้ว (รันซ้ำได้)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) การให้ความยินยอม (Consent) เก็บใน profiles
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists pdpa_consent_at timestamptz;
alter table public.profiles add column if not exists pdpa_consent_version text;

-- ผู้ใช้บันทึกการยินยอมของตนเอง (profiles แก้ไขได้เฉพาะ admin จึงต้องใช้ฟังก์ชันนี้)
create or replace function public.record_my_consent(p_version text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set pdpa_consent_at = now(), pdpa_consent_version = p_version
   where id = auth.uid();
end $$;

-- ถอนความยินยอม
create or replace function public.withdraw_my_consent()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set pdpa_consent_at = null, pdpa_consent_version = null
   where id = auth.uid();
end $$;

-- สมัครสมาชิกพร้อมยินยอม (ส่ง pdpa_consent_version มาใน user metadata)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t_id uuid;
  v_consent text := new.raw_user_meta_data ->> 'pdpa_consent_version';
begin
  select id into t_id from public.teachers
   where lower(email) = lower(new.email) and user_id is null
   limit 1;

  insert into public.profiles (id, email, full_name, role, pdpa_consent_at, pdpa_consent_version)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when t_id is not null then 'teacher'::public.user_role else 'student'::public.user_role end,
    case when v_consent is not null then now() end,
    v_consent
  )
  on conflict (id) do nothing;

  if t_id is not null then
    update public.teachers set user_id = new.id where id = t_id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2) คำร้องของเจ้าของข้อมูล (Data Subject Requests)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.data_request_type as enum ('access', 'correction', 'deletion', 'withdraw_consent', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.data_request_status as enum ('pending', 'in_progress', 'completed', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.data_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text,
  request_type  public.data_request_type not null,
  detail        text,
  status        public.data_request_status not null default 'pending',
  admin_note    text,
  created_at    timestamptz not null default now(),
  handled_at    timestamptz,
  handled_by    uuid references auth.users(id) on delete set null
);
create index if not exists data_requests_user_idx on public.data_requests(user_id, created_at desc);

alter table public.data_requests enable row level security;

drop policy if exists data_requests_own_read on public.data_requests;
create policy data_requests_own_read on public.data_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists data_requests_own_insert on public.data_requests;
create policy data_requests_own_insert on public.data_requests
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

drop policy if exists data_requests_admin_update on public.data_requests;
create policy data_requests_admin_update on public.data_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists data_requests_admin_delete on public.data_requests;
create policy data_requests_admin_delete on public.data_requests
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 3) Storage bucket สำหรับไฟล์สำรองข้อมูล (เฉพาะ admin)
-- ---------------------------------------------------------------------
do $$ begin
  insert into storage.buckets (id, name, public)
  values ('backups', 'backups', false)
  on conflict (id) do nothing;

  drop policy if exists "admin manage imports/exports" on storage.objects;
  drop policy if exists "admin manage app buckets" on storage.objects;
  create policy "admin manage app buckets" on storage.objects
    for all to authenticated
    using (bucket_id in ('imports', 'exports', 'backups') and public.is_admin())
    with check (bucket_id in ('imports', 'exports', 'backups') and public.is_admin());
exception when undefined_table then
  raise notice 'storage schema not found (skip)';
end $$;

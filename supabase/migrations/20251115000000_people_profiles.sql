-- =====================================================================
--  อัปเดต: โปรไฟล์และข้อมูลส่วนบุคคลของนักเรียนและครู
--  รันใน Supabase SQL Editor หลังจากไฟล์ migration ก่อนหน้า (รันซ้ำได้)
--
--  การออกแบบตาม PDPA:
--   * students          : ข้อมูลพื้นฐาน (ครูและผู้ดูแลเห็นได้ / นักเรียนเห็นเฉพาะของตนเอง)
--   * student_contacts  : ข้อมูลอ่อนไหว (เบอร์โทร ที่อยู่ วันเกิด ผู้ปกครอง)
--                         เห็นได้เฉพาะ เจ้าของข้อมูล + ครูที่ปรึกษาของกลุ่ม + ผู้ดูแลระบบ
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ข้อมูลครูเพิ่มเติม
-- ---------------------------------------------------------------------
alter table public.teachers add column if not exists position          text;   -- ตำแหน่ง เช่น ครู, ครูผู้ช่วย, พนักงานราชการ (ครู), ครูอัตราจ้าง
alter table public.teachers add column if not exists academic_standing text;   -- วิทยฐานะ เช่น ชำนาญการ, ชำนาญการพิเศษ
alter table public.teachers add column if not exists education         text;   -- วุฒิการศึกษา เช่น ค.อ.บ. วิศวกรรมเครื่องกล
alter table public.teachers add column if not exists phone             text;   -- เบอร์ติดต่อสำหรับงาน
alter table public.teachers add column if not exists photo_path        text;   -- path ใน bucket avatars
alter table public.teachers add column if not exists updated_at        timestamptz not null default now();

drop trigger if exists trg_teachers_updated on public.teachers;
create trigger trg_teachers_updated before update on public.teachers
  for each row execute function public.set_updated_at();

-- ครูที่ปรึกษาของกลุ่มเรียน
alter table public.student_groups add column if not exists advisor_teacher_id uuid references public.teachers(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2) นักเรียน
-- ---------------------------------------------------------------------
create table if not exists public.students (
  id               uuid primary key default gen_random_uuid(),
  student_code     text not null unique,                 -- รหัสประจำตัวนักเรียน
  prefix           text,                                 -- นาย / นางสาว / เด็กชาย / เด็กหญิง
  first_name       text not null,
  last_name        text not null,
  nickname         text,
  student_group_id uuid references public.student_groups(id) on delete set null,
  email            text unique,                          -- ใช้ผูกบัญชีล็อกอิน
  user_id          uuid unique references auth.users(id) on delete set null,
  entry_year       int check (entry_year is null or entry_year between 2500 and 2700),
  status           text not null default 'studying'
                   check (status in ('studying', 'suspended', 'graduated', 'resigned')),
  photo_path       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists students_group_idx on public.students(student_group_id);

drop trigger if exists trg_students_updated on public.students;
create trigger trg_students_updated before update on public.students
  for each row execute function public.set_updated_at();

-- ข้อมูลอ่อนไหวของนักเรียน (แยกตารางเพื่อจำกัดสิทธิ์การเห็น)
create table if not exists public.student_contacts (
  student_id      uuid primary key references public.students(id) on delete cascade,
  phone           text,
  birth_date      date,
  address         text,
  parent_name     text,
  parent_relation text,                                  -- บิดา / มารดา / ผู้ปกครอง
  parent_phone    text,
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_student_contacts_updated on public.student_contacts;
create trigger trg_student_contacts_updated before update on public.student_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3) Helper สำหรับสิทธิ์
-- ---------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'teacher' from public.profiles where id = auth.uid()), false)
$$;

-- ผู้ใช้ปัจจุบันเป็นครูที่ปรึกษาของนักเรียนคนนี้หรือไม่
create or replace function public.is_advisor_of(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
      join public.student_groups g on g.id = s.student_group_id
      join public.teachers t on t.id = g.advisor_teacher_id
     where s.id = p_student and t.user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------
-- 4) Row Level Security
-- ---------------------------------------------------------------------
alter table public.students enable row level security;
alter table public.student_contacts enable row level security;

drop policy if exists students_read on public.students;
create policy students_read on public.students for select to authenticated
  using (public.is_admin() or public.is_teacher() or user_id = auth.uid());
drop policy if exists students_admin_write on public.students;
create policy students_admin_write on public.students for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists student_contacts_read on public.student_contacts;
create policy student_contacts_read on public.student_contacts for select to authenticated
  using (
    public.is_admin()
    or public.is_advisor_of(student_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid())
  );
drop policy if exists student_contacts_admin_write on public.student_contacts;
create policy student_contacts_admin_write on public.student_contacts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5) View รายชื่อนักเรียน (เคารพ RLS ของผู้เรียก)
-- ---------------------------------------------------------------------
create or replace view public.student_directory
with (security_invoker = on) as
select
  s.id, s.student_code, s.prefix, s.first_name, s.last_name, s.nickname,
  coalesce(s.prefix, '') || s.first_name || ' ' || s.last_name as full_name,
  s.email, s.user_id, s.entry_year, s.status, s.photo_path, s.updated_at,
  s.student_group_id, g.group_code, g.group_name, g.department, g.level,
  g.advisor_teacher_id, t.name as advisor_name, t.teacher_code as advisor_code
from public.students s
left join public.student_groups g on g.id = s.student_group_id
left join public.teachers t on t.id = g.advisor_teacher_id;

-- ---------------------------------------------------------------------
-- 6) ผูกบัญชีผู้ใช้กับนักเรียน / ซิงก์กลุ่มเรียนไปยัง profiles
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t_id uuid;
  s_row public.students%rowtype;
  v_consent text := new.raw_user_meta_data ->> 'pdpa_consent_version';
  v_role public.user_role := 'student';
begin
  select id into t_id from public.teachers
   where lower(email) = lower(new.email) and user_id is null limit 1;
  if t_id is null then
    select * into s_row from public.students
     where lower(email) = lower(new.email) and user_id is null limit 1;
  end if;
  if t_id is not null then v_role := 'teacher'; end if;

  insert into public.profiles (id, email, full_name, role, student_group_id, pdpa_consent_at, pdpa_consent_version)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role,
    s_row.student_group_id,
    case when v_consent is not null then now() end,
    v_consent
  )
  on conflict (id) do nothing;

  if t_id is not null then
    update public.teachers set user_id = new.id where id = t_id;
  elsif s_row.id is not null then
    update public.students set user_id = new.id where id = s_row.id;
  end if;
  return new;
end $$;

-- เมื่อผู้ดูแลผูกบัญชี/ย้ายกลุ่มนักเรียน ให้ profiles อัปเดตตาม
create or replace function public.sync_student_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    update public.profiles
       set student_group_id = new.student_group_id,
           role = case when role = 'admin' then role else 'student'::public.user_role end
     where id = new.user_id;
  end if;
  if tg_op = 'UPDATE' and old.user_id is not null and old.user_id is distinct from new.user_id then
    update public.profiles set student_group_id = null where id = old.user_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_students_sync_profile on public.students;
create trigger trg_students_sync_profile
  after insert or update of user_id, student_group_id on public.students
  for each row execute function public.sync_student_profile();

-- ---------------------------------------------------------------------
-- 7) ให้เจ้าของข้อมูลแก้ไขข้อมูลติดต่อของตนเองได้ (เฉพาะคอลัมน์ที่อนุญาต)
-- ---------------------------------------------------------------------
create or replace function public.update_my_student_contact(
  p_nickname text, p_phone text, p_birth_date date, p_address text,
  p_parent_name text, p_parent_relation text, p_parent_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.students where user_id = auth.uid();
  if v_id is null then raise exception 'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลนักเรียน'; end if;
  update public.students set nickname = nullif(trim(p_nickname), '') where id = v_id;
  insert into public.student_contacts (student_id, phone, birth_date, address, parent_name, parent_relation, parent_phone)
  values (v_id, nullif(trim(p_phone), ''), p_birth_date, nullif(trim(p_address), ''),
          nullif(trim(p_parent_name), ''), nullif(trim(p_parent_relation), ''), nullif(trim(p_parent_phone), ''))
  on conflict (student_id) do update set
    phone = excluded.phone, birth_date = excluded.birth_date, address = excluded.address,
    parent_name = excluded.parent_name, parent_relation = excluded.parent_relation, parent_phone = excluded.parent_phone;
end $$;

create or replace function public.update_my_teacher_contact(p_phone text, p_education text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.teachers
     set phone = nullif(trim(p_phone), ''), education = nullif(trim(p_education), '')
   where user_id = auth.uid();
  if not found then raise exception 'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลครู'; end if;
end $$;

-- บันทึก path รูปโปรไฟล์ของตนเอง (path ต้องเป็นของตนเองเท่านั้น)
create or replace function public.set_my_photo(p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_t uuid; v_s uuid;
begin
  select id into v_t from public.teachers where user_id = auth.uid();
  select id into v_s from public.students where user_id = auth.uid();
  if v_t is not null and p_path = 'teachers/' || v_t then
    update public.teachers set photo_path = p_path where id = v_t;
  elsif v_s is not null and p_path = 'students/' || v_s then
    update public.students set photo_path = p_path where id = v_s;
  else
    raise exception 'ไม่มีสิทธิ์ตั้งค่ารูปนี้';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 8) Storage: รูปโปรไฟล์ (bucket ส่วนตัว อ่านได้เฉพาะผู้ที่ล็อกอิน)
--    path: teachers/<teacher_id>  หรือ  students/<student_id>
-- ---------------------------------------------------------------------
do $$ begin
  insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false)
  on conflict (id) do nothing;

  drop policy if exists "avatars read" on storage.objects;
  create policy "avatars read" on storage.objects for select to authenticated
    using (bucket_id = 'avatars');

  drop policy if exists "avatars write own or admin" on storage.objects;
  create policy "avatars write own or admin" on storage.objects for all to authenticated
    using (bucket_id = 'avatars' and (
      public.is_admin()
      or exists (select 1 from public.teachers t where t.user_id = auth.uid() and name = 'teachers/' || t.id)
      or exists (select 1 from public.students s where s.user_id = auth.uid() and name = 'students/' || s.id)))
    with check (bucket_id = 'avatars' and (
      public.is_admin()
      or exists (select 1 from public.teachers t where t.user_id = auth.uid() and name = 'teachers/' || t.id)
      or exists (select 1 from public.students s where s.user_id = auth.uid() and name = 'students/' || s.id)));
exception when undefined_table then
  raise notice 'storage schema not found (skip)';
end $$;

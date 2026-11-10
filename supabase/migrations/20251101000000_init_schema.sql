-- =====================================================================
--  ระบบจัดตารางเรียน-ตารางสอน วิทยาลัยการอาชีพโพนทอง
--  Supabase (PostgreSQL) schema : ตาราง / ฟังก์ชัน / RLS / Storage / Realtime
--  รันไฟล์นี้ครั้งเดียวใน Supabase SQL Editor (หรือ `supabase db push`)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.schedule_status as enum ('draft', 'published');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- ภาคเรียน (semesters)  config = เวลาเรียน/คาบ/คาบที่ห้ามจัด (JSONB)
-- ---------------------------------------------------------------------
create table if not exists public.semesters (
  id            uuid primary key default gen_random_uuid(),
  academic_year int  not null check (academic_year between 2500 and 2700),
  term          int  not null check (term in (1, 2, 3)),
  name          text generated always as (term::text || '/' || academic_year::text) stored,
  start_date    date,
  end_date      date,
  is_active     boolean not null default false,
  config        jsonb not null default '{
    "days": [1, 2, 3, 4, 5],
    "periods": [
      {"no": 1, "start": "08:00", "end": "09:00"},
      {"no": 2, "start": "09:00", "end": "10:00"},
      {"no": 3, "start": "10:00", "end": "11:00"},
      {"no": 4, "start": "11:00", "end": "12:00"},
      {"no": 5, "start": "13:00", "end": "14:00"},
      {"no": 6, "start": "14:00", "end": "15:00"},
      {"no": 7, "start": "15:00", "end": "16:00"},
      {"no": 8, "start": "16:00", "end": "17:00"}
    ],
    "lunch_after_period": 4,
    "blocked": [{"day": 3, "periods": [7, 8], "label": "กิจกรรมชมรม/ลูกเสือ"}],
    "max_periods_per_day_group": 8
  }'::jsonb,
  created_at    timestamptz not null default now(),
  unique (academic_year, term)
);

-- มีภาคเรียน active ได้เพียง 1 ภาคเรียน
create unique index if not exists semesters_one_active
  on public.semesters ((is_active)) where is_active;

-- ---------------------------------------------------------------------
-- รายวิชา (subjects)
-- ---------------------------------------------------------------------
create table if not exists public.subjects (
  id                 uuid primary key default gen_random_uuid(),
  subject_code       text not null unique,
  subject_name       text not null,
  theory_hours       int  not null default 0 check (theory_hours >= 0),
  lab_hours          int  not null default 0 check (lab_hours >= 0),
  credits            numeric(4,1),
  required_room_type text not null default 'theory',
  department         text,
  created_at         timestamptz not null default now(),
  check (theory_hours + lab_hours > 0)
);

-- ---------------------------------------------------------------------
-- ครูผู้สอน (teachers)
-- unavailable_times : [{"day":1,"periods":[1,2]}, ...]
-- ---------------------------------------------------------------------
create table if not exists public.teachers (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid unique references auth.users(id) on delete set null,
  teacher_code       text not null unique,
  name               text not null,
  email              text unique,
  department         text,
  max_hours_per_week int  not null default 24 check (max_hours_per_week > 0),
  unavailable_times  jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(unavailable_times) = 'array'),
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ห้องเรียน (rooms)
-- room_type : theory | computer_lab | workshop_auto | workshop_basic | electrical_lab | ...
-- ---------------------------------------------------------------------
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  room_code  text not null unique,
  room_name  text not null,
  room_type  text not null default 'theory',
  capacity   int  not null default 40 check (capacity > 0),
  building   text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- กลุ่มนักเรียน (student_groups)
-- is_parallel + parallel_ref_id : กลุ่มคู่ขนาน -> วิชาเดียวกัน ครูคนเดียวกัน เรียนพร้อมกัน
-- ---------------------------------------------------------------------
create table if not exists public.student_groups (
  id              uuid primary key default gen_random_uuid(),
  group_code      text not null unique,
  group_name      text not null,
  department      text,
  level           text,                    -- เช่น ปวช.1, ปวส.1
  student_count   int  not null default 30 check (student_count > 0),
  is_parallel     boolean not null default false,
  parallel_ref_id uuid references public.student_groups(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (parallel_ref_id is null or parallel_ref_id <> id)
);

-- ---------------------------------------------------------------------
-- ผู้ใช้ (profiles) เชื่อมกับ Supabase Auth (auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text,
  full_name        text,
  role             public.user_role not null default 'student',
  student_group_id uuid references public.student_groups(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ภาระงานสอน (enrollments)
-- block_sizes : แบ่งชั่วโมงเป็นก้อนต่อเนื่อง เช่น {4,3}; ถ้า null ระบบแบ่งอัตโนมัติ (ก้อนละไม่เกิน 4 คาบ)
-- ---------------------------------------------------------------------
create table if not exists public.enrollments (
  id                   uuid primary key default gen_random_uuid(),
  semester_id          uuid not null references public.semesters(id) on delete cascade,
  student_group_id     uuid not null references public.student_groups(id) on delete cascade,
  subject_id           uuid not null references public.subjects(id) on delete cascade,
  teacher_id           uuid not null references public.teachers(id) on delete restrict,
  total_hours_required int  check (total_hours_required > 0),
  block_sizes          int[],
  preferred_room_id    uuid references public.rooms(id) on delete set null,
  note                 text,
  created_at           timestamptz not null default now(),
  unique (semester_id, student_group_id, subject_id)
);
create index if not exists enrollments_semester_idx on public.enrollments(semester_id);
create index if not exists enrollments_teacher_idx  on public.enrollments(teacher_id);

-- เติม total_hours_required อัตโนมัติจาก ท+ป ของรายวิชา และตรวจ block_sizes
create or replace function public.enrollments_defaults()
returns trigger language plpgsql as $$
declare s_hours int;
begin
  if new.total_hours_required is null then
    select theory_hours + lab_hours into s_hours from public.subjects where id = new.subject_id;
    new.total_hours_required := s_hours;
  end if;
  if new.block_sizes is not null and cardinality(new.block_sizes) > 0 then
    if (select sum(x) from unnest(new.block_sizes) x) <> new.total_hours_required then
      raise exception 'ผลรวม block_sizes (%) ต้องเท่ากับ total_hours_required (%)',
        (select sum(x) from unnest(new.block_sizes) x), new.total_hours_required;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_enrollments_defaults on public.enrollments;
create trigger trg_enrollments_defaults
  before insert or update on public.enrollments
  for each row execute function public.enrollments_defaults();

-- ---------------------------------------------------------------------
-- งานคำนวณ (schedule_jobs) ใช้กับ Supabase Realtime แสดงความคืบหน้า
-- ---------------------------------------------------------------------
create table if not exists public.schedule_jobs (
  id           uuid primary key default gen_random_uuid(),
  semester_id  uuid not null references public.semesters(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status       public.job_status not null default 'queued',
  progress     int  not null default 0 check (progress between 0 and 100),
  message      text,
  params       jsonb not null default '{}'::jsonb,
  result       jsonb,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index if not exists schedule_jobs_semester_idx on public.schedule_jobs(semester_id, created_at desc);

-- ---------------------------------------------------------------------
-- ผลลัพธ์ตารางสอน (schedules)
-- session_key : แถวที่เป็นคาบเดียวกัน (กลุ่มคู่ขนานเรียนรวม) ใช้ค่าเดียวกัน
-- is_locked   : ล็อกไว้ ระบบ AI จะไม่ย้ายเมื่อจัดใหม่
-- ---------------------------------------------------------------------
create table if not exists public.schedules (
  id            uuid primary key default gen_random_uuid(),
  semester_id   uuid not null references public.semesters(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete set null,
  day_of_week   int  not null check (day_of_week between 1 and 7),
  start_period  int  not null check (start_period >= 1),
  end_period    int  not null,
  status        public.schedule_status not null default 'draft',
  is_locked     boolean not null default false,
  session_key   uuid not null default gen_random_uuid(),
  job_id        uuid references public.schedule_jobs(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_period >= start_period)
);
create index if not exists schedules_semester_idx on public.schedules(semester_id);
create index if not exists schedules_enrollment_idx on public.schedules(enrollment_id);

drop trigger if exists trg_schedules_updated on public.schedules;
create trigger trg_schedules_updated
  before update on public.schedules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- View สำหรับหน้าแสดงผล (security_invoker = เคารพ RLS ของผู้เรียกใช้)
-- ---------------------------------------------------------------------
create or replace view public.schedule_details
with (security_invoker = on) as
select
  s.id, s.semester_id, s.enrollment_id, s.room_id, s.day_of_week,
  s.start_period, s.end_period, s.status, s.is_locked, s.session_key, s.updated_at,
  e.student_group_id, e.subject_id, e.teacher_id, e.total_hours_required,
  sub.subject_code, sub.subject_name, sub.theory_hours, sub.lab_hours, sub.required_room_type,
  t.name  as teacher_name, t.teacher_code,
  g.group_code, g.group_name, g.student_count,
  r.room_code, r.room_name, r.room_type
from public.schedules s
join public.enrollments e   on e.id = s.enrollment_id
join public.subjects sub    on sub.id = e.subject_id
join public.teachers t      on t.id = e.teacher_id
join public.student_groups g on g.id = e.student_group_id
left join public.rooms r    on r.id = s.room_id;

-- ---------------------------------------------------------------------
-- Helper : ตรวจสิทธิ์ (security definer เพื่อไม่ให้ RLS วนซ้ำ)
-- ---------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------
-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้สมัครใหม่
-- ถ้าอีเมลตรงกับครูในตาราง teachers จะได้ role = teacher และผูก user_id ให้อัตโนมัติ
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare t_id uuid;
begin
  select id into t_id from public.teachers
   where lower(email) = lower(new.email) and user_id is null
   limit 1;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when t_id is not null then 'teacher'::public.user_role else 'student'::public.user_role end
  )
  on conflict (id) do nothing;

  if t_id is not null then
    update public.teachers set user_id = new.id where id = t_id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ครูแก้ไขเวลาที่ไม่สะดวกสอนของตนเองได้ (แก้เฉพาะคอลัมน์นี้)
create or replace function public.set_my_unavailable_times(times jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(times) <> 'array' then
    raise exception 'times ต้องเป็น JSON array';
  end if;
  update public.teachers set unavailable_times = times where user_id = auth.uid();
  if not found then
    raise exception 'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลครู';
  end if;
end $$;

-- ตั้งภาคเรียน active (ปิดตัวอื่นอัตโนมัติ)
create or replace function public.set_active_semester(p_semester uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ต้องเป็นผู้ดูแลระบบ'; end if;
  update public.semesters set is_active = false where is_active and id <> p_semester;
  update public.semesters set is_active = true where id = p_semester;
end $$;

-- เผยแพร่ / ยกเลิกเผยแพร่ตารางทั้งภาคเรียน
create or replace function public.set_schedule_status(p_semester uuid, p_status public.schedule_status)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'ต้องเป็นผู้ดูแลระบบ'; end if;
  update public.schedules set status = p_status where semester_id = p_semester;
  get diagnostics n = row_count;
  return n;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.semesters      enable row level security;
alter table public.subjects       enable row level security;
alter table public.teachers       enable row level security;
alter table public.rooms          enable row level security;
alter table public.student_groups enable row level security;
alter table public.enrollments    enable row level security;
alter table public.schedule_jobs  enable row level security;
alter table public.schedules      enable row level security;

-- profiles : เห็นของตัวเอง / admin เห็นและแก้ไขทั้งหมด
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Master data : ผู้ใช้ที่ล็อกอินอ่านได้ทั้งหมด / admin เขียนได้
do $$
declare t text;
begin
  foreach t in array array['semesters','subjects','teachers','rooms','student_groups','enrollments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_write', t);
  end loop;
end $$;

-- schedules : admin เห็นทั้งหมด / ครูและนักเรียนเห็นเฉพาะที่เผยแพร่แล้ว
drop policy if exists schedules_read on public.schedules;
create policy schedules_read on public.schedules
  for select to authenticated using (status = 'published' or public.is_admin());
drop policy if exists schedules_admin_write on public.schedules;
create policy schedules_admin_write on public.schedules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- schedule_jobs : admin อ่าน (การเขียนทำโดย AI Engine ผ่าน service_role ซึ่งข้าม RLS)
drop policy if exists schedule_jobs_read on public.schedule_jobs;
create policy schedule_jobs_read on public.schedule_jobs
  for select to authenticated using (public.is_admin());

-- =====================================================================
-- Realtime : แจ้งความคืบหน้าการคำนวณ
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.schedule_jobs;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'publication supabase_realtime not found (skip)';
end $$;

-- =====================================================================
-- Storage : bucket สำหรับไฟล์นำเข้า และไฟล์ส่งออก
-- =====================================================================
do $$ begin
  insert into storage.buckets (id, name, public)
  values ('imports', 'imports', false), ('exports', 'exports', false)
  on conflict (id) do nothing;

  drop policy if exists "admin manage imports/exports" on storage.objects;
  create policy "admin manage imports/exports" on storage.objects
    for all to authenticated
    using (bucket_id in ('imports', 'exports') and public.is_admin())
    with check (bucket_id in ('imports', 'exports') and public.is_admin());
exception when undefined_table then
  raise notice 'storage schema not found (skip)';
end $$;

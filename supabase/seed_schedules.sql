-- =====================================================================
--  ตารางเรียนตัวอย่าง (จำลอง) — ภาคเรียนที่ 1/2568
--  สร้างจาก AI Engine (OR-Tools CP-SAT) โดยใช้ข้อมูลใน seed.sql
--  ✓ ครู / กลุ่มนักเรียน / ห้องเรียน ไม่ชนกัน  ✓ ห้องตรงประเภทและจุพอ
--  ✓ ไม่ทับคาบกิจกรรมวันพุธบ่าย  ✓ เคารพเวลาไม่สะดวกของครู
--
--  วิธีใช้: รัน seed.sql ก่อน แล้วรันไฟล์นี้ใน Supabase SQL Editor (รันซ้ำได้)
--  * จะลบตารางเดิมของภาคเรียน 1/2568 แล้วใส่ตารางตัวอย่างนี้แทน (สถานะ "เผยแพร่แล้ว")
--  * ภายหลังกด "ประมวลผลจัดตารางสอน" ในเว็บเพื่อจัดใหม่ได้ทุกเมื่อ
-- =====================================================================

do $$
declare
  v_sem uuid;
  v_missing int;
begin
  select id into v_sem from public.semesters where academic_year = 2568 and term = 1;
  if v_sem is null then
    raise exception 'ไม่พบภาคเรียน 1/2568 — กรุณารัน seed.sql ก่อน';
  end if;

  create temporary table _sample (blk int, group_code text, subject_code text, room_code text,
                                  day int, start_p int, end_p int) on commit drop;
  insert into _sample values
  (1, 'ชฟ.1/1', '20000-1201', '111', 1, 1, 2),
  (2, 'บช.1/1', '20000-1301', '112', 1, 1, 1),
  (3, 'ชย.1/2', '20100-1003', 'BASIC', 1, 1, 4),
  (3, 'ชย.1/1', '20100-1003', 'BASIC', 1, 1, 4),
  (4, 'ทดส.1/1', '30204-2002', 'COM1', 1, 1, 4),
  (5, 'บช.1/1', '20000-1101', '112', 1, 2, 3),
  (6, 'ทด.1/1', '20000-1301', '121', 1, 2, 2),
  (7, 'ทด.1/1', '20000-1401', '111', 1, 3, 4),
  (8, 'ชฟ.1/1', '20000-1301', '121', 1, 4, 4),
  (9, 'บช.1/1', '20200-1001', '113', 1, 5, 6),
  (10, 'ทดส.1/1', '30000-1201', '111', 1, 5, 7),
  (11, 'ชย.1/2', '20000-1301', '121', 2, 1, 1),
  (11, 'ชย.1/1', '20000-1301', '121', 2, 1, 1),
  (12, 'ชฟ.1/1', '20104-2001', 'ELEC1', 2, 1, 4),
  (13, 'ทด.1/1', '20200-1002', 'COM1', 2, 1, 3),
  (14, 'ทดส.1/1', '30204-2001', 'COM2', 2, 1, 4),
  (15, 'ชย.1/1', '20101-2001', 'AUTO1', 2, 2, 4),
  (16, 'บช.1/1', '20000-1201', '121', 2, 3, 4),
  (17, 'ชฟ.1/1', '20100-1003', 'BASIC', 2, 5, 7),
  (18, 'ชย.1/2', '20101-2001', 'AUTO1', 2, 5, 7),
  (19, 'บช.1/1', '20201-2001', '121', 2, 5, 6),
  (20, 'ทดส.1/1', '30000-1101', '111', 2, 5, 7),
  (21, 'ชย.1/2', '20000-1201', '121', 3, 1, 2),
  (21, 'ชย.1/1', '20000-1201', '121', 3, 1, 2),
  (22, 'บช.1/1', '20000-1401', '111', 3, 1, 2),
  (23, 'ชฟ.1/1', '20100-1003', 'BASIC', 3, 1, 4),
  (24, 'ทด.1/1', '20204-2001', 'COM2', 3, 1, 4),
  (25, 'ชย.1/2', '20000-1401', '121', 3, 3, 4),
  (25, 'ชย.1/1', '20000-1401', '121', 3, 3, 4),
  (26, 'ทด.1/1', '20000-1101', '112', 3, 5, 6),
  (27, 'ชฟ.1/1', '20000-1401', '111', 3, 5, 6),
  (28, 'ทด.1/1', '20000-1201', '121', 4, 1, 2),
  (29, 'ชย.1/1', '20100-1001', '112', 4, 1, 4),
  (30, 'ชย.1/2', '20100-1001', '113', 4, 1, 4),
  (31, 'บช.1/1', '20201-2001', '111', 4, 2, 4),
  (32, 'ชฟ.1/1', '20000-1101', '111', 4, 5, 6),
  (33, 'ชย.1/2', '20100-1003', 'BASIC', 4, 5, 7),
  (33, 'ชย.1/1', '20100-1003', 'BASIC', 4, 5, 7),
  (34, 'บช.1/1', '20200-1002', 'COM2', 4, 5, 7),
  (35, 'ทดส.1/1', '20200-1001', '112', 4, 6, 7),
  (36, 'ชย.1/1', '20101-2001', 'AUTO1', 5, 1, 4),
  (37, 'ชย.1/2', '20101-2001', 'AUTO2', 5, 1, 4),
  (38, 'ชฟ.1/1', '20104-2002', 'ELEC1', 5, 1, 4),
  (39, 'ทด.1/1', '20204-2003', 'COM1', 5, 1, 4),
  (40, 'ชย.1/2', '20000-1101', '121', 5, 5, 6),
  (40, 'ชย.1/1', '20000-1101', '121', 5, 5, 6);

  -- ตรวจว่าข้อมูลอ้างอิงครบ (ภาระงานสอน / ห้อง)
  select count(*) into v_missing
    from _sample x
    left join public.student_groups g on g.group_code = x.group_code
    left join public.subjects s on s.subject_code = x.subject_code
    left join public.enrollments e on e.semester_id = v_sem and e.student_group_id = g.id and e.subject_id = s.id
    left join public.rooms r on r.room_code = x.room_code
   where e.id is null or r.id is null;
  if v_missing > 0 then
    raise exception 'ข้อมูลภาระงานสอน/ห้องไม่ตรงกับ seed.sql (% รายการ) — กรุณารัน seed.sql ใหม่', v_missing;
  end if;

  delete from public.schedules where semester_id = v_sem;

  insert into public.schedules (semester_id, enrollment_id, room_id, day_of_week, start_period, end_period, status, is_locked, session_key)
  select v_sem, e.id, r.id, x.day, x.start_p, x.end_p, 'published', false, k.session_key
    from _sample x
    join (select blk, gen_random_uuid() as session_key from (select distinct blk from _sample) b) k on k.blk = x.blk
    join public.student_groups g on g.group_code = x.group_code
    join public.subjects s on s.subject_code = x.subject_code
    join public.enrollments e on e.semester_id = v_sem and e.student_group_id = g.id and e.subject_id = s.id
    join public.rooms r on r.room_code = x.room_code;

  raise notice 'ใส่ตารางเรียนตัวอย่างแล้ว % แถว', (select count(*) from public.schedules where semester_id = v_sem);
end $$;

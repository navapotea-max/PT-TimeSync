export type Role = "admin" | "teacher" | "student";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  student_group_id: string | null;
  pdpa_consent_at?: string | null;
  pdpa_consent_version?: string | null;
}

export interface PeriodDef {
  no: number;
  start?: string;
  end?: string;
}

export interface SemesterConfig {
  days: number[];
  periods: PeriodDef[];
  lunch_after_period: number | null;
  blocked: { day: number; periods: number[]; label?: string }[];
  max_periods_per_day_group?: number;
}

export interface Semester {
  id: string;
  academic_year: number;
  term: number;
  name: string;
  is_active: boolean;
  config: SemesterConfig;
}

export interface Room {
  id: string;
  room_code: string;
  room_name: string;
  room_type: string;
  capacity: number;
}

export interface Teacher {
  id: string;
  user_id: string | null;
  teacher_code: string;
  name: string;
  unavailable_times: { day: number; periods: number[] }[];
}

export interface StudentGroup {
  id: string;
  group_code: string;
  group_name: string;
}

export interface ScheduleRow {
  id: string;
  semester_id: string;
  enrollment_id: string;
  room_id: string | null;
  day_of_week: number;
  start_period: number;
  end_period: number;
  status: "draft" | "published";
  is_locked: boolean;
  session_key: string;
  student_group_id: string;
  subject_id: string;
  teacher_id: string;
  subject_code: string;
  subject_name: string;
  required_room_type: string;
  teacher_name: string;
  teacher_code: string;
  group_code: string;
  group_name: string;
  student_count: number;
  room_code: string | null;
  room_name: string | null;
  room_type: string | null;
}

export interface ScheduleJob {
  id: string;
  semester_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  message: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  finished_at: string | null;
}

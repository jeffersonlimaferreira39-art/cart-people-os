import type { Role } from "@/lib/domain/roles";

export type Unit = { id: string; name: string; code: string; city: string | null; state: string | null; timezone: string; active: boolean };
export type Department = { id: string; name: string; unit_id: string | null; active: boolean };
export type Position = { id: string; title: string; cbo: string | null; active: boolean };

export type EmployeeStatus = "onboarding" | "active" | "on_leave" | "terminated";
export type EmploymentType = "clt" | "pj" | "estagio" | "temporario" | "aprendiz" | "intermitente";

export type EmployeeListItem = {
  id: string;
  registration_number: string;
  full_name: string;
  social_name: string | null;
  status: EmployeeStatus;
  employment_type: EmploymentType;
  hire_date: string;
  unit: { name: string; code: string } | null;
  department: { name: string } | null;
  position: { title: string } | null;
};

export type Employee = {
  id: string;
  organization_id: string;
  unit_id: string;
  department_id: string | null;
  position_id: string | null;
  manager_id: string | null;
  user_id: string | null;
  registration_number: string;
  full_name: string;
  social_name: string | null;
  work_email: string | null;
  phone: string | null;
  employment_type: EmploymentType;
  work_schedule: string | null;
  status: EmployeeStatus;
  hire_date: string;
  termination_date: string | null;
};

export type EmployeeSensitive = {
  employee_id: string;
  cpf: string | null;
  rg: string | null;
  birth_date: string | null;
  pis: string | null;
  base_salary: number | null;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  pix_key: string | null;
  address: Record<string, string>;
  emergency_contact: Record<string, string>;
};

export type LeaveType =
  | "ferias" | "licenca_medica" | "licenca_maternidade" | "licenca_paternidade"
  | "falta_justificada" | "folga" | "outro";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequest = {
  id: string;
  employee_id: string;
  unit_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  sell_days: number;
  acquisition_period_start: string | null;
  reason: string | null;
  status: LeaveStatus;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  employee: { full_name: string; registration_number: string; user_id: string | null } | null;
};

export type DpEventStatus = "draft" | "submitted" | "approved" | "rejected" | "exported" | "cancelled";
export type DpEvent = {
  id: string;
  employee_id: string;
  unit_id: string;
  type: string;
  effective_date: string;
  payload: Record<string, unknown>;
  notes: string | null;
  status: DpEventStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  exported_at: string | null;
  created_at: string;
  employee: { full_name: string; registration_number: string } | null;
};

export type Membership = { id: string; user_id: string; organization_id: string; unit_id: string | null; role: Role; active: boolean };

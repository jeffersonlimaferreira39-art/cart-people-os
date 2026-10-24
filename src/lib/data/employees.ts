import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer";
import { viewerCan } from "@/lib/auth/viewer";
import type {
  Department, DpEvent, Employee, EmployeeListItem, EmployeeSensitive, LeaveRequest, Position, Unit,
} from "@/lib/types";
import { inUnit, sanitizeSearch } from "./scope";

export type EmployeeFilters = { q?: string; status?: string; department?: string };

export async function listEmployees(viewer: Viewer, filters: EmployeeFilters): Promise<EmployeeListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("employees")
    .select(
      "id, registration_number, full_name, social_name, status, employment_type, hire_date," +
        " unit:units(name, code), department:departments(name), position:positions(title)",
    )
    .order("full_name")
    .limit(500);
  query = inUnit(query, viewer);
  const q = sanitizeSearch(filters.q);
  if (q) query = query.or(`full_name.ilike.*${q}*,registration_number.ilike.*${q}*,social_name.ilike.*${q}*`);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  else if (!filters.status) query = query.neq("status", "terminated");
  if (filters.department) query = query.eq("department_id", filters.department);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EmployeeListItem[];
}

export type Lookups = {
  units: Unit[];
  departments: Department[];
  positions: Position[];
  managers: { id: string; full_name: string; unit_id: string }[];
};

export async function getLookups(viewer: Viewer): Promise<Lookups> {
  const supabase = await createClient();
  const [departments, positions, managers] = await Promise.all([
    supabase.from("departments").select("id, name, unit_id, active").eq("active", true).order("name"),
    supabase.from("positions").select("id, title, cbo, active").eq("active", true).order("title"),
    supabase
      .from("employees")
      .select("id, full_name, unit_id")
      .neq("status", "terminated")
      .order("full_name")
      .limit(1000),
  ]);
  return {
    units: viewer.units.filter((u) => u.active),
    departments: (departments.data ?? []) as Department[],
    positions: (positions.data ?? []) as Position[],
    managers: managers.data ?? [],
  };
}

export type EmployeeDetail = {
  employee: Employee & {
    unit: { name: string; code: string } | null;
    department: { name: string } | null;
    position: { title: string; cbo: string | null } | null;
    manager: { id: string; full_name: string } | null;
  };
  sensitive: EmployeeSensitive | null;
  canSeeSensitive: boolean;
  leaves: LeaveRequest[];
  dpEvents: DpEvent[];
  documents: { id: string; category: string; file_name: string; expires_at: string | null; created_at: string }[];
  reports: { id: string; full_name: string }[];
};

export async function getEmployeeDetail(viewer: Viewer, id: string): Promise<EmployeeDetail | null> {
  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select(
      "*, unit:units(name, code), department:departments(name), position:positions(title, cbo)," +
        " manager:employees!employees_manager_id_fkey(id, full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!employee) return null;

  const canSeeSensitive = viewerCan(viewer, "viewSensitive") || viewer.employee?.id === id;
  const [sensitive, leaves, dpEvents, documents, reports] = await Promise.all([
    canSeeSensitive
      ? supabase.from("employee_sensitive").select("*").eq("employee_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("leave_requests")
      .select("*, employee:employees(full_name, registration_number, user_id)")
      .eq("employee_id", id)
      .order("start_date", { ascending: false })
      .limit(20),
    viewerCan(viewer, "viewDp")
      ? supabase
          .from("dp_events")
          .select("*, employee:employees(full_name, registration_number)")
          .eq("employee_id", id)
          .order("effective_date", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    supabase
      .from("employee_documents")
      .select("id, category, file_name, expires_at, created_at")
      .eq("employee_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("employees").select("id, full_name").eq("manager_id", id).neq("status", "terminated").order("full_name"),
  ]);

  return {
    employee: employee as unknown as EmployeeDetail["employee"],
    sensitive: (sensitive.data as EmployeeSensitive | null) ?? null,
    canSeeSensitive,
    leaves: (leaves.data ?? []) as unknown as LeaveRequest[],
    dpEvents: (dpEvents.data ?? []) as unknown as DpEvent[],
    documents: documents.data ?? [],
    reports: reports.data ?? [],
  };
}

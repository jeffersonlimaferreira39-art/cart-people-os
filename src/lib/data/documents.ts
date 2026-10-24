import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer";
import { addDays, todayIn } from "@/lib/domain/dates";
import type { OrgDocumentArea } from "@/lib/format";
import { inUnit, sanitizeSearch } from "./scope";

export type DocumentFilters = { q?: string; category?: string; expiring?: boolean };

export type EmployeeDocumentRow = {
  id: string;
  employee_id: string;
  category: string;
  file_name: string;
  expires_at: string | null;
  created_at: string;
  employee: { full_name: string; registration_number: string } | null;
  unit: { code: string } | null;
};

/** Documentos de todos os colaboradores visíveis (RLS: RH/DP/Admin da unidade). */
export async function listEmployeeDocuments(viewer: Viewer, f: DocumentFilters): Promise<EmployeeDocumentRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("employee_documents")
    .select("id, employee_id, category, file_name, expires_at, created_at, employee:employees!inner(full_name, registration_number), unit:units(code)")
    .order("created_at", { ascending: false })
    .limit(500);
  q = inUnit(q, viewer);
  if (f.category) q = q.eq("category", f.category);
  if (f.expiring) {
    const today = todayIn();
    q = q.gte("expires_at", today).lte("expires_at", addDays(today, 30));
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return matching((data ?? []) as unknown as EmployeeDocumentRow[], f.q, (d) => [d.file_name, d.employee?.full_name, d.employee?.registration_number]);
}

export type OrgDocumentRow = {
  id: string;
  area: OrgDocumentArea;
  category: string;
  title: string;
  description: string | null;
  period: string | null;
  expires_at: string | null;
  visibility: "restrito" | "todos";
  file_name: string;
  unit_id: string | null;
  created_at: string;
  unit: { code: string; name: string } | null;
};

/**
 * Documentos do RH/DP. `area` nula = todos os visíveis ao usuário (para quem não
 * é da equipe, a RLS só devolve os marcados como visíveis a todos).
 */
export async function listOrgDocuments(viewer: Viewer, area: OrgDocumentArea | null, f: DocumentFilters): Promise<OrgDocumentRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("org_documents")
    .select("id, area, category, title, description, period, expires_at, visibility, file_name, unit_id, created_at, unit:units(code, name)")
    .eq("organization_id", viewer.organization.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (area) q = q.eq("area", area);
  // Unidade em foco: documentos dela + os da organização inteira.
  if (viewer.selectedUnitId) q = q.or(`unit_id.is.null,unit_id.eq.${viewer.selectedUnitId}`);
  if (f.category) q = q.eq("category", f.category);
  if (f.expiring) {
    const today = todayIn();
    q = q.gte("expires_at", today).lte("expires_at", addDays(today, 30));
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return matching((data ?? []) as unknown as OrgDocumentRow[], f.q, (d) => [d.title, d.file_name, d.description]);
}

/** Busca sem acento e sem caixa sobre os campos informados (lista já limitada a 500). */
function matching<T>(rows: T[], q: string | undefined, fields: (r: T) => (string | null | undefined)[]): T[] {
  const s = sanitizeSearch(q);
  if (!s) return rows;
  const norm = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const needle = norm(s);
  return rows.filter((r) => fields(r).some((v) => v && norm(v).includes(needle)));
}

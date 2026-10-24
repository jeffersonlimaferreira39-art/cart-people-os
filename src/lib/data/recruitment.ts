import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer";
import { inUnit } from "./scope";

export type OpeningRow = {
  id: string;
  title: string;
  description: string | null;
  openings: number;
  employment_type: string;
  salary_range: string | null;
  status: "aberta" | "pausada" | "encerrada";
  unit_id: string;
  department_id: string | null;
  position_id: string | null;
  created_at: string;
  closed_at: string | null;
  unit: { code: string; name: string } | null;
  department: { name: string } | null;
  position: { title: string } | null;
};

export type CandidateRow = {
  id: string;
  opening_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source: string;
  stage: string;
  notes: string | null;
  resume_name: string | null;
  resume_path: string | null;
  consent_at: string;
  hired_employee_id: string | null;
  created_at: string;
  updated_at: string;
  opening: { title: string; unit_id: string } | null;
};

const OPENING_COLS =
  "id, title, description, openings, employment_type, salary_range, status, unit_id, department_id, position_id, created_at, closed_at, unit:units(code, name), department:departments(name), position:positions(title)";
const CANDIDATE_COLS =
  "id, opening_id, full_name, email, phone, source, stage, notes, resume_name, resume_path, consent_at, hired_employee_id, created_at, updated_at, opening:job_openings(title, unit_id)";

export async function listOpenings(viewer: Viewer): Promise<OpeningRow[]> {
  const supabase = await createClient();
  const { data, error } = await inUnit(supabase.from("job_openings").select(OPENING_COLS).order("created_at", { ascending: false }).limit(500), viewer);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OpeningRow[];
}

export async function listCandidates(viewer: Viewer, openingId?: string): Promise<CandidateRow[]> {
  const supabase = await createClient();
  let q = supabase.from("candidates").select(CANDIDATE_COLS).order("updated_at", { ascending: false }).limit(2000);
  q = inUnit(q, viewer);
  if (openingId) q = q.eq("opening_id", openingId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CandidateRow[];
}

export type CandidateEvent = { id: number; from_stage: string | null; to_stage: string; note: string | null; created_at: string };

export async function getCandidate(id: string): Promise<{ candidate: CandidateRow; events: CandidateEvent[]; opening: OpeningRow | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("candidates").select(CANDIDATE_COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  const candidate = data as unknown as CandidateRow;
  const [{ data: events }, { data: opening }] = await Promise.all([
    supabase.from("candidate_events").select("id, from_stage, to_stage, note, created_at").eq("candidate_id", id).order("created_at"),
    supabase.from("job_openings").select(OPENING_COLS).eq("id", candidate.opening_id).maybeSingle(),
  ]);
  return { candidate, events: (events ?? []) as CandidateEvent[], opening: (opening as unknown as OpeningRow) ?? null };
}

export type AdmissionRow = {
  id: string;
  full_name: string;
  registration_number: string;
  hire_date: string;
  unit: { code: string } | null;
  position: { title: string } | null;
  checklist: { item: string; label: string; done: boolean; done_at: string | null; position: number }[];
};

/** Admissões em andamento: colaboradores com situação "em admissão" e o checklist. */
export async function listAdmissions(viewer: Viewer): Promise<AdmissionRow[]> {
  const supabase = await createClient();
  const { data, error } = await inUnit(
    supabase
      .from("employees")
      .select("id, full_name, registration_number, hire_date, unit:units(code), position:positions(title), checklist:admission_checklist(item, label, done, done_at, position)")
      .eq("status", "onboarding")
      .order("hire_date")
      .limit(500),
    viewer,
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as AdmissionRow[]).map((a) => ({ ...a, checklist: [...(a.checklist ?? [])].sort((x, y) => x.position - y.position) }));
}

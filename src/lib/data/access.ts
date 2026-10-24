import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer";
import { reviewStatus, userStatus, type ReviewStatus, type UserStatus } from "@/lib/domain/access";
import type { Role } from "@/lib/domain/roles";

/** Só o administrador com escopo de organização inteira gerencia acessos. */
export function isOrgAdmin(viewer: Viewer) {
  return viewer.scopes.some((s) => s.role === "admin" && s.unitId === null);
}

export type MembershipRow = {
  id: string;
  user_id: string;
  unit_id: string | null;
  role: Role;
  active: boolean;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  suspended_at: string | null;
  review: { days: number; status: ReviewStatus };
};

export type SessionRow = { session_id: string; user_id: string; created_at: string; last_seen: string; user_agent: string | null; ip: string | null };

export type AccessUser = {
  id: string;
  email: string;
  name: string | null;
  employeeId: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  status: UserStatus;
  memberships: MembershipRow[];
  activeMemberships: MembershipRow[];
  sessions: SessionRow[];
  /** Pior situação de revisão entre os papéis ativos. */
  review: ReviewStatus | null;
};

type AuthUser = { user_id: string; email: string; created_at: string; last_sign_in_at: string | null; banned_until: string | null };

export async function listAccessUsers(viewer: Viewer): Promise<AccessUser[]> {
  const supabase = await createClient();
  const org = viewer.organization.id;
  const [auth, memberships, employees, sessions] = await Promise.all([
    supabase.rpc("org_users", { p_org: org }),
    supabase
      .from("memberships")
      .select("id, user_id, unit_id, role, active, created_at, reviewed_at, reviewed_by, suspended_at")
      .eq("organization_id", org)
      .order("created_at"),
    supabase.from("employees").select("id, full_name, user_id").not("user_id", "is", null),
    supabase.rpc("org_user_sessions", { p_org: org }),
  ]);
  if (auth.error) throw new Error(auth.error.message);
  if (memberships.error) throw new Error(memberships.error.message);
  const now = new Date();
  const rows = ((memberships.data ?? []) as Omit<MembershipRow, "review">[]).map((m) => ({ ...m, review: reviewStatus(m.reviewed_at, m.created_at, now) }));
  const empByUser = new Map((employees.data ?? []).map((e) => [e.user_id as string, e]));
  const sess = (sessions.data ?? []) as SessionRow[];
  const rank: Record<ReviewStatus, number> = { em_dia: 0, vence: 1, vencida: 2 };

  return ((auth.data ?? []) as AuthUser[])
    .map((u) => {
      const ms = rows.filter((m) => m.user_id === u.user_id);
      const active = ms.filter((m) => m.active);
      const emp = empByUser.get(u.user_id);
      const worst = active.reduce<ReviewStatus | null>((w, m) => (!w || rank[m.review.status] > rank[w] ? m.review.status : w), null);
      return {
        id: u.user_id,
        email: u.email,
        name: emp?.full_name ?? null,
        employeeId: emp?.id ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        banned_until: u.banned_until,
        status: userStatus({ banned_until: u.banned_until, last_sign_in_at: u.last_sign_in_at, activeRoles: active.length, suspendedRoles: ms.filter((m) => m.suspended_at).length }, now),
        memberships: ms,
        activeMemberships: active,
        sessions: sess.filter((s) => s.user_id === u.user_id),
        review: worst,
      };
    })
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "pt-BR"));
}

export type AccessEventRow = { id: number; user_id: string; event: string; ip: string | null; user_agent: string | null; actor_id: string | null; created_at: string };

export async function listAccessEvents(opts: { userId?: string; event?: string; since?: string; limit?: number } = {}): Promise<AccessEventRow[]> {
  const supabase = await createClient();
  let q = supabase.from("access_events").select("id, user_id, event, ip, user_agent, actor_id, created_at").order("created_at", { ascending: false }).limit(opts.limit ?? 300);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.event) q = q.eq("event", opts.event);
  if (opts.since) q = q.gte("created_at", opts.since);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AccessEventRow[];
}

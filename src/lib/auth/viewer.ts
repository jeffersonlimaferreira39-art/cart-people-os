import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, isRole, type Capability, type Role } from "@/lib/domain/roles";
import type { Unit } from "@/lib/types";

export const UNIT_COOKIE = "cart_unit";
export const ALL_UNITS = "all";

export type Viewer = {
  userId: string;
  email: string | null;
  organization: { id: string; name: string };
  roles: Role[];
  /** Papéis com escopo de unidade (null = organização inteira). */
  scopes: { role: Role; unitId: string | null }[];
  /** Unidades que o usuário pode selecionar. */
  units: Unit[];
  /** Unidade em foco; null = todas as unidades acessíveis. */
  selectedUnitId: string | null;
  orgWide: boolean;
  employee: { id: string; full_name: string; unit_id: string } | null;
};

/**
 * Lê e valida a sessão uma vez por requisição. Redireciona para o login se não
 * houver sessão, ou para /sem-acesso se o usuário não tiver papel ativo.
 * Deve ser chamada dentro de <Suspense> (Cache Components).
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, unit_id, organization_id, organization:organizations(id, name)")
    .eq("user_id", claims.sub)
    .eq("active", true);

  if (!memberships?.length) redirect("/sem-acesso");

  // Uma organização por sessão; a primeira encontrada é a ativa.
  const orgRow = memberships[0].organization as unknown as { id: string; name: string };
  const mine = memberships.filter((m) => m.organization_id === orgRow.id);
  const scopes = mine
    .filter((m) => isRole(m.role))
    .map((m) => ({ role: m.role as Role, unitId: m.unit_id as string | null }));
  const roles = [...new Set(scopes.map((s) => s.role))];
  const orgWide = scopes.some((s) => s.unitId === null);

  const [{ data: unitRows }, { data: employee }] = await Promise.all([
    supabase
      .from("units")
      .select("id, name, code, city, state, timezone, active")
      .eq("organization_id", orgRow.id)
      .order("name"),
    supabase.from("employees").select("id, full_name, unit_id").eq("user_id", claims.sub).maybeSingle(),
  ]);

  const scopedUnitIds = new Set(scopes.map((s) => s.unitId).filter(Boolean) as string[]);
  const units = ((unitRows ?? []) as Unit[]).filter((u) => orgWide || scopedUnitIds.has(u.id));

  const cookieStore = await cookies();
  const wanted = cookieStore.get(UNIT_COOKIE)?.value;
  let selectedUnitId: string | null = null;
  if (wanted && wanted !== ALL_UNITS && units.some((u) => u.id === wanted)) selectedUnitId = wanted;
  if (units.length === 1) selectedUnitId = units[0].id;

  return {
    userId: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    organization: orgRow,
    roles,
    scopes,
    units,
    selectedUnitId,
    orgWide,
    employee: employee ?? null,
  };
});

export function viewerCan(viewer: Viewer, capability: Capability): boolean {
  return can(viewer.roles, capability);
}

/** Papéis válidos numa unidade específica (considerando papéis org-wide). */
export function rolesInUnit(viewer: Viewer, unitId: string): Role[] {
  return [...new Set(viewer.scopes.filter((s) => s.unitId === null || s.unitId === unitId).map((s) => s.role))];
}

export function viewerCanInUnit(viewer: Viewer, capability: Capability, unitId: string): boolean {
  return can(rolesInUnit(viewer, unitId), capability);
}

/** Para Server Actions: exige capacidade ou devolve mensagem de erro. */
export async function requireCapability(capability: Capability): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, capability)) {
    throw new AccessError();
  }
  return viewer;
}

export class AccessError extends Error {
  constructor(message = "Você não tem permissão para esta operação.") {
    super(message);
    this.name = "AccessError";
  }
}

export const unitLabel = (viewer: Viewer) =>
  viewer.selectedUnitId ? (viewer.units.find((u) => u.id === viewer.selectedUnitId)?.name ?? "") : "Todas as unidades";

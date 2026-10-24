/**
 * Papéis e capacidades. Isto controla apenas a INTERFACE e checagens de
 * conveniência no servidor; a autorização real está nas políticas RLS.
 */

export const ROLES = ["admin", "rh", "dp", "gestor", "diretoria", "colaborador"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  rh: "Recursos Humanos",
  dp: "Departamento Pessoal",
  gestor: "Gestor",
  diretoria: "Diretoria",
  colaborador: "Colaborador",
};

export const CAPABILITIES = {
  viewPeople: ["admin", "rh", "dp", "diretoria", "gestor"],
  managePeople: ["admin", "rh", "dp"],
  viewSensitive: ["admin", "rh", "dp"],
  decideLeaves: ["admin", "rh", "dp", "gestor"],
  viewDp: ["admin", "rh", "dp", "diretoria"],
  manageDp: ["admin", "rh", "dp"],
  exportPayroll: ["admin", "dp"],
  importTime: ["admin", "dp"],
  viewTime: ["admin", "rh", "dp", "diretoria", "gestor"],
  viewAudit: ["admin"],
  manageSettings: ["admin"],
  useAssistant: ["admin", "rh", "dp", "diretoria", "gestor"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(roles: readonly Role[], capability: Capability): boolean {
  const allowed = CAPABILITIES[capability] as readonly Role[];
  return roles.some((r) => allowed.includes(r));
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

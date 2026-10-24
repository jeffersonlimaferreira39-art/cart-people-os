import type { Viewer } from "@/lib/auth/viewer";

/** Aplica o filtro da unidade em foco. A RLS continua sendo o limite real. */
export function inUnit<T>(query: T, viewer: Viewer, column = "unit_id"): T {
  if (!viewer.selectedUnitId) return query;
  // Sem restrição genérica de propósito: os tipos do PostgREST são profundos demais para o checador.
  return (query as unknown as { eq: (c: string, v: string) => T }).eq(column, viewer.selectedUnitId);
}

/** Remove caracteres com significado na sintaxe de filtros do PostgREST. */
export function sanitizeSearch(q: string | undefined): string | undefined {
  const clean = q?.replace(/[,()*%\\:"']/g, " ").trim().slice(0, 80);
  return clean ? clean : undefined;
}

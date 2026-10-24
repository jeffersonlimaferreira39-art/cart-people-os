import type { ZodError } from "zod";

/** Resultado padrão das Server Actions consumidas por useActionState. */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
} | null;

export const fail = (message: string, fieldErrors?: Record<string, string[] | undefined>): ActionState => ({
  ok: false,
  message,
  fieldErrors,
});

export const success = (message?: string): ActionState => ({ ok: true, message });

export function fromZod(error: ZodError): ActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fail("Revise os campos destacados.", fieldErrors);
}

/** Traduz erros do Postgres/PostgREST em mensagens para o usuário. */
export function fromDbError(error: { code?: string; message?: string } | null | undefined): ActionState {
  if (!error) return fail("Não foi possível concluir a operação.");
  if (/row-level security|permission denied/i.test(error.message ?? "")) {
    return fail("Você não tem permissão para esta operação nesta unidade.");
  }
  // Regras de fluxo que negam acesso (ex.: decidir a própria solicitação) trazem mensagem própria.
  if (error.code === "42501" && error.message) return fail(error.message);
  if (error.code === "23505") return fail("Já existe um registro com estes dados (ex.: matrícula repetida).");
  if (error.code === "23503") return fail("Este registro está vinculado a outros dados e não pode ser alterado assim.");
  // Mensagens das regras de negócio (RAISE EXCEPTION) já estão em português.
  if (error.code === "P0001" && error.message) return fail(error.message);
  return fail(error.message ?? "Não foi possível concluir a operação.");
}

/** Converte FormData em objeto simples (campos vazios viram undefined). */
export function formToObject(form: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    out[k] = t === "" ? undefined : t;
  }
  return out;
}

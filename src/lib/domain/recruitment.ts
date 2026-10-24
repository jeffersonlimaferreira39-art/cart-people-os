/** Funil de contratação: etapas, transições e checklist de admissão. */

export const STAGES = [
  { id: "triagem", label: "Triagem", final: false },
  { id: "entrevista", label: "Entrevista", final: false },
  { id: "teste", label: "Teste prático", final: false },
  { id: "proposta", label: "Proposta", final: false },
  { id: "aprovado", label: "Aprovado", final: false },
  { id: "contratado", label: "Contratado", final: true },
  { id: "reprovado", label: "Reprovado", final: true },
  { id: "desistiu", label: "Desistiu", final: true },
] as const;
export type Stage = (typeof STAGES)[number]["id"];
export const isStage = (v: string): v is Stage => STAGES.some((s) => s.id === v);
export const stageLabel = (s: string) => STAGES.find((x) => x.id === s)?.label ?? s;
/** Etapas do quadro (colunas): o funil ativo + contratado. */
export const BOARD_STAGES: Stage[] = ["triagem", "entrevista", "teste", "proposta", "aprovado", "contratado"];

export const SOURCES = { indicacao: "Indicação", site: "Site/redes", linkedin: "LinkedIn", agencia: "Agência", outro: "Outro" } as const;

/**
 * Mudança de etapa manual. "Contratado" só pela ação de contratar (cria o cadastro);
 * candidato contratado não volta ao funil.
 */
export function canMove(from: Stage, to: Stage): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: "O candidato já está nesta etapa." };
  if (to === "contratado") return { ok: false, reason: "Use “Contratar” para gerar o cadastro do colaborador." };
  if (from === "contratado") return { ok: false, reason: "Candidato já contratado: ajuste pelo cadastro do colaborador." };
  return { ok: true };
}

export function funnel(candidates: { stage: string }[]) {
  const counts = Object.fromEntries(STAGES.map((s) => [s.id, 0])) as Record<Stage, number>;
  for (const c of candidates) if (isStage(c.stage)) counts[c.stage]++;
  const active = STAGES.filter((s) => !s.final).reduce((a, s) => a + counts[s.id], 0);
  const decided = counts.contratado + counts.reprovado + counts.desistiu;
  return { counts, active, total: candidates.length, hireRate: decided ? Math.round((counts.contratado / decided) * 1000) / 10 : null };
}

/** Itens padrão do checklist de admissão (ordem de execução sugerida). */
export const DEFAULT_CHECKLIST = [
  { item: "documentos", label: "Documentos pessoais recebidos (RG, CPF, comprovante de endereço)" },
  { item: "ctps", label: "CTPS digital e PIS conferidos" },
  { item: "aso", label: "Exame admissional (ASO) apto" },
  { item: "dados_bancarios", label: "Conta bancária ou PIX para salário" },
  { item: "contrato", label: "Contrato de trabalho assinado" },
  { item: "esocial", label: "Admissão enviada à contabilidade (eSocial S-2200)" },
  { item: "beneficios", label: "Benefícios cadastrados (VT, VA/VR, plano)" },
  { item: "acesso_sistema", label: "Acesso ao People OS enviado" },
  { item: "epi_uniforme", label: "Uniforme/EPI entregue (quando aplicável)" },
  { item: "integracao", label: "Integração e treinamento inicial" },
] as const;

export function checklistProgress(items: { done: boolean }[]) {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0, complete: items.length > 0 && done === items.length };
}

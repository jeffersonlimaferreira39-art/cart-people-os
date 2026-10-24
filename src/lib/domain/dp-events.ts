/**
 * Campos de cada tipo de movimentação do DP. Ficam em payload (jsonb) para que
 * novos tipos não exijam migração. Não inclua dados de saúde (ex.: CID): o
 * atestado fica nos documentos, com acesso restrito.
 */
export type DpFieldType = "text" | "money" | "date" | "select" | "number";
export type DpField = { key: string; label: string; type: DpFieldType; required?: boolean; options?: [string, string][]; hint?: string };

export const DP_EVENT_TYPES = [
  "admissao", "alteracao_salarial", "alteracao_cargo", "transferencia",
  "afastamento", "retorno_afastamento", "desligamento", "ferias", "outro",
] as const;
export type DpEventType = (typeof DP_EVENT_TYPES)[number];

export const DP_EVENT_FIELDS: Record<DpEventType, DpField[]> = {
  admissao: [
    { key: "salario_base", label: "Salário base", type: "money", required: true },
    { key: "tipo_contrato", label: "Tipo de contrato", type: "select", options: [["clt", "CLT"], ["estagio", "Estágio"], ["temporario", "Temporário"], ["aprendiz", "Aprendiz"], ["intermitente", "Intermitente"]] },
    { key: "jornada", label: "Jornada", type: "text" },
    { key: "experiencia_dias", label: "Contrato de experiência (dias)", type: "number", hint: "Até 90 dias (CLT art. 445)." },
  ],
  alteracao_salarial: [
    { key: "novo_salario", label: "Novo salário", type: "money", required: true },
    { key: "motivo", label: "Motivo", type: "select", required: true, options: [["promocao", "Promoção"], ["merito", "Mérito"], ["dissidio", "Dissídio/convenção"], ["enquadramento", "Enquadramento"], ["outro", "Outro"]] },
  ],
  alteracao_cargo: [
    { key: "novo_cargo", label: "Novo cargo", type: "text", required: true },
    { key: "cbo", label: "CBO", type: "text" },
    { key: "novo_salario", label: "Novo salário (se mudar)", type: "money" },
  ],
  transferencia: [
    { key: "unidade_destino", label: "Unidade de destino", type: "text", required: true },
    { key: "departamento_destino", label: "Departamento de destino", type: "text" },
  ],
  afastamento: [
    { key: "motivo", label: "Motivo", type: "select", required: true, options: [["doenca", "Doença (atestado)"], ["acidente_trabalho", "Acidente de trabalho"], ["maternidade", "Licença-maternidade"], ["servico_militar", "Serviço militar"], ["outro", "Outro"]] },
    { key: "retorno_previsto", label: "Retorno previsto", type: "date" },
  ],
  retorno_afastamento: [{ key: "data_retorno", label: "Data do retorno", type: "date", required: true }],
  desligamento: [
    { key: "tipo", label: "Tipo de desligamento", type: "select", required: true, options: [["sem_justa_causa", "Dispensa sem justa causa"], ["pedido_demissao", "Pedido de demissão"], ["justa_causa", "Dispensa por justa causa"], ["acordo", "Acordo (art. 484-A)"], ["termino_contrato", "Término de contrato"]] },
    { key: "aviso_previo", label: "Aviso prévio", type: "select", options: [["trabalhado", "Trabalhado"], ["indenizado", "Indenizado"], ["dispensado", "Dispensado"]] },
    { key: "data_aviso", label: "Data do aviso", type: "date" },
  ],
  ferias: [
    { key: "inicio", label: "Início", type: "date", required: true },
    { key: "fim", label: "Fim", type: "date", required: true },
    { key: "abono_dias", label: "Dias de abono", type: "number" },
  ],
  outro: [{ key: "descricao", label: "Descrição", type: "text", required: true }],
};

/** Monta e valida o payload a partir dos campos do formulário ("payload.chave"). */
export function buildPayload(type: DpEventType, raw: Record<string, string | undefined>) {
  const errors: Record<string, string[]> = {};
  const payload: Record<string, string | number> = {};
  for (const f of DP_EVENT_FIELDS[type]) {
    const value = raw[`payload.${f.key}`];
    if (value === undefined) {
      if (f.required) errors[`payload.${f.key}`] = ["Campo obrigatório."];
      continue;
    }
    if (f.type === "money") {
      const s = value.replace(/[R$\s]/g, "");
      const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
      if (!Number.isFinite(n) || n < 0) errors[`payload.${f.key}`] = ["Valor inválido."];
      else payload[f.key] = Math.round(n * 100) / 100;
    } else if (f.type === "number") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) errors[`payload.${f.key}`] = ["Número inválido."];
      else payload[f.key] = n;
    } else if (f.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[`payload.${f.key}`] = ["Data inválida."];
      else payload[f.key] = value;
    } else if (f.type === "select") {
      if (!f.options?.some(([v]) => v === value)) errors[`payload.${f.key}`] = ["Opção inválida."];
      else payload[f.key] = value;
    } else {
      payload[f.key] = value.slice(0, 300);
    }
  }
  if (type === "admissao" && typeof payload.experiencia_dias === "number" && payload.experiencia_dias > 90) {
    errors["payload.experiencia_dias"] = ["O contrato de experiência tem no máximo 90 dias."];
  }
  if (type === "ferias" && payload.inicio && payload.fim && payload.fim < payload.inicio) {
    errors["payload.fim"] = ["O fim deve ser posterior ao início."];
  }
  return { payload, errors };
}

export function describePayload(type: string, payload: Record<string, unknown>): [string, string][] {
  const fields = DP_EVENT_FIELDS[type as DpEventType] ?? [];
  return fields
    .filter((f) => payload[f.key] !== undefined && payload[f.key] !== null && payload[f.key] !== "")
    .map((f) => {
      const v = payload[f.key];
      if (f.type === "money") return [f.label, new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))];
      if (f.type === "date") return [f.label, String(v).split("-").reverse().join("/")];
      if (f.type === "select") return [f.label, f.options?.find(([o]) => o === v)?.[1] ?? String(v)];
      return [f.label, String(v)];
    });
}

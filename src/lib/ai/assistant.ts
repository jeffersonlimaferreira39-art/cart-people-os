import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { ROLE_LABELS } from "@/lib/domain/roles";
import { todayIn } from "@/lib/domain/dates";
import { unitLabel, type Viewer } from "@/lib/auth/viewer";
import { runTool, toolsFor } from "./tools";

export type ChatTurn = { role: "user" | "assistant"; content: string };

const MAX_ROUNDS = 6;

function systemPrompt(viewer: Viewer) {
  return [
    "Você é o assistente de dados do C'Art People OS, sistema de RH e Departamento Pessoal da C'Art Ambientações.",
    `Hoje é ${todayIn()}. Usuário com papel(is): ${viewer.roles.map((r) => ROLE_LABELS[r]).join(", ")}. Unidade em foco: ${unitLabel(viewer)}.`,
    "Regras:",
    "- Responda em português do Brasil, de forma direta e curta. Use listas com '- ' quando houver vários itens. Não use tabelas Markdown nem negrito.",
    "- Use apenas dados obtidos pelas ferramentas. Se a ferramenta não trouxer o dado, diga que não está disponível. Nunca invente números ou nomes.",
    "- Os dados já vêm filtrados pelas permissões do usuário e pela unidade em foco; se o resultado parecer incompleto, mencione esse limite.",
    "- Dados pessoais sensíveis (CPF, salário, dados bancários, endereço, saúde) não estão disponíveis neste assistente. Oriente o usuário a consultar o cadastro, se tiver permissão.",
    "- Não dê parecer jurídico. Para dúvidas de legislação trabalhista, indique validar com o DP ou a contabilidade.",
    "- Datas na resposta no formato DD/MM/AAAA.",
  ].join("\n");
}

export async function askAssistant(viewer: Viewer, history: ChatTurn[], question: string) {
  if (!env.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const tools = toolsFor(viewer).map((t) => t.definition);
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: question },
  ];
  const used: string[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 1500,
      system: systemPrompt(viewer),
      tools,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { answer: text || "Não encontrei uma resposta para isso.", toolsUsed: used };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      used.push(block.name);
      const output = await runTool(viewer, block.name, (block.input ?? {}) as Record<string, unknown>);
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output).slice(0, 60_000) });
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "A consulta ficou complexa demais. Tente dividir a pergunta em partes menores.", toolsUsed: used };
}

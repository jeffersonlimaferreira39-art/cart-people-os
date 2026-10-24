"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { askAssistant } from "@/lib/ai/assistant";

const MAX_PER_HOUR = 60;

const schema = z.object({
  question: z.string().trim().min(3, "Escreva a pergunta.").max(1000, "Pergunta longa demais."),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(20)
    .default([]),
});

export type AskResult = { ok: true; answer: string } | { ok: false; error: string };

export async function ask(input: { question: string; history: { role: "user" | "assistant"; content: string }[] }): Promise<AskResult> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "useAssistant")) return { ok: false, error: "Seu perfil não usa o assistente." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { count } = await supabase
    .from("ai_query_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", viewer.userId)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= MAX_PER_HOUR) return { ok: false, error: "Limite de perguntas por hora atingido. Tente mais tarde." };

  try {
    const { answer, toolsUsed } = await askAssistant(viewer, parsed.data.history, parsed.data.question);
    await supabase.from("ai_query_log").insert({
      organization_id: viewer.organization.id,
      user_id: viewer.userId,
      question: parsed.data.question,
      tools_used: [...new Set(toolsUsed)],
    });
    return { ok: true, answer };
  } catch (e) {
    console.error("assistente:", e instanceof Error ? e.message : e);
    return { ok: false, error: "O assistente não respondeu agora. Tente de novo em instantes." };
  }
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { AssistantChat } from "./chat";

export const metadata: Metadata = { title: "Assistente" };

export default function AssistantPage() {
  return (
    <>
      <PageHeader
        title="Assistente"
        description="Perguntas em linguagem natural sobre os dados que você já pode ver. Dados pessoais sensíveis ficam de fora."
      />
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "useAssistant")) return <AccessDenied what="assistente" />;
  if (!env.anthropicApiKey) {
    return (
      <Notice tone="attention" title="O assistente ainda não foi configurado.">
        Defina a variável ANTHROPIC_API_KEY no ambiente (Vercel) para ativá-lo.
      </Notice>
    );
  }
  const suggestions = [
    "Quantas pessoas temos por departamento?",
    "Quem está de férias nos próximos 30 dias?",
    "Qual foi a rotatividade nos últimos 12 meses?",
    ...(viewerCan(viewer, "viewTime") ? ["Quem fez mais horas extras no mês passado?"] : []),
    "Quem está há mais de um ano sem férias?",
  ];
  return <AssistantChat suggestions={suggestions} />;
}

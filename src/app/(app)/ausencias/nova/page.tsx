import type { Metadata } from "next";
import { Suspense } from "react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { listRequestableEmployees } from "@/lib/data/leaves";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Notice } from "@/components/ui/notice";
import { LeaveForm } from "./leave-form";
import { requestLeave } from "../actions";

export const metadata: Metadata = { title: "Solicitar ausência" };

export default function NewLeavePage(props: PageProps<"/ausencias/nova">) {
  return (
    <>
      <PageHeader title="Solicitar ausência" />
      <Suspense fallback={<Skeleton className="h-96 max-w-2xl" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/ausencias/nova">["searchParams"] }) {
  const viewer = await getViewer();
  const sp = await searchParams;
  const canForOthers = viewerCan(viewer, "decideLeaves") || viewerCan(viewer, "managePeople");
  const people = canForOthers
    ? await listRequestableEmployees(viewer)
    : viewer.employee
      ? [{ id: viewer.employee.id, full_name: viewer.employee.full_name, registration_number: "" }]
      : [];
  if (!people.length) {
    return <Notice tone="attention">Seu usuário ainda não está vinculado a um cadastro de colaborador. Fale com o RH.</Notice>;
  }
  const wanted = typeof sp.colaborador === "string" ? sp.colaborador : viewer.employee?.id;
  return <LeaveForm action={requestLeave} people={people} defaultEmployeeId={wanted} />;
}

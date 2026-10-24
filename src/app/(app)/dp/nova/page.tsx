import type { Metadata } from "next";
import { Suspense } from "react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { listRequestableEmployees } from "@/lib/data/leaves";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { DpForm } from "./dp-form";
import { createDpEvent } from "../actions";

export const metadata: Metadata = { title: "Nova movimentação" };

export default function NewDpPage(props: PageProps<"/dp/nova">) {
  return (
    <>
      <PageHeader title="Nova movimentação" />
      <Suspense fallback={<Skeleton className="h-96 max-w-2xl" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/dp/nova">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "manageDp")) return <AccessDenied what="registro de movimentações" />;
  const [people, sp] = await Promise.all([listRequestableEmployees(viewer), searchParams]);
  return (
    <DpForm
      action={createDpEvent}
      people={people}
      defaultEmployeeId={typeof sp.colaborador === "string" ? sp.colaborador : undefined}
    />
  );
}

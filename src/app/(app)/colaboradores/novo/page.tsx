import type { Metadata } from "next";
import { Suspense } from "react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { getLookups } from "@/lib/data/employees";
import { PageHeader } from "@/components/ui/page-header";
import { AccessDenied } from "@/components/ui/access-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeForm } from "../employee-form";
import { createEmployee } from "../actions";

export const metadata: Metadata = { title: "Cadastrar colaborador" };

export default function NewEmployeePage() {
  return (
    <>
      <PageHeader title="Cadastrar colaborador" description="Os dados pessoais ficam separados e protegidos do restante do cadastro." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewEmployeeForm />
      </Suspense>
    </>
  );
}

async function NewEmployeeForm() {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "managePeople")) return <AccessDenied what="cadastro de colaboradores" />;
  const lookups = await getLookups(viewer);
  return (
    <EmployeeForm
      action={createEmployee}
      lookups={lookups}
      showSensitive={viewerCan(viewer, "viewSensitive")}
      canCreateAdmission={viewerCan(viewer, "manageDp")}
      defaultUnitId={viewer.selectedUnitId}
      cancelHref="/colaboradores"
    />
  );
}

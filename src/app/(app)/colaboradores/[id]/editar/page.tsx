import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getViewer, viewerCanInUnit, viewerCan } from "@/lib/auth/viewer";
import { getEmployeeDetail, getLookups } from "@/lib/data/employees";
import { PageHeader } from "@/components/ui/page-header";
import { AccessDenied } from "@/components/ui/access-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeForm } from "../../employee-form";
import { updateEmployee } from "../../actions";

export const metadata: Metadata = { title: "Editar colaborador" };

export default function EditEmployeePage(props: PageProps<"/colaboradores/[id]/editar">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EditContent params={props.params} />
    </Suspense>
  );
}

async function EditContent({ params }: { params: PageProps<"/colaboradores/[id]/editar">["params"] }) {
  const { id } = await params;
  const viewer = await getViewer();
  const detail = await getEmployeeDetail(viewer, id);
  if (!detail) notFound();
  if (!viewerCanInUnit(viewer, "managePeople", detail.employee.unit_id)) {
    return <AccessDenied what="edição deste cadastro" />;
  }
  const lookups = await getLookups(viewer);
  return (
    <>
      <PageHeader title={`Editar ${detail.employee.full_name}`} />
      <EmployeeForm
        action={updateEmployee.bind(null, id)}
        lookups={lookups}
        employee={detail.employee}
        sensitive={detail.sensitive}
        showSensitive={viewerCan(viewer, "viewSensitive")}
        cancelHref={`/colaboradores/${id}`}
      />
    </>
  );
}

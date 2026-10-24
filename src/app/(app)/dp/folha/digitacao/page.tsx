import type { Metadata } from "next";
import { Suspense } from "react";
import { getViewer, unitLabel, viewerCan } from "@/lib/auth/viewer";
import { getGridData } from "@/lib/data/payroll";
import { todayIn } from "@/lib/domain/dates";
import { formatPeriod } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { PayrollGrid } from "./grid";
import { saveGrid } from "../actions";

export const metadata: Metadata = { title: "Digitação de folha" };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function GridPage(props: PageProps<"/dp/folha/digitacao">) {
  return (
    <Suspense fallback={<><div className="mb-6 h-24" /><TableSkeleton rows={10} /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/dp/folha/digitacao">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewSensitive")) return <AccessDenied what="a digitação de folha" />;
  const sp = await searchParams;
  const wanted = typeof sp.competencia === "string" ? sp.competencia : "";
  const period = PERIOD_RE.test(wanted) ? wanted : todayIn().slice(0, 7);
  const data = await getGridData(viewer, period);

  return (
    <>
      <PageHeader
        eyebrow="Departamento Pessoal"
        title="Digitação de folha"
        description={`${unitLabel(viewer)} · competência ${formatPeriod(period).toLowerCase()}. Lançamentos variáveis de todos os colaboradores numa só tela.`}
        actions={
          <>
            <form className="flex items-end gap-2">
              <label>
                <span className="sr-only">Competência</span>
                <Input type="month" name="competencia" defaultValue={period} className="w-40" />
              </label>
              <Button type="submit" variant="secondary">Ver</Button>
            </form>
            <ButtonLink href={`/dp/folha?competencia=${period}`} variant="ghost">Ver prévia</ButtonLink>
          </>
        }
      />
      {data.employees.length ? (
        <PayrollGrid employees={data.employees} saved={data.saved} ponto={data.ponto} save={saveGrid.bind(null, period)} />
      ) : (
        <EmptyState title="Ninguém com vínculo nesta competência">Escolha outra competência ou unidade.</EmptyState>
      )}
    </>
  );
}

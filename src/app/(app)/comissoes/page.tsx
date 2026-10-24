import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer, unitLabel, viewerCan, type Viewer } from "@/lib/auth/viewer";
import { getSettlement, listPayments, listPlans, listSales, listSellers } from "@/lib/data/commissions";
import { listEmployees } from "@/lib/data/employees";
import { todayIn } from "@/lib/domain/dates";
import { categoryLabel } from "@/lib/domain/commission-import";
import { formatDate, formatMoney, formatPeriod } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { cn } from "@/components/ui/cn";
import { ActionButton, ImportForm, PlanForm, SaleForm, SellerForm } from "./forms";
import { addSale, importPayments, importSales, postToPayroll, removeSeller, savePlan, saveSeller, setSaleStatus } from "./actions";

export const metadata: Metadata = { title: "Comissões" };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TABS = [
  { id: "apuracao", label: "Apuração" },
  { id: "vendas", label: "Vendas" },
  { id: "recebimentos", label: "Recebimentos" },
  { id: "planos", label: "Planos e vendedores" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const SOURCE_LABEL = { categoria: "categoria", vendedor: "% do vendedor", faixa: "faixa da meta", padrão: "padrão" } as const;

export default function CommissionsPage(props: PageProps<"/comissoes">) {
  return (
    <Suspense fallback={<><div className="mb-6 h-24" /><TableSkeleton rows={8} /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/comissoes">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewSensitive")) return <AccessDenied what="as comissões" />;
  const sp = await searchParams;
  const wanted = typeof sp.competencia === "string" ? sp.competencia : "";
  const period = PERIOD_RE.test(wanted) ? wanted : todayIn().slice(0, 7);
  const tab = (TABS.find((t) => t.id === sp.aba)?.id ?? "apuracao") as Tab;

  return (
    <>
      <PageHeader
        eyebrow="Departamento Pessoal"
        title="Comissões"
        description={`${unitLabel(viewer)} · competência ${formatPeriod(period).toLowerCase()}. Regras por plano: % fixo, faixas por meta e % por categoria, sobre a venda ou sobre o recebido.`}
        actions={
          <form className="flex items-end gap-2">
            <input type="hidden" name="aba" value={tab} />
            <label>
              <span className="sr-only">Competência</span>
              <Input type="month" name="competencia" defaultValue={period} className="w-40" />
            </label>
            <Button type="submit" variant="secondary">Ver</Button>
          </form>
        }
      />
      <nav aria-label="Seções de comissões" className="mb-5 flex flex-wrap gap-1 rounded-[var(--radius-control)] border border-line-strong bg-surface/60 p-1 sm:w-fit">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/comissoes?aba=${t.id}&competencia=${period}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={cn("rounded-[6px] px-3 py-1.5 text-[13px] transition-colors", t.id === tab ? "bg-accent font-medium text-accent-ink" : "text-ink-2 hover:text-ink")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "apuracao" ? <Settlement viewer={viewer} period={period} /> : null}
      {tab === "vendas" ? <Sales viewer={viewer} period={period} /> : null}
      {tab === "recebimentos" ? <Payments viewer={viewer} period={period} /> : null}
      {tab === "planos" ? <Plans viewer={viewer} /> : null}
    </>
  );
}

async function Settlement({ viewer, period }: { viewer: Viewer; period: string }) {
  const rows = await getSettlement(viewer, period);
  const ok = rows.filter((r) => r.result);
  const total = ok.reduce((a, r) => a + r.result!.total, 0);
  const base = ok.reduce((a, r) => a + r.result!.base, 0);
  const hit = ok.filter((r) => (r.result!.attainment ?? 0) >= 100).length;
  if (!rows.length) {
    return (
      <Panel>
        <EmptyState title="Nenhum vendedor cadastrado" action={<Link href="/comissoes?aba=planos" className="text-accent hover:underline">Cadastrar plano e vendedores</Link>}>
          Crie um plano de comissão e indique quem são os vendedores, com meta e percentual.
        </EmptyState>
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Comissões do mês" value={formatMoney(total)} note={`${ok.length} vendedor(es)`} tone="accent" />
        <Stat label="Base apurada" value={formatMoney(base)} note="vendas ou recebimentos do mês" />
        <Stat label="Bateram a meta" value={`${hit}/${ok.filter((r) => r.result!.target).length}`} note="vendedores com meta" tone="attention" />
        <Stat label="Comissão média" value={formatMoney(ok.length ? total / ok.length : 0)} note="por vendedor" />
      </div>
      <Panel>
        <Table>
          <THead>
            <tr>
              <Th>Vendedor</Th>
              <Th>Plano</Th>
              <Th className="text-right">Base</Th>
              <Th className="text-right">Meta</Th>
              <Th className="text-right">Atingimento</Th>
              <Th>Composição</Th>
              <Th className="text-right">Comissão</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ seller: s, plan, result: r }) => (
              <Tr key={s.employee_id}>
                <Td>
                  <span className="font-medium text-ink">{s.employee?.full_name}</span>
                  <span className="block text-[12px] text-ink-3">{s.employee?.registration_number} · {s.employee?.unit?.code}</span>
                </Td>
                <Td className="text-ink-2">
                  {plan?.name ?? "—"}
                  <span className="block text-[12px] text-ink-3">{plan?.base === "recebimento" ? "sobre o recebido" : "sobre a venda"}</span>
                </Td>
                <Td className="text-right font-mono">{r ? formatMoney(r.base) : "—"}</Td>
                <Td className="text-right font-mono text-ink-2">{r?.target ? formatMoney(r.target) : "—"}</Td>
                <Td className="text-right">
                  {r?.attainment !== null && r?.attainment !== undefined ? (
                    <Badge tone={r.attainment >= 100 ? "ok" : r.attainment >= 80 ? "attention" : "muted"}>{r.attainment.toLocaleString("pt-BR")}%</Badge>
                  ) : "—"}
                </Td>
                <Td className="text-[12.5px] text-ink-2">
                  {r?.lines.length
                    ? r.lines.map((l) => (
                        <span key={l.category} className="block whitespace-nowrap">
                          {categoryLabel(l.category)}: {formatMoney(l.base)} × {l.rate.toLocaleString("pt-BR")}% <span className="text-ink-3">({SOURCE_LABEL[l.source]})</span>
                        </span>
                      ))
                    : <span className="text-ink-3">sem vendas no mês</span>}
                </Td>
                <Td className="text-right font-mono font-medium text-accent">{r ? formatMoney(r.total) : "—"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[70ch] text-[12.5px] text-ink-3">
          Lançar na folha grava a comissão de cada vendedor como “Comissões” em {formatPeriod(period).toLowerCase()}, substituindo o valor
          anterior desse código. O DSR sobre comissões é calculado na prévia mensal.
        </p>
        <ActionButton
          action={postToPayroll.bind(null, period)}
          label="Lançar comissões na folha"
          variant="primary"
          confirmText={`Lançar ${formatMoney(total)} em comissões na folha de ${formatPeriod(period).toLowerCase()}?`}
        />
      </div>
    </div>
  );
}

async function Sales({ viewer, period }: { viewer: Viewer; period: string }) {
  const [sales, sellers] = await Promise.all([listSales(viewer, period), listSellers(viewer)]);
  const options = sellers.filter((s) => s.active).map((s) => ({ id: s.employee_id, label: `${s.employee?.full_name} · ${s.employee?.registration_number}` }));
  const active = sales.filter((s) => s.status === "ativa");
  const today = todayIn();
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>Lançar venda</SectionTitle>
        <Panel>
          {options.length ? (
            <SaleForm action={addSale} sellers={options} defaultDate={today.startsWith(period) ? today : `${period}-01`} />
          ) : (
            <p className="p-4 text-sm text-ink-2">Cadastre os vendedores em <Link href="/comissoes?aba=planos" className="text-accent hover:underline">Planos e vendedores</Link>.</p>
          )}
        </Panel>
      </section>
      <section>
        <SectionTitle>Importar planilha de vendas</SectionTitle>
        <Panel><ImportForm action={importSales} kind="vendas" /></Panel>
      </section>
      <section>
        <SectionTitle aside={<span className="text-[13px] text-ink-3">{active.length} ativa(s) · {formatMoney(active.reduce((a, s) => a + s.amount, 0))}</span>}>
          Vendas de {formatPeriod(period).toLowerCase()}
        </SectionTitle>
        <Panel>
          {sales.length ? (
            <Table>
              <THead>
                <tr><Th>Data</Th><Th>Vendedor</Th><Th>Pedido</Th><Th>Cliente</Th><Th>Categoria</Th><Th className="text-right">Valor</Th><Th>Situação</Th><Th><span className="sr-only">Ações</span></Th></tr>
              </THead>
              <TBody>
                {sales.map((s) => (
                  <Tr key={s.id} className={cn(s.status === "cancelada" && "opacity-55")}>
                    <Td className="font-mono text-[12.5px]">{formatDate(s.sale_date)}</Td>
                    <Td>{s.employee?.full_name}</Td>
                    <Td className="font-mono text-[12.5px] text-ink-2">{s.order_number ?? "—"}</Td>
                    <Td className="text-ink-2">{s.customer ?? "—"}</Td>
                    <Td className="text-ink-2">{categoryLabel(s.category)}</Td>
                    <Td className="text-right font-mono">{formatMoney(s.amount)}</Td>
                    <Td>{s.status === "ativa" ? <Badge tone="ok">Ativa</Badge> : <Badge tone="muted">Cancelada</Badge>}{s.source === "importacao" ? <span className="ml-1.5 text-[11.5px] text-ink-3">importada</span> : null}</Td>
                    <Td className="text-right">
                      {s.status === "ativa"
                        ? <ActionButton size="sm" variant="ghost" label="Cancelar" action={setSaleStatus.bind(null, s.id, "cancelada")} confirmText="Cancelar esta venda? Ela sai da comissão." />
                        : <ActionButton size="sm" variant="ghost" label="Reativar" action={setSaleStatus.bind(null, s.id, "ativa")} />}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="Nenhuma venda nesta competência">Lance vendas acima ou importe a planilha do sistema de vendas.</EmptyState>
          )}
        </Panel>
      </section>
    </div>
  );
}

async function Payments({ viewer, period }: { viewer: Viewer; period: string }) {
  const payments = await listPayments(viewer, period);
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>Importar recebimentos</SectionTitle>
        <Panel><ImportForm action={importPayments} kind="recebimentos" /></Panel>
        <p className="mt-2 text-[12.5px] text-ink-3">Usados nos planos com base “valor recebido”: a comissão sai no mês em que o cliente paga.</p>
      </section>
      <section>
        <SectionTitle aside={<span className="text-[13px] text-ink-3">{formatMoney(payments.reduce((a, p) => a + p.amount, 0))}</span>}>Recebimentos de {formatPeriod(period).toLowerCase()}</SectionTitle>
        <Panel>
          {payments.length ? (
            <Table>
              <THead><tr><Th>Data</Th><Th>Pedido</Th><Th>Vendedor</Th><Th className="text-right">Valor</Th></tr></THead>
              <TBody>
                {payments.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-mono text-[12.5px]">{formatDate(p.paid_at)}</Td>
                    <Td className="font-mono text-[12.5px] text-ink-2">{p.sale?.order_number ?? "—"}</Td>
                    <Td>{p.sale?.employee?.full_name}</Td>
                    <Td className="text-right font-mono">{formatMoney(p.amount)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="Nenhum recebimento nesta competência" />
          )}
        </Panel>
      </section>
    </div>
  );
}

async function Plans({ viewer }: { viewer: Viewer }) {
  const [plans, sellers, employees] = await Promise.all([listPlans(viewer), listSellers(viewer), listEmployees(viewer, {})]);
  const planOptions = plans.filter((p) => p.active).map((p) => ({ id: p.id, label: p.name }));
  const canEditPlans = viewer.orgWide;
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>Planos de comissão</SectionTitle>
        <div className="flex flex-col gap-3">
          {plans.map((p) => (
            <Panel key={p.id}>
              {canEditPlans ? <PlanForm action={savePlan} plan={p} /> : <p className="p-4 text-sm text-ink">{p.name} · {p.default_rate}%</p>}
            </Panel>
          ))}
          {canEditPlans ? (
            <Panel>
              <p className="eyebrow px-4 pt-4 !text-[10.5px] text-accent">Novo plano</p>
              <PlanForm action={savePlan} />
            </Panel>
          ) : (
            <p className="text-[12.5px] text-ink-3">Planos são mantidos por Admin, RH ou DP com acesso a todas as unidades.</p>
          )}
        </div>
      </section>
      <section>
        <SectionTitle>Vendedores</SectionTitle>
        <Panel>
          {planOptions.length ? (
            <SellerForm action={saveSeller} plans={planOptions} employees={employees.map((e) => ({ id: e.id, label: `${e.full_name} · ${e.registration_number}` }))} />
          ) : (
            <p className="p-4 text-sm text-ink-2">Crie um plano antes de cadastrar vendedores.</p>
          )}
          {sellers.length ? (
            <Table>
              <THead><tr><Th>Vendedor</Th><Th>Plano</Th><Th className="text-right">Meta mensal</Th><Th className="text-right">% próprio</Th><Th>Situação</Th><Th><span className="sr-only">Ações</span></Th></tr></THead>
              <TBody>
                {sellers.map((s) => (
                  <Tr key={s.employee_id} className={cn(!s.active && "opacity-55")}>
                    <Td>{s.employee?.full_name}<span className="block text-[12px] text-ink-3">{s.employee?.registration_number}</span></Td>
                    <Td className="text-ink-2">{plans.find((p) => p.id === s.plan_id)?.name}</Td>
                    <Td className="text-right font-mono">{s.monthly_target ? formatMoney(s.monthly_target) : "—"}</Td>
                    <Td className="text-right font-mono">{s.rate_override !== null ? `${s.rate_override.toLocaleString("pt-BR")}%` : "—"}</Td>
                    <Td>{s.active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="muted">Inativo</Badge>}</Td>
                    <Td className="text-right">{s.active ? <ActionButton size="sm" variant="ghost" label="Desativar" action={removeSeller.bind(null, s.employee_id)} confirmText="Desativar este vendedor? O histórico é mantido." /> : null}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : null}
        </Panel>
        <p className="mt-2 text-[12.5px] text-ink-3">Para mudar meta ou plano de um vendedor, salve-o de novo pelo formulário. Prioridade das regras: % da categoria → % próprio → faixa da meta → % padrão.</p>
      </section>
    </div>
  );
}

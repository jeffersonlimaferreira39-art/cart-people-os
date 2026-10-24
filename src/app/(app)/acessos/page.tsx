import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer, viewerCan, type Viewer } from "@/lib/auth/viewer";
import { isOrgAdmin, listAccessEvents, listAccessUsers, type AccessUser } from "@/lib/data/access";
import { createClient } from "@/lib/supabase/server";
import { ACCESS_EVENTS, REVIEW_DAYS, USER_STATUS_LABELS, describeUserAgent, isAccessEvent, type UserStatus } from "@/lib/domain/access";
import { ROLE_LABELS } from "@/lib/domain/roles";
import { formatDate, formatDateTime } from "@/lib/format";
import { addDays, todayIn } from "@/lib/domain/dates";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { InviteForm } from "../configuracoes/forms";
import { inviteUser } from "../configuracoes/actions";
import { ReviewForm, type ReviewItem } from "./forms";
import { EventsTable, STATUS_TONE, scopeLabel } from "./shared";
import { confirmReview, revokeAccess } from "./actions";

export const metadata: Metadata = { title: "Acessos" };

const TABS = [
  { id: "usuarios", label: "Usuários" },
  { id: "revisao", label: "Revisão periódica" },
  { id: "historico", label: "Histórico de acessos" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function AccessPage(props: PageProps<"/acessos">) {
  return (
    <Suspense fallback={<><div className="mb-6 h-24" /><TableSkeleton rows={8} /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/acessos">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "manageSettings")) return <AccessDenied what="o controle de acesso" />;
  if (!isOrgAdmin(viewer)) {
    return <AccessDenied what="o controle de acesso (exclusivo do administrador geral; administradores de unidade concedem acessos em Configurações)" />;
  }
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.id === sp.aba)?.id ?? "usuarios") as Tab;
  const since30 = addDays(todayIn(), -30);
  const [users, recent] = await Promise.all([listAccessUsers(viewer), listAccessEvents({ since: since30, limit: 2000 })]);
  const count = (s: UserStatus) => users.filter((u) => u.status === s).length;
  const overdue = users.flatMap((u) => u.activeMemberships).filter((m) => m.review.status === "vencida").length;
  const logins = recent.filter((e) => e.event === "login");
  const failures = recent.filter((e) => e.event === "login_falhou").length;

  return (
    <>
      <PageHeader eyebrow="Gestão" title="Controle de acesso" description="Quem entra no People OS, com qual papel, desde quando e de onde." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Usuários ativos" value={count("ativo")} note={`${count("convite_pendente")} convite(s) pendente(s)`} tone="accent" />
        <Stat label="Bloqueados" value={count("bloqueado")} note={`${count("sem_papel")} sem papel ativo`} tone={count("bloqueado") ? "attention" : undefined} />
        <Stat label="Revisões vencidas" value={overdue} note={`papéis sem revisão há ${REVIEW_DAYS}+ dias`} tone={overdue ? "attention" : undefined} />
        <Stat label="Acessos em 30 dias" value={logins.length} note={`${new Set(logins.map((e) => e.user_id)).size} pessoa(s) · ${failures} senha(s) incorreta(s)`} tone="signal" />
      </div>
      <nav aria-label="Seções" className="mb-5 flex flex-wrap gap-1 rounded-[var(--radius-control)] border border-line-strong bg-surface/60 p-1 sm:w-fit">
        {TABS.map((t) => (
          <Link key={t.id} href={`/acessos?aba=${t.id}`} aria-current={t.id === tab ? "page" : undefined}
            className={cn("rounded-[6px] px-3 py-1.5 text-[13px] transition-colors", t.id === tab ? "bg-accent font-medium text-accent-ink" : "text-ink-2 hover:text-ink")}>
            {t.label}
            {t.id === "revisao" && overdue ? <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{overdue}</span> : null}
          </Link>
        ))}
      </nav>
      {tab === "usuarios" ? <Users viewer={viewer} users={users} filter={typeof sp.situacao === "string" ? sp.situacao : ""} /> : null}
      {tab === "revisao" ? <Review viewer={viewer} users={users} /> : null}
      {tab === "historico" ? <History users={users} event={typeof sp.evento === "string" && isAccessEvent(sp.evento) ? sp.evento : undefined} /> : null}
    </>
  );
}

async function Users({ viewer, users, filter }: { viewer: Viewer; users: AccessUser[]; filter: string }) {
  const supabase = await createClient();
  const { data: employees } = await supabase.from("employees").select("id, full_name").is("user_id", null).neq("status", "terminated").order("full_name");
  const shown = users.filter((u) => !filter || u.status === filter);
  return (
    <div className="flex flex-col gap-8">
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="aba" value="usuarios" />
        <label>
          <span className="sr-only">Situação</span>
          <Select name="situacao" defaultValue={filter} className="w-56">
            <option value="">Todas as situações</option>
            {Object.entries(USER_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>
      <Panel>
        {shown.length ? (
          <Table>
            <THead>
              <tr><Th>Usuário</Th><Th>Papéis</Th><Th>Situação</Th><Th className="hidden md:table-cell">Último acesso</Th><Th className="hidden lg:table-cell">Revisão</Th><Th><span className="sr-only">Ações</span></Th></tr>
            </THead>
            <TBody>
              {shown.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <span className="block font-medium text-ink">{u.name ?? u.email}</span>
                    {u.name ? <span className="block text-[12.5px] text-ink-3">{u.email}</span> : null}
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {(u.activeMemberships.length ? u.activeMemberships : u.memberships.filter((m) => m.suspended_at)).map((m) => (
                        <Badge key={m.id} tone={m.active ? "neutral" : "muted"}>{ROLE_LABELS[m.role]} · {m.unit_id ? scopeLabel(viewer, m.unit_id) : "todas"}</Badge>
                      ))}
                      {!u.memberships.some((m) => m.active || m.suspended_at) ? <span className="text-[12.5px] text-ink-3">—</span> : null}
                    </span>
                  </Td>
                  <Td><Badge tone={STATUS_TONE[u.status]}>{USER_STATUS_LABELS[u.status]}</Badge></Td>
                  <Td className="hidden text-[13px] text-ink-2 md:table-cell">
                    {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : "Nunca entrou"}
                    {u.sessions.length ? <span className="block text-[12px] text-ink-3">{u.sessions.length} sessão(ões) ativa(s)</span> : null}
                  </Td>
                  <Td className="hidden lg:table-cell">
                    {u.review ? <Badge tone={u.review === "vencida" ? "danger" : u.review === "vence" ? "attention" : "ok"}>{u.review === "vencida" ? "Vencida" : u.review === "vence" ? "Vence em breve" : "Em dia"}</Badge> : <span className="text-ink-3">—</span>}
                  </Td>
                  <Td className="text-right">
                    <Link href={`/acessos/${u.id}`} className="text-sm text-accent hover:underline">{u.id === viewer.userId ? "Você" : "Gerenciar"}</Link>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title="Nenhum usuário nesta situação" />
        )}
      </Panel>
      <section>
        <SectionTitle>Conceder acesso</SectionTitle>
        <Panel>
          <InviteForm action={inviteUser} units={viewer.units.filter((u) => u.active)} employees={employees ?? []} />
        </Panel>
        <p className="mt-2 text-[13px] text-ink-3">
          Novos usuários recebem um convite por e-mail; quem já tem conta recebe o papel na hora. Não existe cadastro aberto.
        </p>
      </section>
    </div>
  );
}

function Review({ viewer, users }: { viewer: Viewer; users: AccessUser[] }) {
  const items: ReviewItem[] = users
    .flatMap((u) =>
      u.activeMemberships.map((m) => ({
        id: m.id,
        user: u.name ?? u.email,
        detail: `${u.name ? `${u.email} · ` : ""}último acesso ${u.last_sign_in_at ? formatDate(u.last_sign_in_at) : "nunca"}`,
        role: ROLE_LABELS[m.role],
        scope: scopeLabel(viewer, m.unit_id),
        since: m.created_at,
        days: m.review.days,
        status: m.review.status,
        self: u.id === viewer.userId,
        href: `/acessos/${u.id}`,
        revoke: revokeAccess.bind(null, m.id),
      })),
    )
    .sort((a, b) => b.days - a.days);
  return (
    <Panel>
      {items.length ? <ReviewForm action={confirmReview} items={items} /> : <EmptyState title="Nenhum papel ativo" />}
    </Panel>
  );
}

async function History({ users, event }: { users: AccessUser[]; event?: string }) {
  const events = await listAccessEvents({ event, limit: 300 });
  const who = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  const sessions = users.flatMap((u) => u.sessions.map((s) => ({ ...s, user: u.name ?? u.email })));
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>Sessões ativas</SectionTitle>
        <Panel>
          {sessions.length ? (
            <Table>
              <THead><tr><Th>Usuário</Th><Th>Dispositivo</Th><Th className="hidden sm:table-cell">IP</Th><Th>Entrou</Th><Th>Última atividade</Th></tr></THead>
              <TBody>
                {sessions.map((s) => (
                  <Tr key={s.session_id}>
                    <Td><Link href={`/acessos/${s.user_id}`} className="font-medium text-ink hover:underline">{s.user}</Link></Td>
                    <Td className="text-ink-2">{describeUserAgent(s.user_agent)}</Td>
                    <Td className="hidden font-mono text-[12.5px] text-ink-3 sm:table-cell">{s.ip ?? "—"}</Td>
                    <Td className="text-[13px] text-ink-2">{formatDateTime(s.created_at)}</Td>
                    <Td className="text-[13px] text-ink-2">{formatDateTime(s.last_seen)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState title="Nenhuma sessão ativa" />}
        </Panel>
      </section>
      <section>
        <SectionTitle>Eventos</SectionTitle>
        <form className="mb-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="aba" value="historico" />
          <label>
            <span className="sr-only">Evento</span>
            <Select name="evento" defaultValue={event ?? ""} className="w-60">
              <option value="">Todos os eventos</option>
              {Object.entries(ACCESS_EVENTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </label>
          <Button type="submit" variant="secondary">Filtrar</Button>
        </form>
        <Panel>
          {events.length ? <EventsTable events={events} who={who} /> : <EmptyState title="Nenhum evento registrado">Os acessos passam a ser registrados a partir desta versão.</EmptyState>}
        </Panel>
      </section>
    </div>
  );
}

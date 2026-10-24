import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { isOrgAdmin, listAccessEvents, listAccessUsers } from "@/lib/data/access";
import { USER_STATUS_LABELS, describeUserAgent } from "@/lib/domain/access";
import { ROLE_LABELS } from "@/lib/domain/roles";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { ActionButton } from "../../comissoes/forms";
import { MembershipForm } from "../forms";
import { EventsTable, STATUS_TONE, scopeLabel } from "../shared";
import { blockUser, endSessions, resendAccessLink, restoreAccess, revokeAccess, unblockUser, updateMembership } from "../actions";

export const metadata: Metadata = { title: "Usuário" };

export default function AccessUserPage(props: PageProps<"/acessos/[userId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/acessos/[userId]">["params"] }) {
  const { userId } = await params;
  const viewer = await getViewer();
  if (!viewerCan(viewer, "manageSettings") || !isOrgAdmin(viewer)) return <AccessDenied what="o controle de acesso" />;
  const [users, events] = await Promise.all([listAccessUsers(viewer), listAccessEvents({ userId, limit: 100 })]);
  const u = users.find((x) => x.id === userId);
  if (!u) notFound();
  const self = u.id === viewer.userId;
  const who = new Map(users.map((x) => [x.id, x.name ?? x.email]));
  const label = u.name ?? u.email;
  const units = viewer.units.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name }));
  const blocked = u.status === "bloqueado";

  return (
    <>
      <PageHeader
        eyebrow="Controle de acesso"
        title={label}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={STATUS_TONE[u.status]}>{USER_STATUS_LABELS[u.status]}</Badge>
            {u.name ? <span>{u.email}</span> : null}
            <span className="text-ink-3">último acesso {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : "nunca"}</span>
          </span>
        }
        actions={
          <>
            {u.employeeId ? <ButtonLink href={`/colaboradores/${u.employeeId}`} variant="secondary">Ver cadastro</ButtonLink> : null}
            <ButtonLink href="/acessos" variant="ghost">Voltar</ButtonLink>
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section>
            <SectionTitle>Papéis</SectionTitle>
            <Panel>
              {u.memberships.length ? (
                <ul className="divide-y divide-line">
                  {u.memberships.map((m) => (
                    <li key={m.id} className="flex flex-col gap-3 p-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium text-ink">{ROLE_LABELS[m.role]}</span>
                        <span className="text-[13px] text-ink-2">{scopeLabel(viewer, m.unit_id)}</span>
                        {m.active ? (
                          <Badge tone={m.review.status === "vencida" ? "danger" : m.review.status === "vence" ? "attention" : "ok"}>
                            revisado há {m.review.days} dia(s)
                          </Badge>
                        ) : (
                          <Badge tone="muted">{m.suspended_at ? `Suspenso em ${formatDate(m.suspended_at)}` : "Revogado"}</Badge>
                        )}
                        <span className="text-[12px] text-ink-3">desde {formatDate(m.created_at)}</span>
                      </div>
                      {self ? (
                        <p className="text-[12.5px] text-ink-3">O seu próprio acesso só é alterado por outro administrador geral.</p>
                      ) : m.active ? (
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <MembershipForm action={updateMembership.bind(null, m.id)} role={m.role} unitId={m.unit_id} units={units} />
                          <ActionButton size="sm" variant="ghost" label="Revogar" action={revokeAccess.bind(null, m.id)} confirmText={`Revogar ${ROLE_LABELS[m.role]} de ${label}?`} />
                        </div>
                      ) : !m.suspended_at ? (
                        <div><ActionButton size="sm" variant="ghost" label="Reativar papel" action={restoreAccess.bind(null, m.id)} /></div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="Nenhum papel nesta organização" />}
            </Panel>
          </section>
          <section>
            <SectionTitle>Histórico de acessos</SectionTitle>
            <Panel>
              {events.length ? <EventsTable events={events} who={who} showUser={false} /> : <EmptyState title="Nenhum evento registrado" />}
            </Panel>
          </section>
        </div>
        <aside className="flex min-w-0 flex-col gap-8">
          {!self ? (
            <section>
              <SectionTitle>Ações</SectionTitle>
              <Panel>
                <div className="flex flex-col items-start gap-4 p-4">
                  {blocked ? (
                    <div>
                      <ActionButton variant="primary" label="Desbloquear acesso" action={unblockUser.bind(null, u.id)} confirmText={`Desbloquear ${label} e reativar os papéis suspensos?`} />
                      <p className="mt-1.5 text-[12.5px] text-ink-3">Reativa os papéis suspensos no bloqueio e libera o login.</p>
                    </div>
                  ) : (
                    <div>
                      <ActionButton variant="danger" label="Bloquear acesso" action={blockUser.bind(null, u.id)} confirmText={`Bloquear ${label}? Os papéis são suspensos, as sessões encerradas e o login bloqueado.`} />
                      <p className="mt-1.5 text-[12.5px] text-ink-3">Efeito imediato. Use em desligamentos, afastamentos ou suspeita de uso indevido.</p>
                    </div>
                  )}
                  <div>
                    <ActionButton label="Encerrar sessões" action={endSessions.bind(null, u.id)} confirmText={`Encerrar todas as sessões de ${label}?`} />
                    <p className="mt-1.5 text-[12.5px] text-ink-3">Desconecta todos os dispositivos (em até 1 hora para páginas já abertas).</p>
                  </div>
                  {!blocked ? (
                    <div>
                      <ActionButton label={u.last_sign_in_at ? "Enviar link de nova senha" : "Reenviar convite"} action={resendAccessLink.bind(null, u.id)} />
                      <p className="mt-1.5 text-[12.5px] text-ink-3">O usuário recebe por e-mail um link para definir a senha.</p>
                    </div>
                  ) : null}
                </div>
              </Panel>
            </section>
          ) : null}
          <section>
            <SectionTitle>Sessões ativas</SectionTitle>
            <Panel>
              {u.sessions.length ? (
                <ul className="divide-y divide-line">
                  {u.sessions.map((s) => (
                    <li key={s.session_id} className="px-4 py-2.5 text-[13px]">
                      <span className="block text-ink">{describeUserAgent(s.user_agent)}</span>
                      <span className="block font-mono text-[11.5px] text-ink-3">{s.ip ?? "—"}</span>
                      <span className="block text-[12px] text-ink-3">entrou {formatDateTime(s.created_at)} · ativo {formatDateTime(s.last_seen)}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="Nenhuma sessão ativa" />}
            </Panel>
          </section>
        </aside>
      </div>
    </>
  );
}

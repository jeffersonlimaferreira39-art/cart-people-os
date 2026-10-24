import Link from "next/link";
import type { Viewer } from "@/lib/auth/viewer";
import type { AccessEventRow } from "@/lib/data/access";
import { ACCESS_EVENTS, describeUserAgent, isAccessEvent, type UserStatus } from "@/lib/domain/access";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";

export const STATUS_TONE: Record<UserStatus, "ok" | "attention" | "danger" | "muted"> = {
  ativo: "ok",
  convite_pendente: "attention",
  bloqueado: "danger",
  sem_papel: "muted",
};

export function scopeLabel(viewer: Viewer, unitId: string | null) {
  return unitId ? (viewer.units.find((u) => u.id === unitId)?.name ?? "Unidade") : "Todas as unidades";
}

export function EventsTable({ events, who, showUser = true }: { events: AccessEventRow[]; who: Map<string, string>; showUser?: boolean }) {
  return (
    <Table>
      <THead>
        <tr><Th>Quando</Th>{showUser ? <Th>Usuário</Th> : null}<Th>Evento</Th><Th className="hidden md:table-cell">Dispositivo</Th><Th className="hidden sm:table-cell">IP</Th></tr>
      </THead>
      <TBody>
        {events.map((e) => (
          <Tr key={e.id}>
            <Td className="whitespace-nowrap text-[13px] text-ink-2">{formatDateTime(e.created_at)}</Td>
            {showUser ? <Td><Link href={`/acessos/${e.user_id}`} className="text-ink hover:underline">{who.get(e.user_id) ?? "Usuário"}</Link></Td> : null}
            <Td>
              <Badge tone={e.event === "login_falhou" || e.event === "bloqueio" ? "danger" : e.event === "login" ? "ok" : "neutral"}>
                {isAccessEvent(e.event) ? ACCESS_EVENTS[e.event] : e.event}
              </Badge>
              {e.actor_id ? <span className="ml-2 text-[12px] text-ink-3">por {who.get(e.actor_id) ?? "administrador"}</span> : null}
            </Td>
            <Td className="hidden text-[13px] text-ink-2 md:table-cell">{describeUserAgent(e.user_agent)}</Td>
            <Td className="hidden font-mono text-[12.5px] text-ink-3 sm:table-cell">{e.ip ?? "—"}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

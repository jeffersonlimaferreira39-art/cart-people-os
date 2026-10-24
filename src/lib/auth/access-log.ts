import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/domain/access";

type LoginEvent = "login" | "login_falhou" | "link_enviado" | "logout";

/**
 * Registra um evento de acesso depois da resposta (não atrasa o login). Usa a
 * chave secreta porque o usuário ainda não está autenticado; a função no banco
 * só aceita eventos de login e ignora e-mails que não são de usuários.
 */
export async function recordAccess(email: string | null | undefined, event: LoginEvent) {
  if (!email) return;
  const h = await headers();
  const ip = clientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const ua = h.get("user-agent");
  after(async () => {
    try {
      await createAdminClient().rpc("record_access_event", { p_email: email, p_event: event, p_ip: ip, p_user_agent: ua });
    } catch {
      // Falha no registro não pode impedir o acesso.
    }
  });
}

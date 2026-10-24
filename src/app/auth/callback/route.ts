import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { recordAccess } from "@/lib/auth/access-log";

/** Conclui login por link mágico ou convite (PKCE ou token_hash). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const rawNext = url.searchParams.get("next") ?? "/painel";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/painel";
  const supabase = await createClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  let email: string | undefined;
  if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code);
    ok = !r.error;
    email = r.data.user?.email;
  } else if (tokenHash && type) {
    const r = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !r.error;
    email = r.data.user?.email;
  } else {
    // Sem code nem token_hash: a sessão está no fragmento (#access_token), lido no navegador.
    const confirm = url.clone();
    confirm.pathname = "/auth/confirm";
    confirm.search = "";
    confirm.searchParams.set("next", next);
    return NextResponse.redirect(confirm);
  }

  const target = url.clone();
  target.search = "";
  if (ok) {
    await recordAccess(email, "login");
    // Convite: primeiro acesso leva à definição de senha.
    target.pathname = type === "invite" || type === "recovery" ? "/meus-dados/senha" : next;
  } else {
    target.pathname = "/login";
    target.searchParams.set("erro", "link");
  }
  return NextResponse.redirect(target);
}

"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Links do Auth com o template padrão do Supabase (convites feitos pelo painel ou
 * pela API admin) trazem a sessão no fragmento da URL, que o servidor não lê.
 */
export function ConfirmSession() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const type = hash.get("type");
    const rawNext = searchParams.get("next") ?? "/painel";
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/painel";

    if (!accessToken || !refreshToken) {
      router.replace("/login?erro=link");
      return;
    }
    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) return router.replace("/login?erro=link");
        // Convite: primeiro acesso leva à definição de senha.
        router.replace(type === "invite" || type === "recovery" ? "/meus-dados/senha" : next);
        router.refresh();
      });
  }, [router, searchParams]);

  return null;
}

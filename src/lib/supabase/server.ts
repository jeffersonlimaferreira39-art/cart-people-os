import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Cliente do Supabase com a sessão do usuário. Toda leitura e escrita de domínio
 * passa por ele, portanto sob as políticas RLS.
 */
export async function createClient() {
  // Dados de pessoas são sempre por requisição: fica fora de qualquer pré-renderização
  // (o cliente do Auth lê o relógio ao carregar a sessão).
  await connection();
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado durante a renderização de Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}

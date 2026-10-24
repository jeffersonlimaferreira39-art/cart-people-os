import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente com a chave secreta: ignora RLS. Use apenas em Server Actions que já
 * verificaram o papel do usuário, e somente para operações sem alternativa sob
 * RLS (ex.: convidar usuário no Auth). Nunca importe em código de cliente.
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

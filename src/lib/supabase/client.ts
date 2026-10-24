import { createBrowserClient } from "@supabase/ssr";

/** Cliente do navegador: usado só para gravar a sessão vinda de links do Auth. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/auth"];
/** Única página liberada enquanto o usuário usa a senha provisória criada pelo administrador. */
export const PASSWORD_PATH = "/meus-dados/senha";

/** Renova a sessão do Supabase e faz o redirecionamento otimista para o login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims valida o JWT; não insira código entre a criação do cliente e esta chamada.
  const { data } = await supabase.auth.getClaims();
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data?.claims && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    if (request.nextUrl.pathname !== "/") login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  const appMeta = data?.claims?.app_metadata as { must_change_password?: boolean } | undefined;
  if (appMeta?.must_change_password && !isPublic && request.nextUrl.pathname !== PASSWORD_PATH) {
    const target = request.nextUrl.clone();
    target.pathname = PASSWORD_PATH;
    target.search = "";
    // 303: também converte POSTs de outras páginas em GET, sem reenviar o corpo.
    // Leva junto os cookies da sessão eventualmente renovada acima.
    const redirect = NextResponse.redirect(target, 303);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
